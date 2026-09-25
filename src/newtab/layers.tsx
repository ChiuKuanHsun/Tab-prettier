import { useEffect, useRef, useState } from 'preact/hooks';
import { DepthBackground } from './DepthBackground';
import type { Layout } from '../lib/compose';
import type { ParticleKind, Scene } from '../lib/types';

export function Background({
  scene,
  url,
  depthUrl,
  depthStrength,
  playing,
}: {
  scene: Scene;
  url: string;
  /** Depth map URL; with depthStrength > 0 the image is drawn through the 2.5D WebGL warp. */
  depthUrl?: string;
  depthStrength: number;
  playing: boolean;
}) {
  const vid = useRef<HTMLVideoElement>(null);
  const [flat, setFlat] = useState(false);
  useEffect(() => setFlat(false), [url]);
  const useDepth = scene.bg.kind === 'image' && !!depthUrl && depthStrength > 0 && !flat;
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

export function Character({ scene, url, box }: { scene: Scene; url: string; box: NonNullable<Layout['char']> }) {
  const c = scene.char!;
  // Drop shadow falls away from the estimated light.
  const lx = -scene.layout.light.x, ly = Math.max(0.3, -scene.layout.light.y);
  return (
    <div
      class="layer layer-char"
      data-enter={scene.layout.charSide === 'right' ? 'from-right' : 'from-left'}
      style={{ '--sx': `${(lx * 22).toFixed(1)}px`, '--sy': `${(ly * 16).toFixed(1)}px` }}
    >
      <div class="char" style={{ left: `${box.left}px`, width: `${box.width}px`, height: `${box.height}px`, bottom: `${box.bottom}px` }}>
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

export function Particles({ kind, accent, running }: { kind: Kind; accent: string; running: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!;
    const ctx = cv.getContext('2d')!;
    const dpr = Math.min(1.5, devicePixelRatio);
    let w = 0, h = 0;
    const resize = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    addEventListener('resize', resize);

    const count = kind === 'rain' ? 90 : kind === 'bokeh' ? 22 : 38;
    const spawn = (anywhere: boolean): P => ({
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

    const draw = (p: P) => {
      ctx.globalAlpha = p.a;
      if (kind === 'sakura') {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.hue > 0.5 ? '#f7c6d0' : '#fbe1e6';
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r * 1.6, p.r, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (kind === 'snow') {
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (kind === 'rain') {
        ctx.strokeStyle = 'rgba(220,230,255,.6)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.vx * 2, p.y + p.r);
        ctx.stroke();
      } else {
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.r);
        g.addColorStop(0, p.hue > 0.6 ? '#fff6e0' : accent);
        g.addColorStop(1, 'transparent');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    // 30fps budget
    let raf = 0, last = 0, t = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      if (now - last < 33) return;
      const dt = Math.min(3, (now - last) / 16.7);
      last = now;
      t += dt;
      ctx.clearRect(0, 0, w, h);
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
    if (running) raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('resize', resize);
    };
  }, [kind, accent, running]);

  return <canvas ref={ref} class="layer layer-particles" data-enter="fade" aria-hidden="true" />;
}
