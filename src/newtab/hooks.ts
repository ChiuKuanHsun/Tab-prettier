import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Broadcast } from '../lib/messages';
import { send } from '../lib/messages';
import { timeBucket } from '../lib/curation';
import { pickScene } from '../lib/scene-store';
import { getSettings, onKeyChange } from '../lib/settings';
import type { Scene, Settings } from '../lib/types';

export function useSettings(): Settings | undefined {
  const [s, setS] = useState<Settings>();
  useEffect(() => {
    void getSettings().then(setS);
    return onKeyChange<Settings>('settings', () => void getSettings().then(setS));
  }, []);
  return s;
}

export function useViewport() {
  const [vp, setVp] = useState({ w: innerWidth, h: innerHeight });
  useEffect(() => {
    const on = () => setVp({ w: innerWidth, h: innerHeight });
    addEventListener('resize', on);
    return () => removeEventListener('resize', on);
  }, []);
  return vp;
}

export function useMedia(query: string) {
  const [m, setM] = useState(() => matchMedia(query).matches);
  useEffect(() => {
    const mq = matchMedia(query);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return m;
}

interface BatteryManager extends EventTarget { charging: boolean }

/** Power-save when forced on, or in auto mode while running on battery. */
export function usePowerSave(mode: Settings['powerSave'] | undefined) {
  const [onBattery, setOnBattery] = useState(false);
  useEffect(() => {
    if (mode !== 'auto') return;
    const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManager> };
    let bm: BatteryManager | undefined;
    const on = () => bm && setOnBattery(!bm.charging);
    void nav.getBattery?.().then((b) => {
      bm = b;
      on();
      b.addEventListener('chargingchange', on);
    });
    return () => bm?.removeEventListener('chargingchange', on);
  }, [mode]);
  return mode === 'on' || mode === 'cache' || (mode === 'auto' && onBattery);
}

export function usePageVisible() {
  const [v, setV] = useState(!document.hidden);
  useEffect(() => {
    const on = () => setV(!document.hidden);
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return v;
}

/**
 * The scene for this tab. `undefined` while loading, `null` when nothing is ready yet (first
 * run) — in that case it picks up the first scene as soon as the offscreen worker reports one.
 */
export function useScene(settings: Settings | undefined, lowPower: boolean) {
  const [scene, setScene] = useState<Scene | null>();
  const rotation = settings?.rotation;
  const rule = settings && { rotation: settings.rotation, rotationMinutes: settings.rotationMinutes, rotationTabs: settings.rotationTabs };
  const favWeight = settings?.favoritesWeight ?? 0;
  const bucket = settings?.sources.timeAware ? timeBucket() : undefined;
  const cacheOnly = settings?.powerSave === 'cache';
  const favoritesOnly = settings?.favoritesOnly;

  useEffect(() => {
    if (!rule) return;
    let alive = true;
    void pickScene(rule, { favWeight, bucket, cacheOnly, favoritesOnly }).then((s) => alive && setScene(s ?? null));
    void send({ to: 'bg', type: 'refill', lowPower });
    const onMsg = (m: Broadcast) => {
      if (m?.type !== 'queue-updated') return;
      setScene((cur) => {
        if (cur === null) void pickScene(rule, { favWeight: 0, force: true, bucket }).then((s) => s && alive && setScene(s));
        return cur;
      });
    };
    chrome.runtime.onMessage.addListener(onMsg);
    return () => {
      alive = false;
      chrome.runtime.onMessage.removeListener(onMsg);
    };
    // lowPower only matters for the first refill request, so it is not a dependency
  }, [rotation]);

  /** Swaps in the next scene now; `favoritesOnly` overrides the setting (it may not have saved yet). */
  const next = async (opts: { favoritesOnly?: boolean } = {}) => {
    if (!rule) return false;
    const s = await pickScene(rule, { favWeight, force: true, bucket, cacheOnly, favoritesOnly, ...opts });
    void send({ to: 'bg', type: 'refill', lowPower });
    if (s && s.id !== scene?.id) {
      setScene(s);
      return true;
    }
    return false;
  };

  const urls = useMemo(() => {
    if (!scene) return undefined;
    return {
      bg: URL.createObjectURL(scene.bg.blob),
      char: scene.char ? URL.createObjectURL(scene.char.blob) : undefined,
      depth: scene.bg.depth ? URL.createObjectURL(scene.bg.depth) : undefined,
    };
  }, [scene]);
  useEffect(
    () => () => {
      if (urls) {
        URL.revokeObjectURL(urls.bg);
        if (urls.char) URL.revokeObjectURL(urls.char);
        if (urls.depth) URL.revokeObjectURL(urls.depth);
      }
    },
    [urls],
  );

  return { scene, urls, next, setScene };
}

export function useNow(granularityMs = 60_000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      setNow(new Date());
      t = setTimeout(tick, granularityMs - (Date.now() % granularityMs) + 20);
    };
    t = setTimeout(tick, granularityMs - (Date.now() % granularityMs) + 20);
    return () => clearTimeout(t);
  }, [granularityMs]);
  return now;
}
