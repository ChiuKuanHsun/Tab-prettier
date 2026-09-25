import { enqueue, queueCount } from '../lib/db';
import type { Broadcast, ToBackground, ToOffscreen } from '../lib/messages';
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
let pending: ToOffscreen | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;

async function refill(msg: ToOffscreen) {
  if (running) {
    pending = msg;
    return;
  }
  running = true;
  clearTimeout(idleTimer);
  const blacklist = new Set(msg.blacklist);
  let failures = 0;
  try {
    while ((await queueCount()) < msg.target && failures < 3) {
      const t0 = performance.now();
      try {
        const scene = await buildScene(msg.settings, blacklist);
        await enqueue(scene);
        failures = 0;
        const count = await queueCount();
        console.log(`[offscreen] scene ready in ${Math.round(performance.now() - t0)}ms (${backend}), queue=${count}`);
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
  if (pending) {
    const next = pending;
    pending = undefined;
    return refill(next);
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
