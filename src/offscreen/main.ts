import { enqueue, queueCount } from '../lib/db';
import type { Broadcast, ToBackground, ToOffscreen } from '../lib/messages';
import { PERF, resolveTier } from '../lib/perf';
import { buildScene } from './pipeline';
import { releaseDepth } from './depth';
import { backend, releaseModel } from './segment';

const IDLE_CLOSE_MS = 30_000;

// Recent log lines, readable from DevTools as `__tpLog` when debugging the pipeline.
const logBuf: string[] = [];
(globalThis as { __tpLog?: string[] }).__tpLog = logBuf;
for (const level of ['log', 'warn', 'error'] as const) {
  const orig = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    logBuf.push(`${level}: ${args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
    if (logBuf.length > 200) logBuf.shift();
    orig(...args);
  };
}
let running = false;
/** The newest request; a running refill switches to it between scenes. */
let latest: ToOffscreen | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

const sameSettings = (a: ToOffscreen, b: ToOffscreen) =>
  JSON.stringify(a.settings) === JSON.stringify(b.settings) && JSON.stringify(a.listAnime) === JSON.stringify(b.listAnime);

async function refill(msg: ToOffscreen) {
  latest = msg;
  if (running) return;
  running = true;
  clearTimeout(idleTimer);
  const blacklist = new Set<string>();
  let failures = 0;
  try {
    while (latest && (await queueCount()) < latest.target && failures < 3) {
      // Every scene follows the newest settings (a regenerate right after changing them must not
      // get scenes made the old way).
      const job = latest;
      for (const id of job.blacklist) blacklist.add(id);
      const t0 = performance.now();
      try {
        const tier = await resolveTier(job.settings.perfTier, true);
        const scene = await buildScene(job.settings, blacklist, PERF[tier], job.listAnime);
        if (!sameSettings(job, latest)) {
          console.log('[offscreen] settings changed while building; scene dropped');
          continue;
        }
        await enqueue(scene);
        failures = 0;
        const count = await queueCount();
        console.log(`[offscreen] scene ready in ${Math.round(performance.now() - t0)}ms (${backend}, ${tier}), queue=${count}`);
        chrome.runtime.sendMessage({ to: 'all', type: 'queue-updated', count } satisfies Broadcast).catch(() => {});
      } catch (e) {
        failures++;
        console.warn('[offscreen] scene failed', e);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** failures));
      }
    }
  } finally {
    running = false;
  }
  // Free the model and let the service worker close this document once idle.
  idleTimer = setTimeout(async () => {
    await Promise.all([releaseModel(), releaseDepth()]);
    chrome.runtime.sendMessage({ to: 'bg', type: 'offscreen-idle' } satisfies ToBackground).catch(() => {});
  }, IDLE_CLOSE_MS);
}

chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
  if (msg?.to !== 'offscreen') return;
  if (msg.type === 'refill') void refill(msg);
  sendResponse({ ack: true });
});
