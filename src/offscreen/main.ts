import { localePref } from '../i18n';
import { readableFolderFiles } from '../lib/folders';
import type { Broadcast, ToBackground, ToOffscreen } from '../lib/messages';
import type { FromWorker, HostApi, ToWorker } from './rpc';

const IDLE_CLOSE_MS = 30_000;

// Recent log lines (the worker's too), readable from DevTools as `__tpLog` when debugging the pipeline.
const logBuf: string[] = [];
(globalThis as { __tpLog?: string[] }).__tpLog = logBuf;
const print = { log: console.log.bind(console), warn: console.warn.bind(console), error: console.error.bind(console) };
for (const level of ['log', 'warn', 'error'] as const) {
  console[level] = (...args: unknown[]) => {
    logBuf.push(`${level}: ${args.map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}`);
    if (logBuf.length > 200) logBuf.shift();
    print[level](...args);
  };
}

/** First frame of a video blob, via a detached <video> element (workers have no DOM). */
async function videoFrame(blob: Blob): Promise<ImageBitmap> {
  const v = document.createElement('video');
  v.muted = true;
  v.src = URL.createObjectURL(blob);
  try {
    await new Promise<void>((res, rej) => {
      v.onloadeddata = () => res();
      v.onerror = () => rej(new Error('video decode failed'));
    });
    v.currentTime = Math.min(0.5, v.duration / 2 || 0);
    await new Promise((res) => (v.onseeked = res));
    return await createImageBitmap(v);
  } finally {
    URL.revokeObjectURL(v.src);
  }
}

const hostApi: HostApi = { videoFrame, folderFiles: readableFolderFiles };

let worker: Worker | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let whenDone: (() => void)[] = [];

const toWorker = (m: ToWorker, transfer: Transferable[] = []) => worker?.postMessage(m, transfer);

/** Ends the worker (freeing both models and their GPU memory) once it has been idle a while. */
function finished() {
  for (const f of whenDone) f();
  whenDone = [];
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    worker?.terminate();
    worker = undefined;
    // lets the service worker close this document
    chrome.runtime.sendMessage({ to: 'bg', type: 'offscreen-idle' } satisfies ToBackground).catch(() => {});
  }, IDLE_CLOSE_MS);
}

async function onCall(m: Extract<FromWorker, { type: 'call' }>) {
  try {
    const value = await (hostApi[m.name] as (...a: unknown[]) => Promise<unknown>)(...m.args);
    toWorker({ type: 'reply', id: m.id, value }, value instanceof ImageBitmap ? [value] : []);
  } catch (e) {
    toWorker({ type: 'reply', id: m.id, error: e instanceof Error ? e.message : String(e) });
  }
}

function startWorker() {
  const w = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  w.onmessage = (e: MessageEvent<FromWorker>) => {
    const m = e.data;
    if (m.type === 'log') console[m.level](m.text);
    else if (m.type === 'call') void onCall(m);
    else if (m.type === 'queue-updated') {
      chrome.runtime.sendMessage({ to: 'all', type: 'queue-updated', count: m.count } satisfies Broadcast).catch(() => {});
    } else finished();
  };
  // A worker that fails to load or crashes counts as done; the next refill starts a new one.
  w.onerror = (e) => {
    console.warn('[offscreen] worker failed', e.message);
    w.terminate();
    if (worker === w) worker = undefined;
    finished();
  };
  return w;
}

/**
 * Makes scenes until the queue is full, in a worker. Resolves when it's done.
 * Firefox has no offscreen documents: there its background page imports this and calls it directly.
 */
export function refill(msg: ToOffscreen) {
  clearTimeout(idleTimer);
  worker ??= startWorker();
  toWorker({ type: 'refill', msg, locale: localePref() });
  return new Promise<void>((res) => whenDone.push(res));
}

chrome.runtime.onMessage.addListener((msg: ToOffscreen, _sender, sendResponse) => {
  if (msg?.to !== 'offscreen') return;
  if (msg.type === 'refill') void refill(msg);
  sendResponse({ ack: true });
});
