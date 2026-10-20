import type { ReactNode } from 'react';
import type { IncidentsState } from '../hooks/useIncidents';
import type { Incident } from '../lib/incidentTypes';
import { FACTION_ORDER, FACTIONS, type FactionId } from '../lib/zones';
import { IncidentRow } from './IncidentRow';

/** Dark dashboard card with an uppercase title and an optional "Ver todas" link. */
export function Card({ title, action, onAction, className = '', children }: { title: string; action?: string; onAction?: () => void; className?: string; children: ReactNode }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {action && (
          <button className="link" onClick={onAction}>
            {action}
          </button>
        )}
      </header>
      <div className="card-body">{children}</div>
    </section>
  );
}

type IncidentsCardProps = {
  state: IncidentsState;
  incidents: Incident[];
  hours: number;
  onShow: (i: Incident) => void;
  onOpen: () => void;
  title?: string;
  limit?: number;
  className?: string;
};

export function IncidentsCard({ state, incidents, hours, onShow, onOpen, title = 'Últimas ocorrências', limit = 50, className = '' }: IncidentsCardProps) {
  return (
    <Card title={title} action="Ver todas" onAction={onOpen} className={`incidents-card ${className}`}>
      {state.status === 'loading' && <p className="hint">Carregando ocorrências…</p>}
      {state.status === 'unconfigured' && <p className="hint">Integração com o Fogo Cruzado ainda não configurada.</p>}
      {state.status === 'error' && <p className="hint">{state.error}</p>}
      {state.status === 'ok' && incidents.length === 0 && <p className="hint">Nenhuma ocorrência nas últimas {hours} h.</p>}
      {incidents.length > 0 && (
        <ul className="inc-rows">
          {incidents.slice(0, limit).map((i) => (
            <IncidentRow key={i.id} incident={i} onShow={onShow} />
          ))}
        </ul>
      )}
      {state.demo && <p className="demo-tag">Dados de demonstração</p>}
    </Card>
  );
}

export function TerritoryCard({ counts, total, onOpen }: { counts: Partial<Record<FactionId, number>>; total: number; onOpen: () => void }) {
  const max = Math.max(1, ...FACTION_ORDER.map((f) => counts[f] ?? 0));
  return (
    <Card title="Panorama territorial" action="Ver áreas" onAction={onOpen} className="territory-card">
      <p className="terr-total">
        <strong>{total.toLocaleString('pt-BR')}</strong> áreas mapeadas no estado
      </p>
      <ul className="terr-bars">
        {FACTION_ORDER.map((f) => (
          <li key={f}>
            <span className="terr-name">{FACTIONS[f].label.replace(/ \(.*\)$/, '')}</span>
            <span className="terr-track">
              <span style={{ width: `${((counts[f] ?? 0) / max) * 100}%`, background: FACTIONS[f].color }} />
            </span>
            <span className="terr-val">{counts[f] ?? 0}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
