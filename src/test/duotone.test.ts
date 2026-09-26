import { describe, expect, it } from 'vitest';
import { rgbToHsl, type RGB } from '../lib/color';
import { dropSquareBackground, duotonePixels } from '../lib/duotone';

const px = (...pixels: number[][]) => new Uint8ClampedArray(pixels.flat());
const rgb = (a: Uint8ClampedArray, i: number): RGB => [a[i * 4], a[i * 4 + 1], a[i * 4 + 2]];
const lightness = (a: Uint8ClampedArray, i: number) => rgbToHsl(rgb(a, i))[2];
const hue = (c: RGB) => rgbToHsl(c)[0];

describe('duotonePixels', () => {
  const accents: RGB[] = [[200, 40, 120], [250, 220, 235]]; // a strong one, and a very pale one

  it('keeps the logo readable whatever the accent: deep dark parts, pale light parts, in its hue', () => {
    for (const accent of accents) {
      // YouTube-like: red box, white triangle, a transparent corner
      const a = px([230, 30, 30, 255], [255, 255, 255, 255], [0, 0, 0, 0]);
      duotonePixels(a, accent, true);
      expect(lightness(a, 0)).toBeLessThan(0.4);
      expect(lightness(a, 1)).toBeGreaterThan(0.8);
      expect(Math.abs(hue(rgb(a, 0)) - hue(accent))).toBeLessThan(3); // degrees; pixels round
      expect(a[11]).toBe(0);
    }
  });

  it('stretches a low-contrast icon so both ends still show', () => {
    const a = px([200, 200, 200, 255], [250, 250, 250, 255]);
    duotonePixels(a, accents[0], true);
    expect(lightness(a, 1) - lightness(a, 0)).toBeGreaterThan(0.4);
  });

  it('makes a one-colour icon a silhouette that stands out from its surroundings', () => {
    const onDark = px([20, 20, 20, 255], [22, 22, 22, 128]);
    duotonePixels(onDark, accents[0], true);
    expect(lightness(onDark, 0)).toBeGreaterThan(0.8);
    expect(onDark[7]).toBe(128);
    const onLight = px([20, 20, 20, 255]);
    duotonePixels(onLight, accents[0], false);
    expect(lightness(onLight, 0)).toBeLessThan(0.4);
  });
});

describe('dropSquareBackground', () => {
  // 3×3: white square background with a dark centre
  const square = () => px(...Array.from({ length: 9 }, (_, i) => (i === 4 ? [10, 10, 10, 255] : [255, 255, 255, 255])));

  it('clears a solid background and keeps the logo', () => {
    const a = square();
    dropSquareBackground(a, 3);
    expect(a[3]).toBe(0);
    expect(a[4 * 4 + 3]).toBe(255);
  });

  it('leaves icons with see-through or differing corners alone', () => {
    const a = square();
    a[3] = 0; // transparent top-left corner
    dropSquareBackground(a, 3);
    expect(a[7]).toBe(255);
    const b = square();
    b.set([0, 0, 255], 8 * 4); // bottom-right corner another colour
    dropSquareBackground(b, 3);
    expect(b[3]).toBe(255);
  });
});
