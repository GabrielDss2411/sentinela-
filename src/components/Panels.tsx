import { Construction } from 'lucide-react';
import { INCIDENT_WINDOWS, type IncidentWindow } from '../hooks/useIncidents';
import { BASEMAPS, type BasemapId } from '../lib/basemaps';
import type { ModuleDef } from '../lib/modules';

type SettingsProps = {
  basemap: BasemapId;
  onBasemap: (id: BasemapId) => void;
  hours: IncidentWindow;
  onHours: (h: IncidentWindow) => void;
};

export function SettingsPanel({ basemap, onBasemap, hours, onHours }: SettingsProps) {
  return (
    <div className="stack">
      <section>
        <h2>Estilo do mapa</h2>
        <div className="chips">
          {BASEMAPS.map((b) => (
            <button key={b.id} className={`chip ${basemap === b.id ? 'on' : ''}`} onClick={() => onBasemap(b.id)}>
              {b.label}
            </button>
          ))}
        </div>
      </section>
      <section>
        <h2>Ocorrências exibidas no mapa</h2>
        <div className="segmented" role="radiogroup" aria-label="Janela de tempo">
          {INCIDENT_WINDOWS.map((h) => (
            <button key={h} role="radio" aria-checked={hours === h} className={hours === h ? 'on' : ''} onClick={() => onHours(h)}>
              Últimas {h} h
            </button>
          ))}
        </div>
      </section>
      <p className="disclaimer">
        Dados territoriais compilados de fontes públicas (base jul/2026, via dadosderiscos.com.br). O controle territorial muda com
        frequência; as informações podem estar desatualizadas. A pontuação é uma estimativa de exposição, não uma garantia de segurança.
        Rotas: OSRM/OpenStreetMap. Ocorrências: Fogo Cruzado. Saúde: CNES. Clima: Open-Meteo.
      </p>
    </div>
  );
}

export function ComingSoon({ module }: { module: ModuleDef }) {
  const Icon = module.icon;
  return (
    <div className="coming-soon">
      <span className="cs-icon">
        <Icon size={30} strokeWidth={1.5} />
      </span>
      <h3>{module.label}</h3>
      <p>{module.soon}</p>
      <span className="cs-tag">
        <Construction size={14} /> Módulo em desenvolvimento
      </span>
    </div>
  );
}
