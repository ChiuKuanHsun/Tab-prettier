/**
 * Current weather from Open-Meteo (free, no key). The new tab fetches it (30-minute cache) and
 * leaves the latest reading in IndexedDB, where the offscreen pipeline picks it up to steer
 * background choice toward rainy or snowy scenes.
 */
import { locale, t } from '../i18n';
import { kvGet, kvSet } from './db';
import type { TimeBucket } from './curation';
import type { WeatherLocation } from './types';

export type WeatherMood = 'clear' | 'cloudy' | 'fog' | 'rain' | 'snow' | 'storm';

export interface WeatherNow {
  temp: number;
  code: number;
  isDay: boolean;
  mood: WeatherMood;
}

/** WMO weather interpretation codes → a coarse mood. */
export function moodOf(code: number): WeatherMood {
  if (code <= 1) return 'clear';
  if (code <= 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'storm';
  if (code >= 51) return 'rain';
  return 'cloudy';
}

export const MOOD_LABEL: Record<WeatherMood, string> = {
  clear: t('lib.mood.clear'),
  cloudy: t('lib.mood.cloudy'),
  fog: t('lib.mood.fog'),
  rain: t('lib.mood.rain'),
  snow: t('lib.mood.snow'),
  storm: t('lib.mood.storm'),
};

/** Wallhaven queries for weather that should show in the background. */
export const WEATHER_QUERIES: Partial<Record<WeatherMood, string[]>> = {
  rain: ['rain -girl -boy', 'rainy -girl -boy'],
  storm: ['rain -girl -boy', 'rainy -girl -boy'],
  snow: ['snow -girl -boy', 'winter -girl -boy'],
  fog: ['fog -girl -boy'],
};

/** Particle effect the weather calls for, when particles are on "auto". */
export function weatherParticle(mood: WeatherMood | undefined): 'rain' | 'snow' | undefined {
  if (mood === 'rain' || mood === 'storm') return 'rain';
  if (mood === 'snow') return 'snow';
  return undefined;
}

/** Haze for the far part of the background, by weather: amount and base colour (0..1 RGB). */
const FOG: Partial<Record<WeatherMood, [number, [number, number, number]]>> = {
  fog: [0.55, [0.78, 0.79, 0.82]],
  rain: [0.3, [0.6, 0.64, 0.7]],
  storm: [0.36, [0.52, 0.55, 0.62]],
  snow: [0.32, [0.86, 0.88, 0.93]],
  cloudy: [0.12, [0.74, 0.76, 0.8]],
};
/** Darker haze for scenes that look like dusk or night, so it doesn't glow. */
const FOG_LIGHT: Record<TimeBucket, number> = { day: 1, evening: 0.72, night: 0.42 };

/** Weather haze for a scene (thicker with distance on the new tab), or none in clear weather. */
export function weatherFog(mood: WeatherMood | undefined, bucket: TimeBucket = 'day') {
  const f = mood && FOG[mood];
  if (!f) return undefined;
  const k = FOG_LIGHT[bucket];
  return { amount: f[0], color: f[1].map((c) => c * k) as [number, number, number] };
}

const LAST = 'weather:last';

export async function getWeather(loc: WeatherLocation): Promise<WeatherNow> {
  const key = `weather:${loc.latitude.toFixed(2)},${loc.longitude.toFixed(2)}`;
  const hit = await kvGet<WeatherNow>(key, 30 * 60_000);
  if (hit) return hit;
  const params = new URLSearchParams({
    latitude: String(loc.latitude),
    longitude: String(loc.longitude),
    current: 'temperature_2m,weather_code,is_day',
    timezone: 'auto',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const c = (await res.json()).current as { temperature_2m: number; weather_code: number; is_day: number };
  const w: WeatherNow = { temp: c.temperature_2m, code: c.weather_code, isDay: c.is_day === 1, mood: moodOf(c.weather_code) };
  await kvSet(key, w);
  await kvSet(LAST, w);
  return w;
}

/** The most recent reading (for the offscreen pipeline), if it is less than two hours old. */
export const lastWeather = () => kvGet<WeatherNow>(LAST, 2 * 3_600_000);

export interface Place { name: string; admin1?: string; country?: string; latitude: number; longitude: number }

async function ipLookup(): Promise<{ city: string; latitude: number; longitude: number }> {
  try {
    const r = await (await fetch('https://ipwho.is/?fields=success,city,latitude,longitude')).json();
    if (r.success && r.city) return r;
  } catch {
    /* fall through to the second service */
  }
  const r = await (await fetch('https://ipinfo.io/json')).json();
  const [latitude, longitude] = String(r.loc).split(',').map(Number);
  if (!r.city || Number.isNaN(latitude)) throw new Error(t('lib.ipLocateFailed'));
  return { city: r.city, latitude, longitude };
}

/**
 * City-level location from the network's IP (cached 12 hours). The English city name is
 * localised through Open-Meteo's geocoder when it finds a nearby match.
 */
/** Location from the IP address, cached for 12 hours; `force` looks it up again now. */
export async function detectLocation(force = false): Promise<WeatherLocation> {
  const hit = force ? undefined : await kvGet<WeatherLocation>('geo:ip', 12 * 3_600_000);
  if (hit) return hit;
  const ip = await ipLookup();
  let name = ip.city;
  try {
    const near = (await geocode(ip.city)).find(
      (p) => Math.abs(p.latitude - ip.latitude) < 0.5 && Math.abs(p.longitude - ip.longitude) < 0.5,
    );
    if (near) name = near.name;
  } catch {
    /* keep the English name */
  }
  const loc = { name, latitude: ip.latitude, longitude: ip.longitude };
  await kvSet('geo:ip', loc);
  return loc;
}

export async function resolveLocation(
  mode: 'auto' | 'manual' | 'off',
  manual: WeatherLocation | null,
): Promise<WeatherLocation | null> {
  if (mode === 'off') return null;
  if (mode === 'manual' && manual) return manual;
  return detectLocation();
}

export async function geocode(q: string): Promise<Place[]> {
  const params = new URLSearchParams({ name: q.trim(), count: '6', language: locale === 'en' ? 'en' : 'zh', format: 'json' });
  const res = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${params}`);
  if (!res.ok) throw new Error(`geocoding HTTP ${res.status}`);
  return ((await res.json()).results ?? []) as Place[];
}
