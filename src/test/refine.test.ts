import { describe, expect, it } from 'vitest';
import { hasCharacter, refineMask } from '../offscreen/refine';

function maskWith(w: number, h: number, fill: (x: number, y: number) => number) {
  const m = new Float32Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) m[y * w + x] = fill(x, y);
  return m;
}

describe('refineMask', () => {
  it('accepts a centred standing figure and reports its bbox', () => {
    const r = refineMask(maskWith(100, 100, (x, y) => (x >= 35 && x < 65 && y >= 10 ? 1 : 0)), 100, 100);
    expect(r.ok).toBe(true);
    expect(r.bbox).toEqual({ x: 35, y: 10, w: 30, h: 90 });
    expect(r.cut.bottom).toBe(true);
    expect(r.cut.left).toBe(false);
  });

  it('drops small speckles far from the figure', () => {
    const r = refineMask(
      maskWith(100, 100, (x, y) => ((x >= 35 && x < 65 && y >= 10) || (x < 2 && y < 2) ? 1 : 0)),
      100,
      100,
    );
    expect(r.bbox.x).toBe(35);
    expect(r.cut.left).toBe(false);
  });

  it('rejects figures cropped at the top, tiny ones and near-full-frame ones', () => {
    expect(refineMask(maskWith(100, 100, (x) => (x >= 30 && x < 70 ? 1 : 0)), 100, 100).reason).toBe('cut-top');
    expect(refineMask(maskWith(100, 100, (x, y) => (x < 10 && y > 50 && y < 60 ? 1 : 0)), 100, 100).reason).toBe('too-small');
    expect(refineMask(maskWith(100, 100, (_x, y) => (y > 5 ? 1 : 0)), 100, 100).reason).toBe('too-large');
  });

  it('accepts a bust shot cut on three sides', () => {
    const r = refineMask(maskWith(100, 100, (x, y) => (y > 20 && (y > 50 || (x > 30 && x < 70)) ? 1 : 0)), 100, 100);
    expect(r.ok).toBe(true);
    expect(r.cut).toMatchObject({ left: true, right: true, bottom: true });
  });
});

describe('hasCharacter', () => {
  it('flags a background containing a figure', () => {
    expect(hasCharacter(maskWith(100, 100, (x, y) => (x > 40 && x < 60 && y > 50 ? 1 : 0)), 100, 100)).toBe(true);
    expect(hasCharacter(maskWith(100, 100, () => 0.05), 100, 100)).toBe(false);
  });
});
