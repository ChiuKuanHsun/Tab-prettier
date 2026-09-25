import { describe, expect, it } from 'vitest';
import { contrast, hexToRgb, labToRgb, rgbToHex, rgbToLab } from '../lib/color';
import { deriveTheme, quantize } from '../lib/palette';

describe('color', () => {
  it('round-trips Lab within 1 unit', () => {
    for (const [r, g, b] of [[0, 0, 0], [255, 255, 255], [200, 30, 90], [12, 180, 240], [128, 128, 64]]) {
      const lab = rgbToLab(r, g, b);
      const back = labToRgb(lab[0], lab[1], lab[2]);
      expect(Math.abs(back[0] - r)).toBeLessThan(1);
      expect(Math.abs(back[1] - g)).toBeLessThan(1);
      expect(Math.abs(back[2] - b)).toBeLessThan(1);
    }
  });

  it('computes WCAG contrast', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 0);
    expect(rgbToHex(hexToRgb('#abc'))).toBe('#aabbcc');
  });
});

describe('palette', () => {
  it('quantizes two-colour image into those colours', () => {
    const px = new Uint8ClampedArray(400 * 4);
    for (let i = 0; i < 400; i++) px.set(i < 300 ? [250, 0, 0, 255] : [0, 0, 250, 255], i * 4);
    const pal = quantize(px, 2, 1);
    expect(pal[0]).toBe('#fa0000');
    expect(pal[1]).toBe('#0000fa');
  });

  it('picks light ink on dark regions and dark ink on light ones, with readable contrast', () => {
    const dark = deriveTheme(['#223344', '#dd5577'], [20, 25, 40]);
    expect(contrast(hexToRgb(dark.ink), [20, 25, 40])).toBeGreaterThanOrEqual(4.5);
    expect(dark.scrim).toBe(false);
    const light = deriveTheme(['#eeeeee', '#3366aa'], [235, 235, 230]);
    expect(contrast(hexToRgb(light.ink), [235, 235, 230])).toBeGreaterThanOrEqual(4.5);
  });

  it('keeps the accent readable against the region (grass-green on sky-blue)', () => {
    const sky: [number, number, number] = [120, 170, 215];
    const t = deriveTheme(['#6fa032', '#7fb0e0'], sky);
    expect(contrast(hexToRgb(t.accent), sky)).toBeGreaterThanOrEqual(4.5);
    const night: [number, number, number] = [15, 20, 45];
    expect(contrast(hexToRgb(deriveTheme(['#3a2c8a'], night).accent), night)).toBeGreaterThanOrEqual(4.5);
  });

  it('judges ink by the worst cell, not the average', () => {
    // bright sky with a dark cloud band: dark ink would pass on average but fail on the band
    const cells: [number, number, number][] = [[230, 225, 220], [235, 230, 225], [70, 72, 90], [228, 222, 215]];
    const t = deriveTheme(['#e0d8d0', '#b06040'], cells);
    const worst = Math.min(...cells.map((c) => contrast(hexToRgb(t.ink), c)));
    expect(worst >= 4.5 || t.scrim).toBe(true);
    expect(t.scrim).toBe(true);
  });

  it('asks for a scrim on mid-grey regions', () => {
    expect(deriveTheme(['#777777'], [118, 118, 118]).scrim).toBe(true);
  });
});
