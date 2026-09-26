/**
 * Favicons redrawn in the scene's accent, so a row of logos matches the artwork yet stays
 * recognisable: every pixel takes the accent's hue, and its lightness follows the original's
 * brightness over a fixed spread (dark parts deep, light parts pale), so the logo keeps its shape
 * whether the accent is light or dark. A solid square background is dropped first, leaving the
 * logo itself. Chrome's favicon service is the extension's own origin, so its images can be read.
 */
import { hexToRgb, hslToRgb, rgbToHsl, type RGB } from './color';

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/** Below this spread of brightness an icon counts as one colour and becomes a plain silhouette. */
const FLAT = 0.18;
/** Lightness of the darkest and lightest parts. */
const DEEP = 0.32, PALE = 0.88;

const dist = (px: Uint8ClampedArray, i: number, c: RGB) =>
  Math.max(Math.abs(px[i] - c[0]), Math.abs(px[i + 1] - c[1]), Math.abs(px[i + 2] - c[2]));

/**
 * Makes a solid background transparent: when all four corners are opaque and the same colour,
 * that colour (and near it, softly) is the icon's backdrop rather than part of the logo.
 */
export function dropSquareBackground(px: Uint8ClampedArray, size: number) {
  const corners = [0, size - 1, size * (size - 1), size * size - 1].map((p) => p * 4);
  if (corners.some((i) => px[i + 3] < 230)) return;
  const bg: RGB = [px[corners[0]], px[corners[0] + 1], px[corners[0] + 2]];
  if (corners.some((i) => dist(px, i, bg) > 24)) return;
  for (let i = 0; i < px.length; i += 4) {
    const d = dist(px, i, bg);
    if (d < 40) px[i + 3] = Math.round(px[i + 3] * Math.max(0, (d - 20) / 20));
  }
}

/**
 * Recolours RGBA pixels in place (transparency kept). Brightness is stretched over the icon's
 * own range first, so near-white or near-black logos still get both ends; a one-colour icon is a
 * silhouette, pale on a dark backdrop (`light` ink) and deep on a light one.
 */
export function duotonePixels(px: Uint8ClampedArray, accent: RGB, light: boolean) {
  const [h, s] = rgbToHsl(accent);
  const sat = Math.min(0.85, Math.max(0.45, s));
  let lo = 1, hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 64) continue;
    const l = lum(px[i], px[i + 1], px[i + 2]);
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  const flat = hi - lo < FLAT;
  for (let i = 0; i < px.length; i += 4) {
    const tone = flat ? (light ? 1 : 0) : Math.min(1, Math.max(0, (lum(px[i], px[i + 1], px[i + 2]) - lo) / (hi - lo)));
    const [r, g, b] = hslToRgb([h, sat, DEEP + (PALE - DEEP) * tone]);
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}

const cache = new Map<string, Promise<string>>();

/**
 * The image at `src` in the tones of `accent` (a hex colour), as a data URL; `light` says the
 * surroundings are dark (light ink). Cached per combination.
 */
export function duotone(src: string, accent: string, light: boolean, size = 32): Promise<string> {
  const key = `${src}|${accent}|${light}`;
  let hit = cache.get(key);
  if (!hit) {
    hit = (async () => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d', { willReadFrequently: true })!;
      ctx.drawImage(img, 0, 0, size, size);
      const data = ctx.getImageData(0, 0, size, size);
      dropSquareBackground(data.data, size);
      duotonePixels(data.data, hexToRgb(accent), light);
      ctx.putImageData(data, 0, 0);
      return c.toDataURL();
    })();
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}
