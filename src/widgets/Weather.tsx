import { useEffect, useState } from 'preact/hooks';
import type { WeatherLocation } from '../lib/types';
import { getWeather, MOOD_LABEL, resolveLocation, type WeatherMood, type WeatherNow } from '../lib/weather';

export function useWeather(mode: 'auto' | 'manual' | 'off' | undefined, manual: WeatherLocation | null | undefined) {
  const [state, setState] = useState<{ w: WeatherNow; place: string }>();
  useEffect(() => {
    if (!mode || mode === 'off') {
      setState(undefined);
      return;
    }
    let alive = true;
    const load = async () => {
      try {
        const loc = await resolveLocation(mode, manual ?? null);
        if (!loc) return;
        const w = await getWeather(loc);
        if (alive) setState({ w, place: loc.name });
      } catch {
        /* no weather this time */
      }
    };
    void load();
    const t = setInterval(load, 30 * 60_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [mode, manual?.latitude, manual?.longitude]);
  return state;
}

/** Hairline weather glyphs matching the dock icons. */
function Glyph({ mood, isDay }: { mood: WeatherMood; isDay: boolean }) {
  const cloud = <path d="M7 18h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 9.1 4.5 4.5 0 0 0 7 18z" />;
  switch (mood) {
    case 'clear':
      return isDay ? (
        <>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4" />
        </>
      ) : (
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
      );
    case 'cloudy':
      return cloud;
    case 'fog':
      return <path d="M4 9h16M3 13h18M5 17h14" />;
    case 'rain':
    case 'storm':
      return (
        <>
          <path d="M7 15h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 6.1 4.5 4.5 0 0 0 7 15z" />
          {mood === 'storm' ? <path d="m12 16-2 3h3l-2 3" /> : <path d="M9 18l-1 2.5M13 18l-1 2.5M17 18l-1 2.5" />}
        </>
      );
    case 'snow':
      return (
        <>
          <path d="M7 15h10a4 4 0 0 0 .6-7.96A5.5 5.5 0 0 0 7.1 6.1 4.5 4.5 0 0 0 7 15z" />
          <path d="M9 19h.01M12 21h.01M15 19h.01" />
        </>
      );
  }
}

export function WeatherBadge({ w, place }: { w: WeatherNow; place: string }) {
  return (
    <span class="weather" title={`${place}:${MOOD_LABEL[w.mood]} ${Math.round(w.temp)}°C`}>
      <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
        <Glyph mood={w.mood} isDay={w.isDay} />
      </svg>
      <span>{Math.round(w.temp)}°</span>
      <span class="sr-only">
        {place} {MOOD_LABEL[w.mood]}
      </span>
    </span>
  );
}
