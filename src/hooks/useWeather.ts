import { useEffect, useState } from 'react';

const POLL_MS = 15 * 60_000;
// Open-Meteo: free forecast API, no key (https://open-meteo.com).
const URL =
  'https://api.open-meteo.com/v1/forecast?latitude=-22.91&longitude=-43.2&timezone=America%2FSao_Paulo' +
  '&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,visibility,is_day';

export type Weather = {
  tempC: number;
  humidity: number;
  windKmh: number;
  visibilityKm: number;
  code: number;
  isDay: boolean;
};

export type WeatherKind = 'clear' | 'partly' | 'cloudy' | 'fog' | 'drizzle' | 'rain' | 'storm';

/** WMO weather codes grouped into the few looks the UI has icons for. */
export function weatherKind(code: number): WeatherKind {
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code <= 48) return 'fog';
  if (code <= 57) return 'drizzle';
  if (code <= 82) return 'rain';
  return 'storm';
}

export function useWeather() {
  const [weather, setWeather] = useState<Weather | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch(URL);
        if (!res.ok) return;
        const { current: c } = (await res.json()) as { current: Record<string, number> };
        if (cancelled) return;
        setWeather({
          tempC: Math.round(c.temperature_2m),
          humidity: Math.round(c.relative_humidity_2m),
          windKmh: Math.round(c.wind_speed_10m),
          visibilityKm: Math.round(c.visibility / 1000),
          code: c.weather_code,
          isDay: c.is_day === 1,
        });
      } catch {
        /* offline: keep the last reading */
      }
    };
    void load();
    const t = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return weather;
}
