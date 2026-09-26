import { describe, expect, it } from 'vitest';
import { duotonePixels } from '../lib/duotone';

const px = (...pixels: number[][]) => new Uint8ClampedArray(pixels.flat());
const rgb = (a: Uint8ClampedArray, i: number) => [a[i * 4], a[i * 4 + 1], a[i * 4 + 2]];
const accent: [number, number, number] = [200, 40, 120];

describe('duotonePixels', () => {
  it('puts dark parts in the accent and light parts in a pale tint, keeping transparency', () => {
    // YouTube-like: red box, white triangle, a transparent corner
    const a = px([230, 30, 30, 255], [255, 255, 255, 255], [0, 0, 0, 0]);
    duotonePixels(a, accent);
    expect(rgb(a, 0)).toEqual(accent);
    const pale = rgb(a, 1);
    expect(pale.every((v, i) => v > accent[i])).toBe(true);
    expect(a[11]).toBe(0);
  });

  it('stretches a low-contrast icon so both tones still show', () => {
    const a = px([200, 200, 200, 255], [250, 250, 250, 255]);
    duotonePixels(a, accent);
    expect(rgb(a, 0)).toEqual(accent);
    expect(rgb(a, 1)).not.toEqual(accent);
  });

  it('turns a one-colour icon into an accent silhouette', () => {
    const a = px([20, 20, 20, 255], [22, 22, 22, 128]);
    duotonePixels(a, accent);
    expect(rgb(a, 0)).toEqual(accent);
    expect(rgb(a, 1)).toEqual(accent);
    expect(a[7]).toBe(128);
  });
});
