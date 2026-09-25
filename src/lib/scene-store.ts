import { countView, db, dequeue, getCurrent, setCurrent, type FavoriteScene, type ShownScene } from './db';
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

/**
 * Scene for this new tab. When the rotation says it's time for a new one, a favourite comes back
 * with probability `favWeight`; otherwise the next queued scene is used (falling back to a
 * favourite when the queue is empty). Otherwise the current scene stays.
 */
export async function pickScene(
  rule: RotationRule,
  favWeight: number,
  force = false,
  bucket?: TimeBucket,
): Promise<Scene | undefined> {
  const cur = await getCurrent();
  if (force || !cur || isDue(cur, rule)) {
    const fav = Math.random() < favWeight ? await randomFavorite(cur?.scene.id) : undefined;
    const next = fav ?? (await dequeue(bucket)) ?? (await randomFavorite(cur?.scene.id));
    if (next) {
      await setCurrent(next);
      return next;
    }
  }
  if (cur && !force) await countView(cur);
  return cur?.scene;
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
