import { hexToRgb, luminance, rgbToHsl, hslToRgb, type RGB } from '../lib/color';
import { analyseEmptiness, chooseCharSide } from '../lib/compose';
import { db } from '../lib/db';
import { deriveTheme, quantize } from '../lib/palette';
import { uid } from '../lib/settings';
import type { Credit, MediaKind, Scene, SceneChar, Settings, Upload } from '../lib/types';
import { applyRimLight, labStats, lightDirection, toGray, transferColors } from './harmonize';
import { canvas, fetchBlob, fit, pixels } from './image';
import { fadeCutEdges, hasCharacter, refineMask } from './refine';
import { segment } from './segment';
import { nekosia, waifuim, wallhaven, type Candidate } from './sources';

const THUMB_W = 320, THUMB_H = 180;

interface Bg {
  blob: Blob;
  kind: MediaKind;
  width: number;
  height: number;
  palette: string[];
  credit: Credit;
  /** 320×180 RGBA thumbnail used for analysis. */
  thumb: ImageData;
}

const log = (...a: unknown[]) => console.log('[pipeline]', ...a);

/** First frame of a video blob, via a detached <video> element (offscreen docs have a DOM). */
async function videoFrame(blob: Blob): Promise<HTMLVideoElement> {
  const v = document.createElement('video');
  v.muted = true;
  v.src = URL.createObjectURL(blob);
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('video decode failed'));
  });
  v.currentTime = Math.min(0.5, v.duration / 2 || 0);
  await new Promise((res) => (v.onseeked = res));
  return v;
}

function thumbOf(src: CanvasImageSource, w: number, h: number): ImageData {
  // cover-crop to 16:9 so the analysis matches what the viewport shows
  const { ctx } = canvas(THUMB_W, THUMB_H);
  const s = Math.max(THUMB_W / w, THUMB_H / h);
  ctx.drawImage(src, (THUMB_W - w * s) / 2, (THUMB_H - h * s) / 2, w * s, h * s);
  return pixels(ctx);
}

async function uploadsByRole(role: Upload['role']) {
  const all = await (await db()).getAll('uploads');
  return all.filter((u) => u.role === role);
}

async function bgFromUpload(u: Upload): Promise<Bg> {
  let src: CanvasImageSource, w: number, h: number;
  if (u.kind === 'video') {
    const v = await videoFrame(u.blob);
    [src, w, h] = [v, v.videoWidth, v.videoHeight];
  } else {
    const b = await createImageBitmap(u.blob);
    [src, w, h] = [b, b.width, b.height];
  }
  const thumb = thumbOf(src, w, h);
  return {
    blob: u.blob, kind: u.kind, width: w, height: h, thumb,
    palette: quantize(thumb.data, 6),
    credit: { id: `upload:${u.id}`, source: 'upload', pageUrl: undefined, artist: u.name },
  };
}

async function bgFromWallhaven(s: Settings, blacklist: Set<string>): Promise<Bg> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cand = await wallhaven(s, blacklist);
    try {
      const bmp = await createImageBitmap(await fetchBlob(cand.url));
      // Reject backgrounds that already contain a character: they'd fight the composited one.
      const probe = fit(bmp, 512, 512);
      if (hasCharacter(await segment(probe.c, probe.c.width, probe.c.height), probe.c.width, probe.c.height)) {
        log('bg has a character, skipping', cand.credit.id);
        blacklist.add(cand.credit.id);
        continue;
      }
      const { c } = fit(bmp, 2560, 1600);
      const blob = await c.convertToBlob({ type: 'image/webp', quality: 0.88 });
      const thumb = thumbOf(bmp, bmp.width, bmp.height);
      return {
        blob, kind: 'image', width: c.width, height: c.height, thumb,
        palette: cand.palette?.length ? cand.palette : quantize(thumb.data, 6),
        credit: cand.credit,
      };
    } catch (e) {
      log('bg failed', cand.url, e);
    }
  }
  throw new Error('no usable background');
}

/** Soft gradient fallback when no background source is enabled. */
async function bgGenerated(): Promise<Bg> {
  const hue = Math.random() * 360;
  const { c, ctx } = canvas(1920, 1080);
  const g = ctx.createLinearGradient(0, 0, 1920, 1080);
  const stop = (dh: number, l: number) => `hsl(${(hue + dh) % 360} 45% ${l}%)`;
  g.addColorStop(0, stop(0, 22));
  g.addColorStop(0.55, stop(40, 38));
  g.addColorStop(1, stop(80, 62));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 1920, 1080);
  const thumb = thumbOf(c, 1920, 1080);
  return {
    blob: await c.convertToBlob({ type: 'image/webp', quality: 0.9 }),
    kind: 'image', width: 1920, height: 1080, thumb,
    palette: quantize(thumb.data, 4),
    credit: { id: `generated:${hue.toFixed(0)}`, source: 'upload', artist: '漸層' },
  };
}

async function buildBackground(s: Settings, blacklist: Set<string>): Promise<Bg> {
  const ups = await uploadsByRole('bg');
  if (ups.length && (Math.random() < s.sources.uploadsWeight || !s.sources.wallhaven)) {
    return bgFromUpload(ups[Math.floor(Math.random() * ups.length)]);
  }
  if (s.sources.wallhaven) return bgFromWallhaven(s, blacklist);
  return bgGenerated();
}

async function nextCharCandidate(s: Settings, blacklist: Set<string>): Promise<Candidate | Upload | undefined> {
  const ups = await uploadsByRole('char');
  if (ups.length && Math.random() < s.sources.uploadsWeight) return ups[Math.floor(Math.random() * ups.length)];
  const fns = [s.sources.nekosia && nekosia, s.sources.waifuim && waifuim].filter(Boolean) as (typeof nekosia)[];
  if (!fns.length) return ups[0];
  return fns[Math.floor(Math.random() * fns.length)](s, blacklist);
}

async function buildCharacter(s: Settings, blacklist: Set<string>, bg: Bg, light: { x: number; y: number }) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const cand = await nextCharCandidate(s, blacklist);
    if (!cand) return undefined;
    const isUpload = 'blob' in cand;
    const credit: Credit = isUpload ? { id: `upload:${cand.id}`, source: 'upload', artist: cand.name } : cand.credit;
    try {
      const bmp = await createImageBitmap(isUpload ? cand.blob : await fetchBlob(cand.url));
      const { c, ctx } = fit(bmp, 1400, 2000);
      const w = c.width, h = c.height;
      const t0 = performance.now();
      const mask = await segment(c, w, h);
      const r = refineMask(mask, w, h);
      log('segmented', credit.id, `${Math.round(performance.now() - t0)}ms`, r.reason ?? 'ok', r.area.toFixed(2));
      if (!r.ok) {
        if (!isUpload) blacklist.add(credit.id);
        continue;
      }
      fadeCutEdges(r.alpha, w, h, r.cut);

      const img = pixels(ctx);
      const px = img.data;
      transferColors(px, r.alpha, labStats(px, r.alpha), labStats(bg.thumb.data), s.harmonize);

      // Rim colour: the brightest background tone, lifted towards white.
      const bright = bg.palette.map(hexToRgb).sort((a, b) => luminance(b) - luminance(a))[0] ?? [255, 255, 255];
      const [hh, ss] = rgbToHsl(bright);
      const rim = hslToRgb([hh, Math.min(0.6, ss), 0.85]) as RGB;
      applyRimLight(px, r.alpha, w, h, light, rim, s.rimLight);

      for (let i = 0; i < r.alpha.length; i++) px[i * 4 + 3] = r.alpha[i];
      ctx.putImageData(img, 0, 0);

      const { x, y, w: bw, h: bh } = r.bbox;
      const crop = canvas(bw, bh);
      crop.ctx.drawImage(c, x, y, bw, bh, 0, 0, bw, bh);
      const blob = await crop.c.convertToBlob({ type: 'image/webp', quality: 0.9 });
      const out: SceneChar = { blob, width: bw, height: bh, cut: { left: r.cut.left, right: r.cut.right, bottom: r.cut.bottom }, credit };
      return out;
    } catch (e) {
      log('char failed', credit.id, e);
    }
  }
  return undefined;
}

/** Averages of an nx×ny grid of cells over a region, so contrast can be checked per spot. */
function regionCells(img: ImageData, x0: number, x1: number, y0: number, y1: number, nx = 4, ny = 5): RGB[] {
  const out: RGB[] = [];
  const cw = (x1 - x0) / nx, ch = (y1 - y0) / ny;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      out.push(regionAverage(img, x0 + i * cw, x0 + (i + 1) * cw, y0 + j * ch, y0 + (j + 1) * ch));
    }
  }
  return out;
}

function regionAverage(img: ImageData, x0: number, x1: number, y0: number, y1: number): RGB {
  const { width: w, data } = img;
  let r = 0, g = 0, b = 0, n = 0;
  for (let y = Math.round(y0); y < y1; y++) {
    for (let x = Math.round(x0); x < x1; x++) {
      const i = (y * w + x) * 4;
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
  }
  return n ? [r / n, g / n, b / n] : [128, 128, 128];
}

export async function buildScene(s: Settings, blacklist: Set<string>): Promise<Scene> {
  const bg = await buildBackground(s, blacklist);
  const gray = toGray(bg.thumb.data);
  const emptiness = analyseEmptiness(gray, THUMB_W, THUMB_H);
  const light = lightDirection(gray, THUMB_W, THUMB_H);
  const charSide = chooseCharSide(emptiness);

  const wantsChar = s.sources.nekosia || s.sources.waifuim || (await uploadsByRole('char')).length > 0;
  const char = wantsChar ? await buildCharacter(s, blacklist, bg, light) : undefined;

  // Theme is judged against where the clock sits: the calm third, upper-middle band,
  // darkened by the user's dim setting.
  const textLeft = charSide === 'right';
  const dim = (c: RGB) => c.map((v) => v * (1 - s.bgDim)) as RGB;
  const cells = regionCells(bg.thumb, textLeft ? 0 : THUMB_W * 0.55, textLeft ? THUMB_W * 0.45 : THUMB_W, THUMB_H * 0.12, THUMB_H * 0.6).map(dim);
  const lowCells = regionCells(bg.thumb, textLeft ? 0 : THUMB_W * 0.6, textLeft ? THUMB_W * 0.4 : THUMB_W, THUMB_H * 0.86, THUMB_H, 4, 1).map(dim);
  const low = deriveTheme(bg.palette, lowCells);

  return {
    id: uid(),
    createdAt: Date.now(),
    bg: { blob: bg.blob, kind: bg.kind, width: bg.width, height: bg.height, palette: bg.palette, credit: bg.credit },
    char,
    layout: { charSide, emptiness, light },
    theme: { ...deriveTheme(bg.palette, cells), low: { ink: low.ink, inkSoft: low.inkSoft, surface: low.surface, accent: low.accent } },
  };
}
