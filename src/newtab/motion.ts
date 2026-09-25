/**
 * Pointer parallax: eases CSS custom properties --px/--py (-1..1) on `root`; each layer maps
 * them to its own depth in CSS. The rAF loop only runs while the values are settling.
 */
export function startParallax(root: HTMLElement): () => void {
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0;
  const tick = () => {
    x += (tx - x) * 0.07;
    y += (ty - y) * 0.07;
    root.style.setProperty('--px', x.toFixed(4));
    root.style.setProperty('--py', y.toFixed(4));
    raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.0015 ? requestAnimationFrame(tick) : 0;
  };
  const kick = () => (raf ||= requestAnimationFrame(tick));
  const onMove = (e: PointerEvent) => {
    tx = (e.clientX / innerWidth) * 2 - 1;
    ty = (e.clientY / innerHeight) * 2 - 1;
    kick();
  };
  const onLeave = () => {
    tx = ty = 0;
    kick();
  };
  addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('pointerleave', onLeave);
  return () => {
    cancelAnimationFrame(raf);
    removeEventListener('pointermove', onMove);
    document.documentElement.removeEventListener('pointerleave', onLeave);
  };
}

const KEYFRAMES: Record<string, Keyframe[]> = {
  bg: [{ opacity: 0, transform: 'scale(1.1)' }, { opacity: 1, transform: 'scale(1)' }],
  rise: [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'none' }],
  fade: [{ opacity: 0 }, { opacity: 1 }],
  'from-left': [{ opacity: 0, transform: 'translateX(-40px)' }, { opacity: 1, transform: 'none' }],
  'from-right': [{ opacity: 0, transform: 'translateX(40px)' }, { opacity: 1, transform: 'none' }],
};

/** Staggered layer entrance, ≤400ms in total. Elements opt in with data-enter="<kind>". */
export function playEnter(root: HTMLElement) {
  const els = [...root.querySelectorAll<HTMLElement>('[data-enter]')];
  els.forEach((el, i) => {
    el.animate(KEYFRAMES[el.dataset.enter!] ?? KEYFRAMES.fade, {
      duration: 300,
      delay: Math.min(i * 25, 100),
      easing: 'cubic-bezier(.2,.8,.2,1)',
      fill: 'backwards',
    });
  });
}
