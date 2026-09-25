import { describe, expect, it } from 'vitest';
import { computeLayout } from '../lib/compose';
import {
  classifyBucket,
  DEFAULT_EXCLUDED_TAGS,
  isExcluded,
  moodDistance,
  parseTagList,
  pickCharVariant,
  preferScore,
  tagMatches,
  timeBucket,
} from '../lib/curation';

describe('tag filters', () => {
  it('matches whole hyphenated words only', () => {
    expect(tagMatches('boy', 'boy')).toBe(true);
    expect(tagMatches('cute-boy', 'boy')).toBe(true);
    expect(tagMatches('tomboy', 'boy')).toBe(false);
    expect(tagMatches('cat-ears-headphones', 'cat ears')).toBe(true);
    expect(tagMatches('Cat_Ears', 'cat-ears')).toBe(true);
  });

  it('default exclusions catch male and revealing tags but keep ordinary girls', () => {
    const ex = parseTagList(DEFAULT_EXCLUDED_TAGS);
    expect(isExcluded(['catgirl', 'male'], ex)).toBe(true);
    expect(isExcluded(['negligee', 'sleepy-face'], ex)).toBe(true);
    expect(isExcluded(['school-swimsuit'], ex)).toBe(true);
    expect(isExcluded(['catgirl', 'tomboy', 'hoodie', 'cute'], ex)).toBe(false);
    expect(isExcluded(undefined, ex)).toBe(false);
  });

  it('counts preferred tags', () => {
    expect(preferScore(['white-hair', 'catgirl', 'maid'], parseTagList('catgirl, maid, fox'))).toBe(2);
    expect(parseTagList('a, b，c\nb')).toEqual(['a', 'b', 'c']);
  });
});

describe('time of day', () => {
  it('buckets the clock', () => {
    expect(timeBucket(new Date(2026, 0, 1, 9))).toBe('day');
    expect(timeBucket(new Date(2026, 0, 1, 17, 30))).toBe('evening');
    expect(timeBucket(new Date(2026, 0, 1, 23))).toBe('night');
    expect(timeBucket(new Date(2026, 0, 1, 3))).toBe('night');
  });

  it('classifies what a background looks like', () => {
    expect(classifyBucket([20, 25, 60])).toBe('night');
    expect(classifyBucket([200, 120, 90])).toBe('evening');
    expect(classifyBucket([130, 180, 230])).toBe('day');
  });
});

describe('variants', () => {
  it('only offers close-ups for bust shots and distant shots for full bodies', () => {
    expect(pickCharVariant(true, 0.1)).toBe('closeup');
    expect(pickCharVariant(false, 0.1)).toBe('distant');
    expect(pickCharVariant(true, 0.9)).toBe('standard');
  });

  const vp = { w: 1600, h: 900 };
  const bust = { width: 900, height: 1200, cut: { left: false, right: false, bottom: true } };
  const full = { width: 500, height: 1500, cut: { left: false, right: false, bottom: false } };

  it('enlarges close-ups past the bottom edge but keeps the head in frame', () => {
    const l = computeLayout(vp, 'right', bust, 'closeup').char!;
    expect(l.bottom).toBeLessThan(0);
    expect(vp.h - (l.bottom + l.height)).toBeGreaterThanOrEqual(0); // top of figure is on screen
  });

  it('makes distant figures smaller and lifts them off the edge', () => {
    const std = computeLayout(vp, 'right', full, 'standard').char!;
    const far = computeLayout(vp, 'right', full, 'distant').char!;
    expect(far.height).toBeLessThan(std.height * 0.75);
    expect(far.bottom).toBeGreaterThan(0);
  });

  it('centres the text for scenery-only scenes', () => {
    const l = computeLayout(vp, 'right', undefined, 'scenery');
    expect(l.char).toBeUndefined();
    expect(l.text.side).toBe('center');
    expect((l.text.inner + l.text.outer) / 2).toBeCloseTo(vp.w / 2);
  });
});

describe('colour matching', () => {
  it('prefers characters whose colour mood is close to the background', () => {
    const bg = { mean: [60, 5, -30] as [number, number, number] }; // cool blue scene
    const cool = { mean: [70, 0, -20] as [number, number, number] };
    const warm = { mean: [70, 25, 35] as [number, number, number] };
    expect(moodDistance(cool, bg)).toBeLessThan(moodDistance(warm, bg));
  });
});
