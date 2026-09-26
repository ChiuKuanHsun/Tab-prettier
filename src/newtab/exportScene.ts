/**
 * The scene as a wallpaper: background (with the user's blur and dim), the character where the
 * new tab puts it, its shadows, and the haze — redrawn on a canvas the size of the screen. The
 * interface, particles and weather haze are left out: it's the artwork, not the page.
 */
import { computeLayout } from '../lib/compose';
import { shownVariant, type VariantPrefs } from '../lib/curation';
import type { Scene, Settings } from '../lib/types';

/** Longest side of the file; 4K is plenty for a wallpaper. */
const MAX_SIDE = 3840;

/** A drawable frame of the background: images (a gif's first frame) directly, videos a frame in. */
async function bgFrame(scene: Scene): Promise<{ src: CanvasImageSource; w: number; h: number }> {
  if (scene.bg.kind !== 'video') {
    const b = await createImageBitmap(scene.bg.blob);
    return { src: b, w: b.width, h: b.height };
  }
  const v = document.createElement('video');
  v.muted = true;
  v.src = URL.createObjectURL(scene.bg.blob);
  await new Promise<void>((res, rej) => {
    v.onloadeddata = () => res();
    v.onerror = () => rej(new Error('video decode failed'));
  });
  v.currentTime = Math.min(0.5, v.duration / 2 || 0);
  await new Promise((res) => (v.onseeked = res));
  return { src: v, w: v.videoWidth, h: v.videoHeight };
}

export async function exportScene(scene: Scene, s: Pick<Settings, 'bgBlur' | 'bgDim'> & VariantPrefs): Promise<Blob> {
  // the screen in CSS pixels (the layout's units), drawn at device pixels
  const vp = { w: screen.width, h: screen.height };
  const k = Math.min(devicePixelRatio || 1, MAX_SIDE / Math.max(vp.w, vp.h));
  const W = Math.round(vp.w * k), H = Math.round(vp.h * k);
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d')!;
  const haze = scene.theme.haze;

  // Background: cover, 6% oversized like the page (so a blur has no soft edge), blurred and dimmed.
  const bg = await bgFrame(scene);
  const cover = Math.max(W / bg.w, H / bg.h) * 1.06;
  ctx.filter = `blur(${s.bgBlur * k}px) brightness(${1 - s.bgDim})`;
  ctx.drawImage(bg.src, (W - bg.w * cover) / 2, (H - bg.h * cover) / 2, bg.w * cover, bg.h * cover);
  ctx.filter = 'none';

  // Haze pooling at the bottom, and a soft vignette: the page's `ellipse 120% 90% at 50% 45%`,
  // a unit circle scaled to those radii.
  let g = ctx.createLinearGradient(0, H, 0, H * 0.45);
  g.addColorStop(0, haze);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(W / 2, H * 0.45);
  ctx.scale(1.2 * W, 0.9 * H);
  g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
  g.addColorStop(0.55, 'transparent');
  g.addColorStop(1, 'rgb(0 0 0 / 0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(-1, -1, 2, 2);
  ctx.restore();

  const char = scene.char;
  const box = char && computeLayout(vp, scene.layout.charSide, char, shownVariant(scene.layout.variant, s)).char;
  if (char && box) {
    const x = box.left * k, w = box.width * k, h = box.height * k;
    const y = H - box.bottom * k - h;
    // contact shadow under full-body figures
    if (!char.cut.bottom) {
      ctx.save();
      ctx.filter = `blur(${6 * k}px)`;
      const cy = H - box.bottom * k + vp.h * 0.022 * k - vp.h * 0.025 * k;
      ctx.translate(x + w / 2, cy);
      ctx.scale(1, (vp.h * 0.05 * k) / (w * 0.68));
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, (w * 0.68) / 2);
      g.addColorStop(0, 'rgb(0 0 0 / 0.5)');
      g.addColorStop(1, 'transparent');
      ctx.fillStyle = g;
      ctx.fillRect(-w, -w, w * 2, w * 2);
      ctx.restore();
    }
    // the figure, its drop shadow falling away from the light
    const lx = -scene.layout.light.x, ly = Math.max(0.3, -scene.layout.light.y);
    const img = await createImageBitmap(char.blob);
    ctx.save();
    ctx.shadowColor = 'rgb(0 0 0 / 0.32)';
    ctx.shadowBlur = 30 * k;
    ctx.shadowOffsetX = lx * 22 * k;
    ctx.shadowOffsetY = ly * 16 * k;
    ctx.drawImage(img, x, y, w, h);
    ctx.restore();
  }

  // Foreground fog lapping over the character's lower edge.
  g = ctx.createLinearGradient(0, H, 0, H - vp.h * 0.18 * k);
  g.addColorStop(0, haze);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('export failed'))), 'image/png'));
}

/** Saves the blob as a download named after now, e.g. tab-prettier-20260926-1843.png. */
export function download(blob: Blob) {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `tab-prettier-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}
