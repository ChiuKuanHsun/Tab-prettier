import {
  cachedScenes,
  countView,
  db,
  dequeue,
  getCurrent,
  kvGet,
  kvSet,
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

/** A random favourite (not the one on screen), one suiting the time of day if any does. */
export function pickFavorite<T extends Scene>(
  favs: T[],
  opts: { excludeId?: string; bucket?: TimeBucket },
  rand = Math.random(),
): T | undefined {
  const ok = favs.filter((f) => f.id !== opts.excludeId);
  const timely = ok.filter((f) => !opts.bucket || !f.bucket || f.bucket === opts.bucket);
  const from = timely.length ? timely : ok;
  return from[Math.floor(rand * from.length)];
}

/**
 * Favourites-only rotation: a favourite not among the `recent` ones (and not on screen), so each
 * comes round before any repeats. Time of day doesn't matter here.
 */
export function nextInRotation<T extends Scene>(favs: T[], recent: string[], excludeId?: string, rand = Math.random()): T | undefined {
  const ok = favs.filter((f) => f.id !== excludeId);
  const fresh = ok.filter((f) => !recent.includes(f.id));
  const from = fresh.length ? fresh : ok;
  return from[Math.floor(rand * from.length)];
}

const toScene = ({ favAt: _favAt, ...scene }: FavoriteScene): Scene => scene;

async function randomFavorite(excludeId?: string, bucket?: TimeBucket): Promise<Scene | undefined> {
  const fav = pickFavorite(await (await db()).getAll('favorites'), { excludeId, bucket });
  return fav && toScene(fav);
}

const ROTATION_KEY = 'fav:recent';

/**
 * The next favourite for the favourites-only mode. `none` when there are no favourites at all
 * (the usual rules take over); `stay` when the one on screen is the only one.
 */
async function rotateFavorite(excludeId?: string): Promise<Scene | 'none' | 'stay'> {
  const favs = await (await db()).getAll('favorites');
  if (!favs.length) return 'none';
  const recent = (await kvGet<string[]>(ROTATION_KEY)) ?? [];
  const fav = nextInRotation(favs, recent, excludeId);
  if (!fav) return 'stay';
  // remember all but one, so the rotation goes through every favourite before repeating
  await kvSet(ROTATION_KEY, [fav.id, ...recent.filter((id) => id !== fav.id)].slice(0, Math.max(0, favs.length - 1)));
  return toScene(fav);
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
  /** Favourites only, in rotation, ignoring the other rules (while there are favourites). */
  favoritesOnly?: boolean;
}

/**
 * Scene for this new tab. When the rotation says it's time for a new one: in the favourites-only
 * mode, the next favourite in rotation. Otherwise a favourite suiting the time of day comes back
 * with probability `favWeight`, else the next queued scene is used (falling back to a favourite
 * when the queue is empty) — or, cache-only, any stored scene. Otherwise the current scene
 * stays. The replaced scene is kept in the history.
 */
export async function pickScene(rule: RotationRule, opts: PickOptions): Promise<Scene | undefined> {
  const cur = await getCurrent();
  if (opts.force || !cur || isDue(cur, rule)) {
    const rotated = opts.favoritesOnly ? await rotateFavorite(cur?.scene.id) : 'none';
    // the only favourite is already on screen: nothing else to rotate to
    if (rotated === 'stay' && cur) return cur.scene;
    const fav =
      typeof rotated === 'object'
        ? rotated
        : Math.random() < opts.favWeight
          ? await randomFavorite(cur?.scene.id, opts.bucket)
          : undefined;
    const next = fav ?? (await (opts.cacheOnly ? fromCache(cur?.scene.id, opts.bucket) : dequeue(opts.bucket)));
    const chosen = next ?? (await randomFavorite(cur?.scene.id, opts.bucket));
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
