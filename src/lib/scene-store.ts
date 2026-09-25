import {
  cachedScenes,
  countView,
  db,
  dequeue,
  getCurrent,
  pushHistory,
  setCurrent,
  takeCached,
  type FavoriteScene,
  type ShownScene,
} from './db';
import { getBlacklist } from './settings';
import type { TimeBucket } from './curation';
import type { RotationRule, Scene } from './types';

/** Whether the scene on screen is due to be replaced when a new tab opens. */
export function isDue(cur: Pick<ShownScene, 'shownAt' | 'views'>, rule: RotationRule, now = Date.now()) {
  switch (rule.rotation) {
    case 'tab':
      return true;
    case 'day':
      return new Date(cur.shownAt).toDateString() !== new Date(now).toDateString();
    case 'minutes':
      return now - cur.shownAt >= Math.max(1, rule.rotationMinutes) * 60_000;
    case 'tabs':
      return (cur.views ?? 1) >= Math.max(1, rule.rotationTabs);
  }
}

async function randomFavorite(excludeId?: string): Promise<Scene | undefined> {
  const d = await db();
  const ids = (await d.getAllKeys('favorites')).filter((id) => id !== excludeId);
  if (!ids.length) return undefined;
  const fav = await d.get('favorites', ids[Math.floor(Math.random() * ids.length)]);
  if (!fav) return undefined;
  const { favAt: _favAt, ...scene } = fav;
  return scene;
}

const blocked = (s: Scene, blacklist: Set<string>) =>
  blacklist.has(s.bg.credit.id) || (!!s.char && blacklist.has(s.char.credit.id));

/**
 * A scene from the cache for the cache-only mode: not the one on screen, not blocked since it
 * was made, preferably matching the time of day, and among the least recently shown half so
 * the same few don't keep coming back.
 */
export function pickCached<T extends Scene & { shownAt: number }>(
  pool: T[],
  opts: { excludeId?: string; bucket?: TimeBucket; blacklist: Set<string> },
  rand = Math.random(),
): T | undefined {
  const ok = pool.filter((s) => s.id !== opts.excludeId && !blocked(s, opts.blacklist));
  const timely = ok.filter((s) => !opts.bucket || !s.bucket || s.bucket === opts.bucket);
  const from = (timely.length ? timely : ok).sort((a, b) => a.shownAt - b.shownAt);
  const oldest = from.slice(0, Math.max(1, Math.ceil(from.length / 2)));
  return oldest[Math.floor(rand * oldest.length)];
}

export interface PickOptions {
  /** 0..1 chance that a due rotation brings back a favourite. */
  favWeight: number;
  /** Replace the scene now, whatever the rotation says. */
  force?: boolean;
  /** Time of day to prefer. */
  bucket?: TimeBucket;
  /** Power saving: rotate through stored scenes instead of using up the queue. */
  cacheOnly?: boolean;
}

/**
 * Scene for this new tab. When the rotation says it's time for a new one, a favourite comes back
 * with probability `favWeight`; otherwise the next queued scene is used (falling back to a
 * favourite when the queue is empty) — or, cache-only, any stored scene. Otherwise the current
 * scene stays. The replaced scene is kept in the history.
 */
export async function pickScene(rule: RotationRule, opts: PickOptions): Promise<Scene | undefined> {
  const cur = await getCurrent();
  if (opts.force || !cur || isDue(cur, rule)) {
    const fav = Math.random() < opts.favWeight ? await randomFavorite(cur?.scene.id) : undefined;
    const next = fav ?? (await (opts.cacheOnly ? fromCache(cur?.scene.id, opts.bucket) : dequeue(opts.bucket)));
    const chosen = next ?? (await randomFavorite(cur?.scene.id));
    if (chosen) {
      if (cur && cur.scene.id !== chosen.id) await pushHistory(cur.scene, cur.shownAt);
      await setCurrent(chosen);
      return chosen;
    }
  }
  if (cur && !opts.force) await countView(cur);
  return cur?.scene;
}

async function fromCache(excludeId: string | undefined, bucket?: TimeBucket): Promise<Scene | undefined> {
  const blacklist = new Set(await getBlacklist());
  const picked = pickCached(await cachedScenes(), { excludeId, bucket, blacklist });
  if (!picked) return undefined;
  await takeCached(picked.id);
  const { shownAt: _shownAt, ...scene } = picked;
  return scene;
}

/** Bytes a favourite occupies: it keeps its own copies of the background and cut-out. */
export const favoriteBytes = (f: Scene) => f.bg.blob.size + (f.char?.blob.size ?? 0);

/**
 * Saves a favourite; with a `limit`, drops the oldest favourites beyond it.
 * Returns how many were dropped.
 */
export async function addFavorite(scene: Scene, limit = 0): Promise<number> {
  const d = await db();
  const fav: FavoriteScene = { ...scene, favAt: Date.now() };
  await d.put('favorites', fav);
  if (limit <= 0) return 0;
  const all = await d.getAll('favorites');
  const excess = all.length - limit;
  if (excess <= 0) return 0;
  const oldest = all.sort((a, b) => a.favAt - b.favAt).slice(0, excess);
  const tx = d.transaction('favorites', 'readwrite');
  await Promise.all([...oldest.map((f) => tx.store.delete(f.id)), tx.done]);
  return excess;
}

export async function favoritesUsage() {
  const all = await (await db()).getAll('favorites');
  return { count: all.length, bytes: all.reduce((n, f) => n + favoriteBytes(f), 0) };
}

export async function removeFavorite(id: string) {
  await (await db()).delete('favorites', id);
}

export async function isFavorite(id: string) {
  return !!(await (await db()).getKey('favorites', id));
}
