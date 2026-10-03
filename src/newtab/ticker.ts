/**
 * One shared, low-rate clock for the ambient motion (particles, breathing). Every repaint means a
 * full composite of the page, frosted glass and filters included, which costs far more than the
 * motion itself; so they all advance on the same ticks, and far fewer of them than the display's
 * refresh rate (a CSS animation would run at 60–165 Hz).
 */
const FPS = 20;
const subs = new Set<(now: number) => void>();
let timer = 0;

export function onTick(fn: (now: number) => void): () => void {
  subs.add(fn);
  timer ||= window.setInterval(() => {
    const now = performance.now();
    subs.forEach((f) => f(now));
  }, 1000 / FPS);
  return () => {
    subs.delete(fn);
    if (!subs.size) {
      clearInterval(timer);
      timer = 0;
    }
  };
}
