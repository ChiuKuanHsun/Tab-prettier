import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Scene, Upload } from './types';

/** The scene on screen, when it was first shown and how many new tabs have shown it. */
export interface ShownScene { scene: Scene; shownAt: number; views: number }
export interface FavoriteScene extends Scene { favAt: number }

interface TabDB extends DBSchema {
  /** Ready-to-show scenes, oldest first. */
  queue: { key: string; value: Scene; indexes: { byCreated: number } };
  /** Singleton record 'current': the scene on screen and when it was first shown. */
  current: { key: string; value: ShownScene };
  favorites: { key: string; value: FavoriteScene };
  uploads: { key: string; value: Upload };
  /** Generic cache: API pools, AniList responses. */
  kv: { key: string; value: { v: unknown; t: number } };
}

let dbp: Promise<IDBPDatabase<TabDB>> | undefined;

export function db() {
  dbp ??= openDB<TabDB>('tab-prettier', 1, {
    upgrade(d) {
      d.createObjectStore('queue', { keyPath: 'id' }).createIndex('byCreated', 'createdAt');
      d.createObjectStore('current');
      d.createObjectStore('favorites', { keyPath: 'id' });
      d.createObjectStore('uploads', { keyPath: 'id' });
      d.createObjectStore('kv');
    },
  });
  return dbp;
}

export async function queueCount() {
  return (await db()).count('queue');
}

export async function enqueue(scene: Scene) {
  await (await db()).put('queue', scene);
}

/** Atomically pops the oldest ready scene, so parallel new tabs never get the same one. */
export async function dequeue(): Promise<Scene | undefined> {
  const tx = (await db()).transaction('queue', 'readwrite');
  const cursor = await tx.store.index('byCreated').openCursor();
  const scene = cursor?.value;
  if (cursor) await cursor.delete();
  await tx.done;
  return scene;
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
