import * as ort from 'onnxruntime-web/webgpu';
import { canvas } from './image';

// Depth Anything V2 Small (Apache-2.0), fp16 weights with float32 IO. Relative inverse depth:
// larger = nearer. Input sides must be multiples of 14; 518 is the model's native short side.
const SHORT = 518;
const MEAN = [0.485, 0.456, 0.406], STD = [0.229, 0.224, 0.225];

let sessionP: Promise<ort.InferenceSession> | undefined;

function session() {
  sessionP ??= (async () => {
    const url = chrome.runtime.getURL('models/depth-anything-v2-small-fp16.onnx');
    const model = new Uint8Array(await (await fetch(url)).arrayBuffer());
    try {
      return await ort.InferenceSession.create(model, { executionProviders: ['webgpu'] });
    } catch {
      return ort.InferenceSession.create(model, { executionProviders: ['wasm'] });
    }
  })();
  sessionP.catch(() => (sessionP = undefined));
  return sessionP;
}

const mult14 = (v: number) => Math.max(14, Math.round(v / 14) * 14);

/**
 * Estimates a depth map for a background and returns it as a small greyscale WebP (white =
 * near), normalised between the 1st and 99th percentiles and softened so the 2.5D warp in the
 * new tab stretches smoothly instead of tearing at object edges.
 */
export async function estimateDepth(src: CanvasImageSource & { width: number; height: number }, outW = 640): Promise<Blob> {
  const aspect = src.width / src.height;
  const h = SHORT, w = Math.min(1036, mult14(SHORT * aspect));
  const { ctx } = canvas(w, h);
  ctx.drawImage(src, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const plane = w * h;
  const input = new Float32Array(3 * plane);
  for (let i = 0, p = 0; p < plane; i += 4, p++) {
    for (let c = 0; c < 3; c++) input[p + c * plane] = (rgba[i + c] / 255 - MEAN[c]) / STD[c];
  }
  const sess = await session();
  const out = await sess.run({ pixel_values: new ort.Tensor('float32', input, [1, 3, h, w]) });
  const t = out.predicted_depth;
  const [dh, dw] = t.dims.slice(-2) as [number, number];
  const d = t.data as Float32Array;

  const sorted = Float32Array.from(d.filter((_, i) => i % 7 === 0)).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  const range = hi - lo || 1;

  const raw = canvas(dw, dh);
  const img = raw.ctx.createImageData(dw, dh);
  for (let i = 0; i < d.length; i++) {
    const v = Math.max(0, Math.min(255, ((d[i] - lo) / range) * 255));
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  raw.ctx.putImageData(img, 0, 0);
  t.dispose?.();

  const outH = Math.round(outW / aspect);
  const soft = canvas(outW, outH);
  // Sharp copy underneath, blurred copy on top: at the borders the blur fades to transparent
  // and reveals the sharp values instead of black.
  soft.ctx.drawImage(raw.c, 0, 0, outW, outH);
  soft.ctx.filter = 'blur(3px)';
  soft.ctx.drawImage(raw.c, 0, 0, outW, outH);
  return soft.c.convertToBlob({ type: 'image/webp', quality: 0.9 });
}

export async function releaseDepth() {
  const s = await sessionP?.catch(() => undefined);
  sessionP = undefined;
  await s?.release();
}
