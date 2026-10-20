import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSun, Moon, Sun } from 'lucide-react';
import { weatherKind, type Weather } from '../hooks/useWeather';

export function WeatherIcon({ weather, size = 24 }: { weather: Weather; size?: number }) {
  const kind = weatherKind(weather.code);
  const props = { size, strokeWidth: 1.75, className: `wx-icon ${kind}` };
  switch (kind) {
    case 'clear':
      return weather.isDay ? <Sun {...props} /> : <Moon {...props} />;
    case 'partly':
      return <CloudSun {...props} />;
    case 'cloudy':
      return <Cloud {...props} />;
    case 'fog':
      return <CloudFog {...props} />;
    case 'drizzle':
      return <CloudDrizzle {...props} />;
    case 'rain':
      return <CloudRain {...props} />;
    case 'storm':
      return <CloudLightning {...props} />;
  }
}
