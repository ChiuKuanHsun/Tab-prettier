export type Canvas2D = OffscreenCanvasRenderingContext2D;

export function canvas(w: number, h: number) {
  const c = new OffscreenCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  return { c, ctx };
}

/** Draws `src` fitted inside maxW×maxH (never upscaled). */
export function fit(src: CanvasImageSource & { width: number; height: number }, maxW: number, maxH: number) {
  const s = Math.min(1, maxW / src.width, maxH / src.height);
  const { c, ctx } = canvas(src.width * s, src.height * s);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return { c, ctx };
}

export const pixels = (ctx: Canvas2D) => ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);

export async function fetchBlob(url: string, timeoutMs = 30000): Promise<Blob> {
  const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.blob();
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json() as Promise<T>;
}
