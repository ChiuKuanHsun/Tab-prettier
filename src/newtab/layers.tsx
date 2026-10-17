import { useEffect, useRef, useState } from 'preact/hooks';
import { DepthBackground, type DepthFog } from './DepthBackground';
import { onTick, SLOW_FPS } from './ticker';
import type { Layout } from '../lib/compose';
import type { ParticleKind, Scene } from '../lib/types';

export function Background({
  scene,
  url,
  depthUrl,
  depthStrength,
  fog,
  playing,
}: {
  scene: Scene;
  url: string;
  /** Depth map URL; with depthStrength > 0 or some fog the image is drawn through WebGL. */
  depthUrl?: string;
  depthStrength: number;
  /** Weather haze, thicker with distance (needs the depth map). */
  fog?: DepthFog;
  playing: boolean;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const [flat, setFlat] = useState(false);
  useEffect(() => setFlat(false), [url]);
  const useDepth = scene.bg.kind === 'image' && !!depthUrl && (depthStrength > 0 || !!fog) && !flat;
  useEffect(() => {
    const v = vid.current;
    if (!v) return;
    if (playing) void v.play().catch(() => {});
    else v.pause();
  }, [playing, url]);

  return (
    <div class="layer layer-bg" data-enter="bg">
      {scene.bg.kind === 'video' ? (
        <video ref={vid} class="bg-media" src={url} muted loop playsInline autoplay={playing} />
      ) : (
        <img class="bg-media" src={url} alt="" decoding="async" />
      )}
      {useDepth && (
        <DepthBackground
          src={url}
          depthSrc={depthUrl!}
          strength={depthStrength}
          fog={fog}
          running={playing}
          onReady={() => {}}
          onFail={() => setFlat(true)}
        />
      )}
      <div class="bg-haze" />
      <div class={`bg-scrim ${scene.theme.scrim ? 'is-strong' : ''}`} />
    </div>
  );
}

/** One breath: rise a quarter percent and swell 0.7% from the feet, eased in and out. */
const BREATH_MS = 7000;

export function Character({ scene, url, box, breathing }: { scene: Scene; url: string; box: NonNullable<Layout['char']>; breathing: boolean }) {
  const c = scene.char!;
  const fig = useRef<HTMLDivElement>(null);
  // On the shared ticker rather than a CSS animation, which would recomposite at the display's
  // rate; a slow one, since a breath moves the figure well under a pixel per tick.
  useEffect(() => {
    const el = fig.current;
    if (!breathing || !el) return;
    const off = onTick((now) => {
      const k = (1 - Math.cos((now / BREATH_MS) * 2 * Math.PI)) / 2;
      el.style.transform = `translateY(${(-0.25 * k).toFixed(4)}%) scale(${(1 + 0.007 * k).toFixed(5)})`;
    }, SLOW_FPS);
    return () => {
      off();
      el.style.transform = '';
    };
  }, [breathing]);
  // Drop shadow falls away from the estimated light.
  const lx = -scene.layout.light.x, ly = Math.max(0.3, -scene.layout.light.y);
  return (
    <div
      class="layer layer-char"
      data-enter={scene.layout.charSide === 'right' ? 'from-right' : 'from-left'}
      style={{ '--sx': `${(lx * 22).toFixed(1)}px`, '--sy': `${(ly * 16).toFixed(1)}px` }}
    >
      <div ref={fig} class={`char ${breathing ? 'is-breathing' : ''}`} style={{ left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px`, bottom: `${box.bottom}px` }}>
        {!c.cut.bottom && <div class="char-contact" />}
        <img class="char-img" src={url} alt="" decoding="async" draggable={false} />
      </div>
    </div>
  );
}

// --- Particles ------------------------------------------------------------------

type Kind = Exclude<ParticleKind, 'auto' | 'off'>;

export function autoParticle(month = new Date().getMonth()): Kind {
  if (month >= 2 && month <= 4) return 'sakura';
  if (month === 11 || month <= 1) return 'snow';
  return 'bokeh';
}

interface P { x: number; y: number; vx: number; vy: number; r: number; a: number; spin: number; rot: number; hue: number }

interface Sprite { img: HTMLCanvasElement; w: number; h: number }

/**
 * A particle shape drawn once into a small canvas, `w`×`h` around its centre (and blurred, for the
 * near plane), so a frame is only drawImage calls: no paths or gradients per particle, and no
 * full-screen blur over the whole canvas.
 */
function sprite(w: number, h: number, blur: number, paint: (c: CanvasRenderingContext2D) => void): Sprite {
  const res = 2 * Math.min(1.5, devicePixelRatio); // supersampled: particles are drawn up to ~1.5× this size
  const pad = Math.ceil(blur * 3) + 1;
  const W = w + pad * 2, H = h + pad * 2;
  const canvas = () => Object.assign(document.createElement('canvas'), { width: Math.ceil(W * res), height: Math.ceil(H * res) });
  const shape = canvas();
  const c = shape.getContext('2d')!;
  c.setTransform(res, 0, 0, res, (W / 2) * res, (H / 2) * res);
  paint(c);
  if (!blur) return { img: shape, w: W, h: H };
  const soft = canvas();
  const s = soft.getContext('2d')!;
  s.filter = `blur(${blur * res}px)`;
  s.drawImage(shape, 0, 0);
  return { img: soft, w: W, h: H };
}

/**
 * Falling or floating particles on one depth plane: `far` sits behind the character (most of them,
 * so the figure stays clear), `near` is a handful of large, fast, blurred ones in front of it, like
 * drops or petals close to the lens.
 */
export function Particles({ kind, accent, running, plane }: { kind: Kind; accent: string; running: boolean; plane: 'far' | 'near' }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(1.5, devicePixelRatio);
    let w = 0, h = 0;
    const resize = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
    };
    resize();
    addEventListener('resize', resize);

    const near = plane === 'near';
    const count = near ? (kind === 'rain' ? 10 : kind === 'bokeh' ? 3 : 5) : kind === 'rain' ? 90 : kind === 'bokeh' ? 22 : 38;
    // closer means bigger, faster (parallax) and fainter
    const toNear = (p: P): P => (near ? { ...p, r: p.r * 2.6, vx: p.vx * 1.5, vy: p.vy * 1.5, a: p.a * 0.55 } : p);
    const spawn = (anywhere: boolean): P => toNear({
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -20,
      vx: kind === 'rain' ? -1.2 : (Math.random() - 0.3) * 0.6,
      vy: kind === 'rain' ? 14 + Math.random() * 6 : kind === 'bokeh' ? -0.15 - Math.random() * 0.25 : 0.5 + Math.random() * 0.9,
      r: kind === 'bokeh' ? 6 + Math.random() * 26 : kind === 'rain' ? 10 + Math.random() * 14 : 2 + Math.random() * 4,
      a: kind === 'bokeh' ? 0.08 + Math.random() * 0.18 : 0.5 + Math.random() * 0.5,
      spin: (Math.random() - 0.5) * 0.04,
      rot: Math.random() * Math.PI,
      hue: Math.random(),
    });
    const ps = Array.from({ length: count }, () => spawn(true));

    // sprites are drawn at a mid-range radius and scaled to each particle's
    const blur = near ? 2.5 : 0;
    const R = (near ? 2.6 : 1) * (kind === 'rain' ? 17 : kind === 'bokeh' ? 19 : 4);
    const lw = near ? 2 : 1;
    const sprites: Sprite[] =
      kind === 'sakura'
        ? ['#f7c6d0', '#fbe1e6'].map((col) => sprite(R * 3.2, R * 2, blur, (c) => {
            c.fillStyle = col;
            c.beginPath();
            c.ellipse(0, 0, R * 1.6, R, 0, 0, Math.PI * 2);
            c.fill();
          }))
        : kind === 'snow'
          ? [sprite(R * 1.4, R * 1.4, blur, (c) => {
              c.fillStyle = '#fff';
              c.beginPath();
              c.arc(0, 0, R * 0.7, 0, Math.PI * 2);
              c.fill();
            })]
          : kind === 'rain'
            ? [sprite(lw, R, blur, (c) => {
                c.strokeStyle = 'rgba(220,230,255,.6)';
                c.lineWidth = lw;
                c.beginPath();
                c.moveTo(0, -R / 2);
                c.lineTo(0, R / 2);
                c.stroke();
              })]
            : ['#fff6e0', accent].map((col) => sprite(R * 2, R * 2, blur, (c) => {
                const g = c.createRadialGradient(0, 0, 0, 0, 0, R);
                g.addColorStop(0, col);
                g.addColorStop(1, 'transparent');
                c.fillStyle = g;
                c.beginPath();
                c.arc(0, 0, R, 0, Math.PI * 2);
                c.fill();
              }));

    const draw = (p: P) => {
      const s = sprites[kind === 'sakura' ? (p.hue > 0.5 ? 0 : 1) : kind === 'bokeh' ? (p.hue > 0.6 ? 0 : 1) : 0];
      let sx = p.r / R, sy = sx, rot = kind === 'sakura' ? p.rot : 0, cx = p.x, cy = p.y;
      if (kind === 'rain') {
        // a streak from the drop's head along its velocity, as long as r
        const dx = p.vx * 2;
        sx = 1; sy = Math.hypot(dx, p.r) / R; rot = Math.atan2(-dx, p.r);
        cx += dx / 2; cy += p.r / 2;
      }
      const cos = Math.cos(rot) * dpr, sin = Math.sin(rot) * dpr;
      ctx.globalAlpha = p.a;
      ctx.setTransform(cos * sx, sin * sx, -sin * sy, cos * sy, cx * dpr, cy * dpr);
      ctx.drawImage(s.img, -s.w / 2, -s.h / 2, s.w, s.h);
    };

    // speeds are per 60fps frame; dt scales them to the ticker's longer steps
    let last = performance.now(), t = 0;
    const frame = (now: number) => {
      const dt = Math.min(4, (now - last) / 16.7);
      last = now;
      t += dt;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i];
        p.x += (p.vx + (kind === 'sakura' || kind === 'snow' ? Math.sin(t * 0.02 + p.hue * 9) * 0.4 : 0)) * dt;
        p.y += p.vy * dt;
        p.rot += p.spin * dt;
        if (p.y > h + 30 || p.y < -40 || p.x < -40 || p.x > w + 40) {
          ps[i] = spawn(false);
          if (kind === 'bokeh') ps[i].y = h + 20;
        }
        draw(ps[i]);
      }
    };
    const off = running ? onTick(frame) : () => {};
    return () => {
      off();
      removeEventListener('resize', resize);
    };
  }, [kind, accent, running, plane]);

  return <canvas ref={ref} class={`layer layer-particles is-${plane}`} data-enter="fade" aria-hidden="true" />;
}
