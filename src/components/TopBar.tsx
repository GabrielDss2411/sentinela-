import { ChevronDown, CircleUser, Shield } from 'lucide-react';
import { fmtDate, fmtTime, useClock } from '../hooks/useClock';
import type { Weather } from '../hooks/useWeather';
import type { Place } from '../lib/geocode';
import type { Zone } from '../lib/zones';
import { GlobalSearch } from './GlobalSearch';
import { WeatherIcon } from './WeatherIcon';

type Props = {
  zones: Zone[];
  weather: Weather | null;
  onPickZone: (z: Zone) => void;
  onPickPlace: (p: Place) => void;
  onBrand: () => void;
};

export function TopBar({ zones, weather, onPickZone, onPickPlace, onBrand }: Props) {
  const now = useClock();
  return (
    <header className="topbar">
      <button className="brand" onClick={onBrand} title="Visão geral">
        <span className="brand-mark">
          <Shield size={26} strokeWidth={1.6} />
        </span>
        <span className="brand-text">
          <strong>SENTINELA</strong>
          <small>Informação · Planejamento · Ação</small>
        </span>
      </button>

      <GlobalSearch zones={zones} onPickZone={onPickZone} onPickPlace={onPickPlace} />

      <div className="top-stats">
        <div className="top-clock">
          <strong>{fmtTime(now)}</strong>
          <small>{fmtDate(now)}</small>
        </div>
        {weather && (
          <div className="top-weather">
            <WeatherIcon weather={weather} size={28} />
            <span>
              <strong>{weather.tempC}°C</strong>
              <small>Rio de Janeiro · RJ</small>
            </span>
          </div>
        )}
        <div className="top-user">
          <CircleUser size={30} strokeWidth={1.5} />
          <span>
            <strong>Operador</strong>
            <small>Sessão local</small>
          </span>
          <ChevronDown size={16} />
        </div>
      </div>
    </header>
  );
}
