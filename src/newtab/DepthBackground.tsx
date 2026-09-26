import { useEffect, useRef } from 'preact/hooks';
import { pointer } from './motion';

const VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

// 2.5D warp: each pixel samples the image displaced by the camera shift, scaled by how far its
// depth is from the focal plane. A few fixed-point steps make the lookup follow the displaced
// surface rather than the source position, which keeps near edges from smearing as much.
const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uImg;
uniform sampler2D uDepth;
uniform vec2 uScale;
uniform vec2 uOffset;
uniform vec2 uShift;
uniform float uFocus;
uniform vec3 uFogColor;
uniform float uFog;
void main() {
  vec2 uv = vUv * uScale + uOffset;
  vec2 p = uv;
  for (int i = 0; i < 4; i++) {
    float d = texture(uDepth, p).r;
    p = uv - uShift * (d - uFocus);
  }
  outColor = texture(uImg, p);
  // weather haze: the farther the pixel (dark in the depth map), the more of the fog colour
  float far = 1.0 - texture(uDepth, p).r;
  outColor.rgb = mix(outColor.rgb, uFogColor, uFog * smoothstep(0.2, 0.95, far));
}`;

const ZOOM = 1.08; // headroom so the warp never reveals the image edge
const MAX_SHIFT = 0.018; // image-UV units at depthMotion ×1

function compile(gl: WebGL2RenderingContext, type: number, src: string) {
  const s = gl.createShader(type)!;
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
  return s;
}

function texture(gl: WebGL2RenderingContext, unit: number, img: HTMLImageElement) {
  const t = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

async function load(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  return img;
}

/** Weather haze over the far part of the picture: how much (0..1) and its colour (0..1 RGB). */
export interface DepthFog { amount: number; color: [number, number, number] }

/**
 * Background drawn through WebGL with a depth-driven parallax: the eased pointer moves the
 * camera, plus a slow drift so the scene breathes on its own; `fog` hazes the distance. Renders
 * at ≤30fps and only while the tab is visible (with no motion, only when the fog changes). Calls
 * `onFail` (so the caller can show the flat image) if WebGL2 or the textures aren't available.
 */
export function DepthBackground({
  src,
  depthSrc,
  strength,
  fog,
  running,
  onReady,
  onFail,
}: {
  src: string;
  depthSrc: string;
  strength: number;
  fog?: DepthFog;
  running: boolean;
  onReady: () => void;
  onFail: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  // Read live by the render loop, so changing them never rebuilds the GL pipeline.
  const strengthRef = useRef(strength);
  const runningRef = useRef(running);
  const fogRef = useRef(fog);
  strengthRef.current = strength;
  runningRef.current = running;
  fogRef.current = fog;

  // The context is only thrown away when the canvas itself goes: a lost context stays lost on
  // that canvas, so losing it between scenes (or slider steps) would leave it blank for good.
  useEffect(() => {
    const cv = ref.current; // captured now: the ref may already be cleared when this cleanup runs
    return () => cv?.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  }, []);

  // (Re)builds the pipeline for a new image + depth map on the same context.
  useEffect(() => {
    const cv = ref.current!;
    const gl = cv.getContext('webgl2', { alpha: false, antialias: false, premultipliedAlpha: false });
    if (!gl) {
      onFail();
      return;
    }
    let raf = 0, alive = true, last = 0;
    let cleanup = () => {};
    let release = () => {};
    const t0 = performance.now();

    void (async () => {
      try {
        const [img, dep] = await Promise.all([load(src), load(depthSrc)]);
        if (!alive) return;
        const prog = gl.createProgram()!;
        gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
        gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
        gl.linkProgram(prog);
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog) ?? 'link');
        gl.useProgram(prog);

        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aPos');
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

        const texImg = texture(gl, 0, img);
        const texDepth = texture(gl, 1, dep);
        release = () => {
          gl.deleteTexture(texImg);
          gl.deleteTexture(texDepth);
          gl.deleteBuffer(buf);
          gl.deleteProgram(prog);
        };
        gl.uniform1i(gl.getUniformLocation(prog, 'uImg'), 0);
        gl.uniform1i(gl.getUniformLocation(prog, 'uDepth'), 1);
        gl.uniform1f(gl.getUniformLocation(prog, 'uFocus'), 0.45);
        const uScale = gl.getUniformLocation(prog, 'uScale');
        const uOffset = gl.getUniformLocation(prog, 'uOffset');
        const uShift = gl.getUniformLocation(prog, 'uShift');
        const uFog = gl.getUniformLocation(prog, 'uFog');
        const uFogColor = gl.getUniformLocation(prog, 'uFogColor');
        let drawnFog = '';

        const resize = () => {
          const dpr = Math.min(1.5, devicePixelRatio);
          cv.width = Math.round(cv.clientWidth * dpr);
          cv.height = Math.round(cv.clientHeight * dpr);
          gl.viewport(0, 0, cv.width, cv.height);
          // object-fit: cover, then zoom in for warp headroom
          const ca = cv.width / cv.height, ia = img.width / img.height;
          const sx = (ca < ia ? ca / ia : 1) / ZOOM, sy = (ca < ia ? 1 : ia / ca) / ZOOM;
          gl.uniform2f(uScale, sx, sy);
          gl.uniform2f(uOffset, (1 - sx) / 2, (1 - sy) / 2);
        };
        resize();
        addEventListener('resize', resize);

        const draw = (now: number) => {
          const t = (now - t0) / 1000;
          const amp = MAX_SHIFT * strengthRef.current;
          // pointer y is screen-down; texture v is up
          const dx = pointer.x + 0.35 * Math.sin(t * 0.13);
          const dy = -pointer.y + 0.25 * Math.cos(t * 0.09);
          gl.uniform2f(uShift, dx * amp, dy * amp);
          const f = fogRef.current;
          gl.uniform1f(uFog, f?.amount ?? 0);
          gl.uniform3f(uFogColor, ...(f?.color ?? [0, 0, 0]));
          drawnFog = JSON.stringify(f);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        };
        const frame = (now: number) => {
          raf = requestAnimationFrame(frame);
          if (!runningRef.current || now - last < 33) return;
          // a still picture (no motion) is only redrawn when the fog changes
          if (strengthRef.current <= 0 && JSON.stringify(fogRef.current) === drawnFog) return;
          last = now;
          draw(now);
        };
        draw(performance.now());
        onReady();
        raf = requestAnimationFrame(frame);
        cleanup = () => removeEventListener('resize', resize);
      } catch (e) {
        console.warn('[depth] falling back to flat background', e);
        if (alive) onFail();
      }
    })();

    const lost = (e: Event) => {
      e.preventDefault();
      onFail();
    };
    cv.addEventListener('webglcontextlost', lost);
    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      cleanup();
      cv.removeEventListener('webglcontextlost', lost);
      release();
    };
  }, [src, depthSrc]);

  return <canvas ref={ref} class="bg-media is-depth" aria-hidden="true" />;
}
