import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { TimeBucket } from './curation';
import { isBirthdayOn } from './list-chars';
import type { Scene, Upload } from './types';

const STALE_OTHER_BUCKET_MS = 3 * 3_600_000;

/** The scene on screen, when it was first shown and how many new tabs have shown it. */
export interface ShownScene { scene: Scene; shownAt: number; views: number }
export interface FavoriteScene extends Scene { favAt: number }
/** A scene that has been on screen, kept so the cache-only mode has more than the queue to show. */
export interface PastScene extends Scene { shownAt: number }

/** How many past scenes to keep (roughly 1 MB each). */
export const HISTORY_LIMIT = 30;

interface TabDB extends DBSchema {
  /** Ready-to-show scenes, oldest first. */
  queue: { key: string; value: Scene; indexes: { byCreated: number } };
  /** Singleton record 'current': the scene on screen and when it was first shown. */
  current: { key: string; value: ShownScene };
  favorites: { key: string; value: FavoriteScene };
  uploads: { key: string; value: Upload };
  /** Generic cache: API pools, AniList responses. */
  kv: { key: string; value: { v: unknown; t: number } };
  /** The last HISTORY_LIMIT scenes that were replaced on screen. */
  history: { key: string; value: PastScene; indexes: { byShown: number } };
}

let dbp: Promise<IDBPDatabase<TabDB>> | undefined;

export function db() {
  dbp ??= openDB<TabDB>('tab-prettier', 2, {
    upgrade(d, oldVersion) {
      if (oldVersion < 1) {
        d.createObjectStore('queue', { keyPath: 'id' }).createIndex('byCreated', 'createdAt');
        d.createObjectStore('current');
        d.createObjectStore('favorites', { keyPath: 'id' });
        d.createObjectStore('uploads', { keyPath: 'id' });
        d.createObjectStore('kv');
      }
      if (oldVersion < 2) d.createObjectStore('history', { keyPath: 'id' }).createIndex('byShown', 'shownAt');
    },
  });
  return dbp;
}

/** Keeps a scene that just left the screen, dropping the oldest beyond HISTORY_LIMIT. */
export async function pushHistory(scene: Scene, shownAt: number) {
  const tx = (await db()).transaction('history', 'readwrite');
  await tx.store.put({ ...scene, shownAt });
  const keys = await tx.store.index('byShown').getAllKeys();
  for (const k of keys.slice(0, Math.max(0, keys.length - HISTORY_LIMIT))) await tx.store.delete(k);
  await tx.done;
}

/**
 * Everything the cache-only mode can show: queued scenes (never shown, so shownAt 0) and past
 * ones. Reading doesn't consume anything; `takeCached` removes the chosen one.
 */
export async function cachedScenes(): Promise<PastScene[]> {
  const d = await db();
  const [queued, past] = await Promise.all([d.getAll('queue'), d.getAll('history')]);
  return [...queued.map((s) => ({ ...s, shownAt: 0 })), ...past];
}

/** Removes a scene picked from the cache (it becomes current, and returns to history later). */
export async function takeCached(id: string) {
  const tx = (await db()).transaction(['queue', 'history'], 'readwrite');
  await Promise.all([tx.objectStore('queue').delete(id), tx.objectStore('history').delete(id), tx.done]);
}

/** Whether any scene at all is stored, so the cache-only mode has something to show. */
export async function hasAnyScene() {
  const d = await db();
  const counts = await Promise.all([d.count('queue'), d.count('history'), d.count('favorites'), d.count('current')]);
  return counts.some((n) => n > 0);
}

export async function queueCount() {
  return (await db()).count('queue');
}

export async function enqueue(scene: Scene) {
  await (await db()).put('queue', scene);
}

/**
 * Atomically pops a ready scene, so parallel new tabs never get the same one: a scene for a
 * birthday that is today first, then the oldest one matching `prefer` (time of day) if any, else
 * the oldest. Scenes made for another time of day that have waited over 3 hours are dropped so
 * the refill can replace them.
 */
export async function dequeue(prefer?: TimeBucket): Promise<Scene | undefined> {
  const tx = (await db()).transaction('queue', 'readwrite');
  const all = await tx.store.index('byCreated').getAll();
  const now = Date.now();
  const pick =
    all.find((s) => isBirthdayOn(s.char?.birthday)) ||
    (prefer && all.find((s) => !s.bucket || s.bucket === prefer)) ||
    all[0];
  for (const s of all) {
    const stale = prefer && s.bucket && s.bucket !== prefer && now - s.createdAt > STALE_OTHER_BUCKET_MS;
    if (s === pick || stale) await tx.store.delete(s.id);
  }
  await tx.done;
  return pick;
}

export async function getCurrent() {
  return (await db()).get('current', 'current');
}

export async function setCurrent(scene: Scene) {
  await (await db()).put('current', { scene, shownAt: Date.now(), views: 1 }, 'current');
}

export async function countView(cur: ShownScene) {
  await (await db()).put('current', { ...cur, views: (cur.views ?? 1) + 1 }, 'current');
}

export async function kvGet<T>(key: string, maxAgeMs = Infinity): Promise<T | undefined> {
  const row = await (await db()).get('kv', key);
  if (!row || Date.now() - row.t > maxAgeMs) return undefined;
  return row.v as T;
}

export async function kvSet(key: string, v: unknown) {
  await (await db()).put('kv', { v, t: Date.now() }, key);
}
