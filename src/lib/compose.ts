/**
 * Composition: decides which side the character stands on and where the clock goes so that it
 * sits partly behind the character. `analyseEmptiness` runs offscreen on a thumbnail;
 * `computeLayout` runs in the new tab against the live viewport.
 */

/** Emptiness (0..1, higher = calmer) of the left/right thirds, from Sobel edge density. */
export function analyseEmptiness(gray: Float32Array, w: number, h: number) {
  const band = (x0: number, x1: number) => {
    let sum = 0, n = 0;
    for (let y = 1; y < h - 1; y++) {
      for (let x = Math.max(1, x0); x < Math.min(w - 1, x1); x++) {
        const p = y * w + x;
        const gx =
          gray[p - w + 1] + 2 * gray[p + 1] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - 1] - gray[p + w - 1];
        const gy =
          gray[p + w - 1] + 2 * gray[p + w] + gray[p + w + 1] - gray[p - w - 1] - 2 * gray[p - w] - gray[p - w + 1];
        sum += Math.hypot(gx, gy);
        n++;
      }
    }
    const mean = n ? sum / n : 0;
    return Math.max(0, Math.min(1, 1 - mean / 160));
  };
  return { left: band(0, Math.round(w / 3)), right: band(Math.round((2 * w) / 3), w) };
}

/** The clock goes on the calmer side; the character covers the busier one. */
export const chooseCharSide = (e: { left: number; right: number }): 'left' | 'right' =>
  e.left > e.right ? 'right' : 'left';

export interface Viewport { w: number; h: number }
export interface CharInfo {
  width: number;
  height: number;
  cut: { left: boolean; right: boolean; bottom: boolean };
}

export interface Layout {
  char?: { left: number; bottom: number; width: number; height: number };
  /** The text column: `edge` is the inner x the clock aligns to; `align` which side it grows from. */
  text: { side: 'left' | 'right'; inner: number; outer: number; top: number };
}

export function computeLayout(vp: Viewport, side: 'left' | 'right', char?: CharInfo): Layout {
  const margin = Math.max(32, vp.w * 0.05);
  if (!char) {
    // No character: text column occupies the calm half.
    const textSide = side === 'left' ? 'right' : 'left';
    return textSide === 'left'
      ? { text: { side: 'left', outer: margin, inner: vp.w * 0.55, top: vp.h * 0.2 } }
      : { text: { side: 'right', outer: vp.w - margin, inner: vp.w * 0.45, top: vp.h * 0.2 } };
  }

  // Bust shots (cut at the bottom) fill more height; full-body art keeps a little headroom.
  let height = vp.h * (char.cut.bottom ? 0.94 : 0.9);
  let width = (height * char.width) / char.height;
  const maxW = vp.w * 0.52;
  if (width > maxW) {
    width = maxW;
    height = (width * char.height) / char.width;
  }

  // Centre on the outer third, but snap to the viewport edge on the side the art was cropped.
  const centre = side === 'right' ? vp.w * 0.72 : vp.w * 0.28;
  let left = centre - width / 2;
  if (side === 'right' && char.cut.right) left = vp.w - width;
  if (side === 'left' && char.cut.left) left = 0;
  left = Math.min(vp.w - width * 0.6, Math.max(-width * 0.4, left));

  // The clock's inner edge reaches into the character so the figure overlaps it — but by at most
  // about half a digit (the clock is ≤0.3vh tall), so the time always stays readable.
  const overlap = Math.min(width * 0.18, vp.h * 0.07);
  const text =
    side === 'right'
      ? { side: 'left' as const, outer: margin, inner: left + overlap, top: vp.h * 0.16 }
      : { side: 'right' as const, outer: vp.w - margin, inner: left + width - overlap, top: vp.h * 0.16 };

  return { char: { left, bottom: 0, width, height }, text };
}
