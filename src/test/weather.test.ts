import { describe, expect, it } from 'vitest';
import { weatherFog } from '../lib/weather';

describe('weatherFog', () => {
  it('hazes the distance in bad weather only', () => {
    expect(weatherFog('clear')).toBeUndefined();
    expect(weatherFog(undefined)).toBeUndefined();
    expect(weatherFog('fog')!.amount).toBeGreaterThan(weatherFog('rain')!.amount);
    expect(weatherFog('rain')!.amount).toBeGreaterThan(weatherFog('cloudy')!.amount);
  });

  it('darkens the haze for dusk and night scenes', () => {
    const day = weatherFog('fog', 'day')!.color;
    const night = weatherFog('fog', 'night')!.color;
    expect(night.every((c, i) => c < day[i])).toBe(true);
  });
});
