import { describe, expect, it } from 'vitest';
import { analyseEmptiness, chooseCharSide, computeLayout } from '../lib/compose';
import { lightDirection, labStats, transferColors } from '../offscreen/harmonize';

describe('composition', () => {
  it('puts the character on the busier side', () => {
    const w = 90, h = 30;
    const g = new Float32Array(w * h);
    // stripes on the left third only
    for (let y = 0; y < h; y++) for (let x = 0; x < 30; x++) g[y * w + x] = Math.floor(x / 3) % 2 ? 255 : 0;
    const e = analyseEmptiness(g, w, h);
    expect(e.right).toBeGreaterThan(e.left);
    expect(chooseCharSide(e)).toBe('left');
  });

  it('overlaps the clock column into the character', () => {
    const l = computeLayout({ w: 1920, h: 1080 }, 'right', { width: 800, height: 1600, cut: { left: false, right: false, bottom: false } });
    expect(l.char).toBeDefined();
    const c = l.char!;
    expect(l.text.side).toBe('left');
    expect(l.text.inner).toBeGreaterThan(c.left);
    expect(l.text.inner).toBeLessThan(c.left + c.width * 0.3);
    expect(c.height).toBeCloseTo(1080 * 0.9);
    // never hides more than ~half a digit of a 0.3vh clock
    expect(l.text.inner - c.left).toBeLessThanOrEqual(1080 * 0.07 + 0.01);
  });

  it('snaps cropped characters to the viewport edge and caps their width', () => {
    const l = computeLayout({ w: 1600, h: 900 }, 'right', { width: 2000, height: 1800, cut: { left: true, right: true, bottom: true } });
    expect(l.char!.width).toBeLessThanOrEqual(1600 * 0.52 + 0.01);
    expect(l.char!.left + l.char!.width).toBeCloseTo(1600);
  });
});

describe('harmonize', () => {
  it('finds light coming from the upper right', () => {
    const w = 40, h = 40;
    const g = new Float32Array(w * h).fill(20);
    for (let y = 0; y < 10; y++) for (let x = 30; x < 40; x++) g[y * w + x] = 255;
    const d = lightDirection(g, w, h);
    expect(d.x).toBeGreaterThan(0.5);
    expect(d.y).toBeLessThan(-0.5);
  });

  it('moves character colours towards the background mean', () => {
    const n = 64;
    const ch = new Uint8ClampedArray(n * 4);
    const bg = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      ch.set([200 + (i % 8), 60, 60, 255], i * 4);
      bg.set([40, 80, 200 + (i % 8), 255], i * 4);
    }
    const alpha = new Uint8ClampedArray(n).fill(255);
    const before = labStats(ch, alpha, 1);
    transferColors(ch, alpha, before, labStats(bg, undefined, 1), 0.5);
    const after = labStats(ch, alpha, 1);
    const target = labStats(bg, undefined, 1);
    expect(Math.abs(after.mean[2] - target.mean[2])).toBeLessThan(Math.abs(before.mean[2] - target.mean[2]));
  });
});
