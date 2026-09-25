export type RGB = [number, number, number];

const clamp = (v: number, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));

export function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: RGB): string {
  return '#' + [r, g, b].map((v) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
}

export const rgba = ([r, g, b]: RGB, a: number) =>
  `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, ${+a.toFixed(3)})`;

const toLinear = (c: number) => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (c: number) => {
  c = clamp(c);
  return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
};

export function luminance([r, g, b]: RGB): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

export function contrast(a: RGB, b: RGB): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function rgbToHsl([r, g, b]: RGB): RGB {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

export function hslToRgb([h, s, l]: RGB): RGB {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// --- CIELAB (D65) -----------------------------------------------------------

const Xn = 0.95047, Yn = 1, Zn = 1.08883;
const labF = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
const labFi = (t: number) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));

export function rgbToLab(r: number, g: number, b: number, out: number[] = [0, 0, 0]): number[] {
  const lr = toLinear(r), lg = toLinear(g), lb = toLinear(b);
  const x = (0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / Xn;
  const y = (0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / Yn;
  const z = (0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / Zn;
  const fx = labF(x), fy = labF(y), fz = labF(z);
  out[0] = 116 * fy - 16;
  out[1] = 500 * (fx - fy);
  out[2] = 200 * (fy - fz);
  return out;
}

export function labToRgb(L: number, A: number, B: number, out: number[] = [0, 0, 0]): number[] {
  const fy = (L + 16) / 116;
  const x = labFi(fy + A / 500) * Xn;
  const y = labFi(fy) * Yn;
  const z = labFi(fy - B / 200) * Zn;
  out[0] = fromLinear(3.2406 * x - 1.5372 * y - 0.4986 * z);
  out[1] = fromLinear(-0.9689 * x + 1.8758 * y + 0.0415 * z);
  out[2] = fromLinear(0.0557 * x - 0.204 * y + 1.057 * z);
  return out;
}
