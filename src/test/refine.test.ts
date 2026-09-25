import { describe, expect, it } from 'vitest';
import { alphaMask, hasCharacter, refineMask } from '../offscreen/refine';

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

  it('rejects a cut-out much wider than tall', () => {
    const r = refineMask(maskWith(100, 100, (x, y) => (((x > 2 && x < 20) || (x > 80 && x < 98)) && y > 50 ? 1 : 0)), 100, 100);
    expect(r.reason).toBe('too-wide');
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

describe('alphaMask', () => {
  const rgba = (w: number, h: number, alpha: (x: number, y: number) => number) => {
    const d = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) d[(y * w + x) * 4 + 3] = alpha(x, y);
    return d;
  };

  it('uses the alpha of a cut-out on a transparent background', () => {
    const m = alphaMask(rgba(10, 10, (x, y) => (x >= 3 && x < 7 && y >= 2 ? 255 : 0)), 10, 10);
    expect(m?.[5 * 10 + 5]).toBe(1);
    expect(m?.[0]).toBe(0);
  });

  it('ignores opaque images and ones with only a few transparent pixels', () => {
    expect(alphaMask(rgba(10, 10, () => 255), 10, 10)).toBeUndefined();
    expect(alphaMask(rgba(10, 10, (x, y) => (x === 0 && y === 0 ? 0 : 255)), 10, 10)).toBeUndefined();
  });

  it('ignores transparency that is only in the middle, not around the figure', () => {
    expect(alphaMask(rgba(10, 10, (x, y) => (x > 2 && x < 7 && y > 2 && y < 7 ? 0 : 255)), 10, 10)).toBeUndefined();
  });
});
