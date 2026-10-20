import { applyPref } from '../i18n';
import { enqueue, queueCount } from '../lib/db';
import type { ToOffscreen } from '../lib/messages';
import { PERF, resolveTier } from '../lib/perf';
import { buildScene } from './pipeline';
import { settle, type FromWorker, type ToWorker } from './rpc';
import { backend } from './segment';

const post = (m: FromWorker) => postMessage(m);

// The page keeps the log (`__tpLog`) and prints it; a worker's console is hard to reach.
for (const level of ['log', 'warn', 'error'] as const) {
  console[level] = (...args: unknown[]) =>
    post({ type: 'log', level, text: args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ') });
}

let running = false;
/** The newest request; a running refill switches to it between scenes. */
let latest: ToOffscreen | undefined;

const sameSettings = (a: ToOffscreen, b: ToOffscreen) =>
  JSON.stringify(a.settings) === JSON.stringify(b.settings) && JSON.stringify(a.listAnime) === JSON.stringify(b.listAnime);

/** Makes scenes until the queue is full, then says it's done (at once if already running). */
async function refill(msg: ToOffscreen) {
  latest = msg;
  if (running) return;
  running = true;
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
        post({ type: 'queue-updated', count });
      } catch (e) {
        failures++;
        console.warn('[offscreen] scene failed', e);
        await new Promise((r) => setTimeout(r, 2000 * 2 ** failures));
      }
    }
  } finally {
    running = false;
    post({ type: 'done' });
  }
}

onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  if (m.type === 'reply') return settle(m);
  applyPref(m.locale);
  void refill(m.msg);
};
