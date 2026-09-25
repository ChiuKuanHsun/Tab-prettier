import * as ort from 'onnxruntime-web/webgpu';
import { canvas } from './image';

const SIZE = 1024;
// The wasm binary is emitted by Vite next to this bundle and resolved via import.meta.url.
// Extension pages aren't cross-origin isolated, so no SharedArrayBuffer threads.
ort.env.wasm.numThreads = 1;

let sessionP: Promise<ort.InferenceSession> | undefined;
export let backend: 'webgpu' | 'wasm' | undefined;

function session() {
  sessionP ??= (async () => {
    const url = chrome.runtime.getURL('models/anime-seg-fp16.onnx');
    const model = new Uint8Array(await (await fetch(url)).arrayBuffer());
    if ('gpu' in navigator) {
      try {
        const s = await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
        backend = 'webgpu';
        return s;
      } catch (e) {
        console.warn('[seg] WebGPU unavailable, falling back to wasm', e);
      }
    }
    backend = 'wasm';
    return ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
  })();
  sessionP.catch(() => (sessionP = undefined));
  return sessionP;
}

/**
 * Runs the anime segmentation model on `src` and returns a foreground probability mask
 * (0..1) at `outW`×`outH`. The model takes a 1024² letterboxed RGB tensor.
 */
export async function segment(
  src: CanvasImageSource & { width: number; height: number },
  outW: number,
  outH: number,
): Promise<Float32Array> {
  const s = SIZE / Math.max(src.width, src.height);
  const nw = Math.round(src.width * s), nh = Math.round(src.height * s);
  const px = Math.floor((SIZE - nw) / 2), py = Math.floor((SIZE - nh) / 2);

  const { ctx } = canvas(SIZE, SIZE);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(src, px, py, nw, nh);
  const rgba = ctx.getImageData(0, 0, SIZE, SIZE).data;
  const input = new Float32Array(3 * SIZE * SIZE);
  const plane = SIZE * SIZE;
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    input[p] = rgba[i] / 255;
    input[p + plane] = rgba[i + 1] / 255;
    input[p + 2 * plane] = rgba[i + 2] / 255;
  }

  const sess = await session();
  const out = await sess.run({ img: new ort.Tensor('float32', input, [1, 3, SIZE, SIZE]) });
  const mask = out.mask.data as Float32Array;
  out.mask.dispose?.();

  // Crop the letterbox and resample to the requested size through a canvas (bilinear).
  const m = canvas(nw, nh);
  const img = m.ctx.createImageData(nw, nh);
  for (let y = 0; y < nh; y++) {
    for (let x = 0; x < nw; x++) {
      const v = Math.max(0, Math.min(255, mask[(y + py) * SIZE + x + px] * 255));
      const o = (y * nw + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = v;
      img.data[o + 3] = 255;
    }
  }
  m.ctx.putImageData(img, 0, 0);
  const r = canvas(outW, outH);
  r.ctx.imageSmoothingQuality = 'high';
  r.ctx.drawImage(m.c, 0, 0, outW, outH);
  const d = r.ctx.getImageData(0, 0, outW, outH).data;
  const res = new Float32Array(outW * outH);
  for (let i = 0; i < res.length; i++) res[i] = d[i * 4] / 255;
  return res;
}

export async function releaseModel() {
  const s = await sessionP?.catch(() => undefined);
  sessionP = undefined;
  await s?.release();
}
