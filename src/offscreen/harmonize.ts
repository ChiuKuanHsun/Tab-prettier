import { labToRgb, rgbToLab, type RGB } from '../lib/color';

export interface LabStats { mean: [number, number, number]; std: [number, number, number] }

/** Mean/std of an RGBA buffer in Lab, weighted by `alpha` when given. Samples every `stride` px. */
export function labStats(px: Uint8ClampedArray, alpha?: Uint8ClampedArray, stride = 3): LabStats {
  const sum = [0, 0, 0], sq = [0, 0, 0];
  const lab = [0, 0, 0];
  let wsum = 0;
  for (let i = 0, p = 0; i < px.length; i += 4 * stride, p += stride) {
    const wgt = alpha ? alpha[p] / 255 : 1;
    if (wgt < 0.5) continue;
    rgbToLab(px[i], px[i + 1], px[i + 2], lab);
    for (let c = 0; c < 3; c++) {
      sum[c] += lab[c];
      sq[c] += lab[c] * lab[c];
    }
    wsum++;
  }
  wsum ||= 1;
  const mean = sum.map((s) => s / wsum) as LabStats['mean'];
  const std = sq.map((s, c) => Math.sqrt(Math.max(1e-6, s / wsum - mean[c] ** 2))) as LabStats['std'];
  return { mean, std };
}

/**
 * Reinhard colour transfer from `src` stats towards `dst` stats, applied to foreground pixels.
 * Strength is halved on L so the character keeps its own exposure; the std ratio is clamped so
 * a flat background can't crush the character's contrast.
 */
export function transferColors(
  px: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  src: LabStats,
  dst: LabStats,
  strength: number,
) {
  if (strength <= 0) return;
  const k = [strength * 0.5, strength, strength];
  const ratio = src.std.map((s, c) => Math.min(1.3, Math.max(0.75, dst.std[c] / s)));
  const lab = [0, 0, 0], rgb = [0, 0, 0];
  for (let i = 0, p = 0; i < px.length; i += 4, p++) {
    if (!alpha[p]) continue;
    rgbToLab(px[i], px[i + 1], px[i + 2], lab);
    for (let c = 0; c < 3; c++) {
      const target = (lab[c] - src.mean[c]) * ratio[c] + dst.mean[c];
      lab[c] += (target - lab[c]) * k[c];
    }
    labToRgb(lab[0], lab[1], lab[2], rgb);
    px[i] = rgb[0];
    px[i + 1] = rgb[1];
    px[i + 2] = rgb[2];
  }
}

/** Greyscale luma (0..255) of an RGBA buffer. */
export function toGray(px: Uint8ClampedArray): Float32Array {
  const g = new Float32Array(px.length / 4);
  for (let i = 0, p = 0; i < px.length; i += 4, p++) g[p] = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return g;
}

/**
 * Rough key-light direction: vector from the image centre to the centroid of its brightest
 * areas (luma^4 weighting). Returns a unit vector, or {0,-1} (light from above) when flat.
 */
export function lightDirection(gray: Float32Array, w: number, h: number) {
  let sx = 0, sy = 0, sw = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const l = gray[y * w + x] / 255;
      const wt = l * l * l * l;
      sx += wt * (x / w - 0.5);
      sy += wt * (y / h - 0.5);
      sw += wt;
    }
  }
  if (!sw) return { x: 0, y: -1 };
  const dx = sx / sw, dy = sy / sw;
  const len = Math.hypot(dx, dy);
  return len < 0.02 ? { x: 0, y: -1 } : { x: dx / len, y: dy / len };
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const d = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[y * w + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / d;
      acc += src[y * w + Math.min(w - 1, x + r + 1)] - src[y * w + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / d;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

/**
 * Bakes a rim light onto the character: pixels just inside the silhouette whose outward normal
 * faces the light get screened towards `color`. Normals come from the gradient of a blurred alpha.
 */
export function applyRimLight(
  px: Uint8ClampedArray,
  alpha: Uint8ClampedArray,
  w: number,
  h: number,
  light: { x: number; y: number },
  color: RGB,
  intensity: number,
) {
  if (intensity <= 0) return;
  const r = Math.max(2, Math.round(h * 0.006));
  const a = new Float32Array(alpha.length);
  for (let i = 0; i < a.length; i++) a[i] = alpha[i] / 255;
  const blurred = boxBlur(a, w, h, r);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (a[p] < 0.5) continue;
      const edge = a[p] * (1 - blurred[p]) * 2; // 0 in the interior, up to ~1 at the silhouette
      if (edge < 0.02) continue;
      // outward normal = -grad(blurred alpha)
      const gx = blurred[p - 1] - blurred[p + 1];
      const gy = blurred[p - w] - blurred[p + w];
      const gl = Math.hypot(gx, gy) || 1;
      const facing = Math.max(0, (gx / gl) * light.x + (gy / gl) * light.y);
      const t = Math.min(1, edge * (0.35 + 0.65 * facing) * intensity);
      const i = p * 4;
      for (let c = 0; c < 3; c++) {
        const screen = 255 - ((255 - px[i + c]) * (255 - color[c])) / 255;
        px[i + c] += (screen - px[i + c]) * t;
      }
    }
  }
}
