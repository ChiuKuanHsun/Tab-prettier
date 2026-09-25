import { describe, expect, it } from 'vitest';
import { queueTarget } from '../lib/messages';
import { isDue } from '../lib/scene-store';
import type { RotationRule } from '../lib/types';

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
});
