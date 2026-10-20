/**
 * What the scene worker and the page that runs it (the offscreen document, or Firefox's
 * background page) say to each other. The worker does the heavy work off the page's thread —
 * extension pages share one main thread, so work there would stall an open new tab — and asks
 * the page only for what a worker can't do.
 */
import type { LocalePref } from '../i18n';
import type { FolderFile, FolderRole } from '../lib/folders';
import type { ToOffscreen } from '../lib/messages';

/** The page's side: needs the DOM (video decoding) or APIs workers lack (folder permissions). */
export interface HostApi {
  /** A frame from early in the video. */
  videoFrame(blob: Blob): Promise<ImageBitmap>;
  folderFiles(role: FolderRole): Promise<FolderFile[]>;
}

export type ToWorker =
  | { type: 'refill'; msg: ToOffscreen; locale: LocalePref }
  | { type: 'reply'; id: number; value?: unknown; error?: string };

export type FromWorker =
  | { type: 'log'; level: 'log' | 'warn' | 'error'; text: string }
  | { type: 'queue-updated'; count: number }
  /** The queue is full (or making scenes keeps failing); the worker has nothing left to do. */
  | { type: 'done' }
  | { [K in keyof HostApi]: { type: 'call'; id: number; name: K; args: Parameters<HostApi[K]> } }[keyof HostApi];

let nextId = 0;
const waiting = new Map<number, { resolve(v: unknown): void; reject(e: Error): void }>();

/** Worker side: runs `name` on the page. */
export function callHost<K extends keyof HostApi>(name: K, ...args: Parameters<HostApi[K]>): ReturnType<HostApi[K]> {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    waiting.set(id, { resolve, reject });
    postMessage({ type: 'call', id, name, args } as FromWorker);
  }) as ReturnType<HostApi[K]>;
}

/** Worker side: settles the call a reply answers. */
export function settle(m: Extract<ToWorker, { type: 'reply' }>) {
  const w = waiting.get(m.id);
  waiting.delete(m.id);
  if (m.error !== undefined) w?.reject(new Error(m.error));
  else w?.resolve(m.value);
}
