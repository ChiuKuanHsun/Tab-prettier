/**
 * One shared, low-rate clock for the ambient motion (particles, breathing, depth drift). Every
 * repaint means a full composite of the page, frosted glass and filters included, which costs far
 * more than the motion itself (measured: the cost follows the composites per second, not what
 * moves); so they all advance on the same ticks, as few as the motion allows. Each subscriber
 * names the rate it needs; the clock runs at the fastest one and calls everyone on every tick,
 * since a tick that composites anyway costs the slow subscribers nothing.
 */
const subs = new Map<(now: number) => void, number>();
let timer = 0, rate = 0;

function retime() {
  const r = Math.max(0, ...subs.values());
  if (r === rate) return;
  clearInterval(timer);
  rate = r;
  timer = r
    ? window.setInterval(() => {
        const now = performance.now();
        subs.forEach((_, f) => f(now));
      }, 1000 / r)
    : 0;
}

/** Fast enough for the falling particles. */
export const SMOOTH_FPS = 20;
/** Enough for slow drifts that move well under a pixel per tick (breathing, depth sway). */
export const SLOW_FPS = 8;

export function onTick(fn: (now: number) => void, fps = SMOOTH_FPS): () => void {
  subs.set(fn, fps);
  retime();
  return () => {
    subs.delete(fn);
    retime();
  };
}
