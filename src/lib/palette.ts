import { contrast, hexToRgb, hslToRgb, rgba, rgbToHex, rgbToHsl, type RGB } from './color';
import type { SceneTheme } from './types';

/** Median-cut quantiser over an RGBA buffer (sampled). Returns hex colours, most populous first. */
export function quantize(px: Uint8ClampedArray, count = 6, stride = 4): string[] {
  const pts: RGB[] = [];
  for (let i = 0; i < px.length; i += 4 * stride) {
    if (px[i + 3] < 128) continue;
    pts.push([px[i], px[i + 1], px[i + 2]]);
  }
  if (!pts.length) return ['#808080'];
  let boxes: RGB[][] = [pts];
  while (boxes.length < count) {
    // split the box with the widest channel range
    let best = -1, bestRange = 0, bestCh = 0, bestCut = 0;
    boxes.forEach((b, i) => {
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255, hi = 0;
        for (const p of b) { lo = Math.min(lo, p[ch]); hi = Math.max(hi, p[ch]); }
        if (hi - lo > bestRange) { bestRange = hi - lo; best = i; bestCh = ch; bestCut = (lo + hi) / 2; }
      }
    });
    if (best < 0) break;
    // split at the midpoint of the range (not the median) so distinct clusters stay intact
    const b = boxes[best];
    boxes.splice(best, 1, b.filter((p) => p[bestCh] <= bestCut), b.filter((p) => p[bestCh] > bestCut));
  }
  return boxes
    .sort((a, b) => b.length - a.length)
    .map((b) => {
      const s = b.reduce<RGB>((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
      return rgbToHex([s[0] / b.length, s[1] / b.length, s[2] / b.length]);
    });
}

/**
 * The accent also colours small labels (issue number, search engine, dock numbers), so walk its
 * lightness away from the background until it reads at 4.5:1 — or as close as the hue allows.
 */
function readableAccent(h: number, s: number, light: boolean, cells: RGB[]): RGB {
  let l = light ? 0.7 : 0.38;
  let rgb = hslToRgb([h, s, l]);
  while (worstContrast(rgb, cells) < 4.5 && (light ? l < 0.94 : l > 0.12)) {
    l += light ? 0.03 : -0.03;
    rgb = hslToRgb([h, s, l]);
  }
  return rgb;
}

/** Lowest contrast of `c` over the background cells the text may sit on. */
const worstContrast = (c: RGB, cells: RGB[]) => Math.min(...cells.map((r) => contrast(c, r)));

const LIGHT_INK: RGB = [247, 243, 236];
const DARK_INK: RGB = [27, 26, 31];

/** Blend `base` towards `tint` by t. */
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Derives the UI colours for a scene.
 * @param palette background colours, most dominant first
 * @param region background colour(s) where the clock/search sit — pass a grid of cell averages so
 *   the ink is judged by its worst spot (a dark cloud band under the date), not the average.
 */
export function deriveTheme(palette: string[], region: RGB | RGB[]): SceneTheme {
  const cells = (Array.isArray(region[0]) ? region : [region]) as RGB[];
  const cols = palette.map(hexToRgb);
  // Accent: the most vivid palette entry, pulled into a readable lightness band.
  const scored = cols
    .map((c) => ({ c, hsl: rgbToHsl(c) }))
    .sort((a, b) => b.hsl[1] * (1 - Math.abs(b.hsl[2] - 0.55)) - a.hsl[1] * (1 - Math.abs(a.hsl[2] - 0.55)));
  const [h, s] = scored[0]?.hsl ?? [0, 0, 0.5];

  const lightOk = worstContrast(LIGHT_INK, cells);
  const darkOk = worstContrast(DARK_INK, cells);
  const useLight = lightOk >= 4.5 || lightOk >= darkOk;
  const scrim = Math.max(lightOk, darkOk) < 4.5;

  const accentRgb = readableAccent(h, Math.min(0.85, Math.max(0.45, s)), useLight, cells);
  const ink = mix(useLight ? LIGHT_INK : DARK_INK, accentRgb, 0.06);
  const surfaceBase = hslToRgb([h, Math.min(0.35, s), useLight ? 0.09 : 0.95]);
  const hazeBase = cols[0] ?? [128, 128, 128];

  return {
    accent: rgbToHex(accentRgb),
    ink: rgbToHex(ink),
    inkSoft: rgba(ink, 0.7),
    surface: rgba(surfaceBase, useLight ? 0.78 : 0.82),
    glow: rgba(accentRgb, 0.55),
    haze: rgba(hazeBase, 0.35),
    scrim,
  };
}
