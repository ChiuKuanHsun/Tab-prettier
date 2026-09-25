import { describe, expect, it } from 'vitest';
import { queueTarget } from '../lib/messages';
import { isDue, nextInRotation, pickCached, pickFavorite } from '../lib/scene-store';
import type { RotationRule, Scene } from '../lib/types';

const rule = (r: Partial<RotationRule>): RotationRule => ({ rotation: 'tab', rotationMinutes: 30, rotationTabs: 3, ...r });
const MIN = 60_000;

describe('rotation', () => {
  const t0 = new Date(2026, 8, 25, 14, 0).getTime();

  it('minutes: replaces once the interval has passed, however long ago that was', () => {
    const r = rule({ rotation: 'minutes', rotationMinutes: 15 });
    expect(isDue({ shownAt: t0, views: 1 }, r, t0 + 14 * MIN)).toBe(false);
    expect(isDue({ shownAt: t0, views: 1 }, r, t0 + 15 * MIN)).toBe(true);
    expect(isDue({ shownAt: t0, views: 1 }, r, t0 + 30 * MIN)).toBe(true);
  });

  it('tabs: replaces after the scene has been shown N times', () => {
    const r = rule({ rotation: 'tabs', rotationTabs: 3 });
    expect(isDue({ shownAt: t0, views: 1 }, r, t0)).toBe(false);
    expect(isDue({ shownAt: t0, views: 2 }, r, t0)).toBe(false);
    expect(isDue({ shownAt: t0, views: 3 }, r, t0)).toBe(true);
    expect(isDue({ shownAt: t0, views: 1 }, rule({ rotation: 'tabs', rotationTabs: 1 }), t0)).toBe(true);
  });

  it('day: replaces after midnight, not after 24h', () => {
    const r = rule({ rotation: 'day' });
    const late = new Date(2026, 8, 25, 23, 50).getTime();
    expect(isDue({ shownAt: late, views: 1 }, r, late + 5 * MIN)).toBe(false);
    expect(isDue({ shownAt: late, views: 1 }, r, late + 15 * MIN)).toBe(true);
  });

  it('keeps a deeper queue for frequent rotation', () => {
    expect(queueTarget(rule({ rotation: 'tab' }))).toBe(5);
    expect(queueTarget(rule({ rotation: 'minutes', rotationMinutes: 5 }))).toBe(3);
    expect(queueTarget(rule({ rotation: 'tabs', rotationTabs: 10 }))).toBe(2);
  });

  it('uses a custom queue size when set, capped at 30', () => {
    expect(queueTarget({ ...rule({ rotation: 'tab' }), queueSize: 12 })).toBe(12);
    expect(queueTarget({ ...rule({ rotation: 'tab' }), queueSize: 0 })).toBe(5);
    expect(queueTarget({ ...rule({ rotation: 'tab' }), queueSize: 99 })).toBe(30);
  });
});

describe('pickCached', () => {
  const scene = (id: string, shownAt: number, extra: Partial<Scene> = {}) =>
    ({ id, shownAt, bg: { credit: { id: `bg:${id}` } }, ...extra }) as unknown as Scene & { shownAt: number };
  const none = new Set<string>();

  it('never picks the scene on screen', () => {
    expect(pickCached([scene('a', 1), scene('b', 2)], { excludeId: 'a', blacklist: none }, 0)?.id).toBe('b');
    expect(pickCached([scene('a', 1)], { excludeId: 'a', blacklist: none })).toBeUndefined();
  });

  it('draws from the least recently shown half', () => {
    const pool = [scene('new', 40), scene('old', 10), scene('queued', 0), scene('mid', 30)];
    const picks = [0, 0.49, 0.99].map((r) => pickCached(pool, { blacklist: none }, r)?.id);
    expect(picks).toEqual(['queued', 'queued', 'old']);
  });

  it('skips scenes blocked since they were made, by background or character', () => {
    const pool = [scene('a', 1), scene('b', 2, { char: { credit: { id: 'c:1' } } as Scene['char'] }), scene('c', 3)];
    expect(pickCached(pool, { blacklist: new Set(['bg:a', 'c:1']) }, 0)?.id).toBe('c');
  });

  it('prefers the time of day, but falls back to any scene', () => {
    const pool = [scene('day', 1, { bucket: 'day' }), scene('night', 2, { bucket: 'night' })];
    expect(pickCached(pool, { bucket: 'night', blacklist: none }, 0)?.id).toBe('night');
    expect(pickCached([scene('day', 1, { bucket: 'day' })], { bucket: 'night', blacklist: none })?.id).toBe('day');
  });
});

describe('favourites', () => {
  const fav = (id: string, bucket?: Scene['bucket']) => ({ id, bucket }) as unknown as Scene;

  it('prefer the time of day, falling back to any favourite', () => {
    const favs = [fav('day', 'day'), fav('night', 'night'), fav('old')];
    const night = [0, 0.99].map((r) => pickFavorite(favs, { bucket: 'night' }, r)?.id);
    expect(night).toEqual(['night', 'old']); // untagged older favourites suit any time
    expect(pickFavorite([fav('day', 'day')], { bucket: 'night' })?.id).toBe('day');
    expect(pickFavorite([fav('a')], { excludeId: 'a' })).toBeUndefined();
  });

  it('rotation shows each favourite before repeating one', () => {
    const favs = [fav('a'), fav('b'), fav('c')];
    expect(nextInRotation(favs, ['a', 'b'], 'a', 0)?.id).toBe('c');
    // everything shown recently: any but the one on screen
    expect(nextInRotation(favs, ['a', 'b', 'c'], 'a', 0)?.id).toBe('b');
    expect(nextInRotation([fav('a')], [], 'a')).toBeUndefined();
  });
});
