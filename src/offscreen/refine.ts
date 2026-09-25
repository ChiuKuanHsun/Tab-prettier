import type { Rect } from '../lib/types';

export interface RefinedMask {
  alpha: Uint8ClampedArray;
  bbox: Rect;
  /** Foreground area / image area. */
  area: number;
  cut: { left: boolean; right: boolean; bottom: boolean; top: boolean };
  ok: boolean;
  reason?: string;
}

/**
 * The image's own alpha as a 0..1 mask, when it is a cut-out already (transparent-background
 * art or a transparent upload): a real share of fully transparent pixels, mostly along the
 * border. Undefined for opaque images.
 */
export function alphaMask(rgba: Uint8ClampedArray, w: number, h: number): Float32Array | undefined {
  const n = w * h;
  let clear = 0;
  for (let i = 0; i < n; i++) if (rgba[i * 4 + 3] < 16) clear++;
  if (clear < n * 0.1) return undefined;
  let border = 0, borderClear = 0;
  const at = (x: number, y: number) => {
    border++;
    if (rgba[(y * w + x) * 4 + 3] < 16) borderClear++;
  };
  for (let x = 0; x < w; x++) at(x, 0), at(x, h - 1);
  for (let y = 1; y < h - 1; y++) at(0, y), at(w - 1, y);
  if (borderClear < border * 0.5) return undefined;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = rgba[i * 4 + 3] / 255;
  return out;
}

/** Soft threshold: pushes the model's low-confidence fringe to 0 and its core to 255. */
export function softThreshold(mask: Float32Array, lo = 0.12, hi = 0.88): Uint8ClampedArray {
  const out = new Uint8ClampedArray(mask.length);
  const inv = 1 / (hi - lo);
  for (let i = 0; i < mask.length; i++) {
    const t = Math.min(1, Math.max(0, (mask[i] - lo) * inv));
    out[i] = 255 * t * t * (3 - 2 * t);
  }
  return out;
}

/**
 * Keeps connected foreground components that are at least `minFrac` of the largest one,
 * dropping speckles the model picks up in busy backgrounds. 4-connectivity on alpha > 127.
 */
export function keepMainComponents(alpha: Uint8ClampedArray, w: number, h: number, minFrac = 0.08) {
  const labels = new Int32Array(w * h);
  const sizes: number[] = [0];
  const stack = new Int32Array(w * h);
  for (let start = 0; start < w * h; start++) {
    if (alpha[start] <= 127 || labels[start]) continue;
    const id = sizes.length;
    let top = 0, size = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top) {
      const p = stack[--top];
      size++;
      const x = p % w;
      const nb = [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, p - w, p + w];
      for (const q of nb) {
        if (q < 0 || q >= w * h || labels[q] || alpha[q] <= 127) continue;
        labels[q] = id;
        stack[top++] = q;
      }
    }
    sizes.push(size);
  }
  const largest = Math.max(0, ...sizes);
  const keep = sizes.map((s) => s >= largest * minFrac);
  // Soft fringe pixels (alpha ≤ 127) have no label; keep them only next to a kept pixel.
  for (let i = 0; i < w * h; i++) {
    const l = labels[i];
    if (l) {
      if (!keep[l]) alpha[i] = 0;
    } else if (alpha[i]) {
      const x = i % w;
      const near =
        (x > 0 && keep[labels[i - 1]] && labels[i - 1]) ||
        (x < w - 1 && keep[labels[i + 1]] && labels[i + 1]) ||
        (i >= w && keep[labels[i - w]] && labels[i - w]) ||
        (i + w < w * h && keep[labels[i + w]] && labels[i + w]);
      if (!near) alpha[i] = Math.min(alpha[i], 40);
    }
  }
  return largest;
}

/** Fraction of an image row/column that is solid foreground. */
function edgeCoverage(alpha: Uint8ClampedArray, w: number, h: number, edge: 'top' | 'bottom' | 'left' | 'right') {
  let n = 0;
  const len = edge === 'top' || edge === 'bottom' ? w : h;
  for (let i = 0; i < len; i++) {
    const idx =
      edge === 'top' ? i : edge === 'bottom' ? (h - 1) * w + i : edge === 'left' ? i * w : i * w + w - 1;
    if (alpha[idx] > 127) n++;
  }
  return n / len;
}

export function refineMask(mask: Float32Array, w: number, h: number): RefinedMask {
  const alpha = softThreshold(mask);
  keepMainComponents(alpha, w, h);

  let x0 = w, y0 = h, x1 = -1, y1 = -1, solid = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = alpha[y * w + x];
      if (a > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
      if (a > 127) solid++;
    }
  }
  const area = solid / (w * h);
  const bbox = x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  const cut = {
    top: edgeCoverage(alpha, w, h, 'top') > 0.12,
    bottom: edgeCoverage(alpha, w, h, 'bottom') > 0.04,
    left: edgeCoverage(alpha, w, h, 'left') > 0.04,
    right: edgeCoverage(alpha, w, h, 'right') > 0.04,
  };

  let reason: string | undefined;
  if (area < 0.06) reason = 'too-small';
  else if (area > 0.8) reason = 'too-large';
  else if (cut.top) reason = 'cut-top';
  else if (bbox.h < h * 0.4) reason = 'too-short';
  else if (cut.left && cut.right && !cut.bottom) reason = 'cut-sides';
  // Two figures standing far apart, or one lying down: shrunk to fit, they'd read as tiny.
  else if (bbox.w > bbox.h * 1.6) reason = 'too-wide';
  return { alpha, bbox, area, cut, ok: !reason, reason };
}

/**
 * Where the character is cropped at the left/right image border, fade the alpha over a short
 * ramp so the hard cut doesn't read as a sticker edge (the renderer also anchors those sides
 * to the viewport edge).
 */
export function fadeCutEdges(alpha: Uint8ClampedArray, w: number, h: number, cut: RefinedMask['cut'], frac = 0.05) {
  const ramp = Math.max(1, Math.round(w * frac));
  for (let y = 0; y < h; y++) {
    for (let i = 0; i < ramp; i++) {
      const k = i / ramp;
      if (cut.left) alpha[y * w + i] *= k;
      if (cut.right) alpha[y * w + (w - 1 - i)] *= k;
    }
  }
}

/** Is there a sizeable character in a background image? Used to reject busy backgrounds. */
export function hasCharacter(mask: Float32Array, w: number, h: number, threshold = 0.035): boolean {
  const alpha = softThreshold(mask);
  const largest = keepMainComponents(alpha, w, h, 1);
  return largest / (w * h) > threshold;
}
