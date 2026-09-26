/**
 * Favicons redrawn in two tones of the scene's accent, so a row of logos matches the artwork yet
 * stays recognisable: dark parts take the accent, light parts a pale tint of it, transparency is
 * kept. Chrome's favicon service is the extension's own origin, so its images can be read back.
 */
import { hexToRgb, type RGB } from './color';

const lum = (r: number, g: number, b: number) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => a[i] + (b[i] - a[i]) * t) as RGB;

/** Below this spread of brightness an icon counts as one colour and becomes a plain silhouette. */
const FLAT = 0.18;

/**
 * Recolours RGBA pixels in place. Brightness is stretched over the icon's own range first, so
 * near-white or near-black logos still get both tones.
 */
export function duotonePixels(px: Uint8ClampedArray, accent: RGB) {
  const pale = mix(accent, [255, 255, 255], 0.78);
  let lo = 1, hi = 0;
  for (let i = 0; i < px.length; i += 4) {
    if (px[i + 3] < 64) continue;
    const l = lum(px[i], px[i + 1], px[i + 2]);
    lo = Math.min(lo, l);
    hi = Math.max(hi, l);
  }
  const flat = hi - lo < FLAT;
  for (let i = 0; i < px.length; i += 4) {
    const tone = flat ? 0 : (lum(px[i], px[i + 1], px[i + 2]) - lo) / (hi - lo);
    const [r, g, b] = mix(accent, pale, Math.min(1, Math.max(0, tone)));
    px[i] = r;
    px[i + 1] = g;
    px[i + 2] = b;
  }
}

const cache = new Map<string, Promise<string>>();

/** The image at `src` in two tones of `accent` (a hex colour), as a data URL; cached per pair. */
export function duotone(src: string, accent: string, size = 32): Promise<string> {
  const key = `${src}|${accent}`;
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
      duotonePixels(data.data, hexToRgb(accent));
      ctx.putImageData(data, 0, 0);
      return c.toDataURL();
    })();
    cache.set(key, hit);
    hit.catch(() => cache.delete(key));
  }
  return hit;
}
