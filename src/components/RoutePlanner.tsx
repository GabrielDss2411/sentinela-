import { ArrowUpDown } from 'lucide-react';
import type { Place } from '../lib/geocode';
import type { Profile } from '../lib/routing';
import {
  fmtDistance,
  fmtDuration,
  INCIDENT_ROUTE_HOURS,
  scoreLabel,
  type DestinationAnalysis,
  type IncidentNear,
  type RouteAnalysis,
} from '../lib/safety';
import { FACTIONS } from '../lib/zones';
import { PlaceInput } from './PlaceInput';

const PROFILES: { id: Profile; label: string }[] = [
  { id: 'car', label: 'Carro' },
  { id: 'bike', label: 'Bicicleta' },
  { id: 'foot', label: 'A pé' },
];

type Props = {
  from: Place | null;
  to: Place | null;
  onFrom: (p: Place | null) => void;
  onTo: (p: Place | null) => void;
  activeField: 'from' | 'to';
  onActiveField: (f: 'from' | 'to') => void;
  onLocate: () => void;
  profile: Profile;
  onProfile: (p: Profile) => void;
  routes: (RouteAnalysis & { incidents: IncidentNear[] })[];
  selected: number;
  onSelect: (i: number) => void;
  fastestIdx: number;
  safestIdx: number;
  dest: DestinationAnalysis | null;
  destIncidents: IncidentNear[];
  incidentHours: number;
  loading: boolean;
  error: string | null;
};

export function RoutePlanner(p: Props) {
  const sel = p.routes[p.selected];
  return (
    <div className="stack">
      <section className="search">
        <PlaceInput
          label="Origem"
          dot="origin"
          value={p.from}
          onChange={p.onFrom}
          onLocate={p.onLocate}
          active={p.activeField === 'from'}
          onFocus={() => p.onActiveField('from')}
        />
        <PlaceInput
          label="Destino"
          dot="dest"
          value={p.to}
          onChange={p.onTo}
          near={p.from?.coord}
          active={p.activeField === 'to'}
          onFocus={() => p.onActiveField('to')}
        />
        <div className="row">
          <div className="segmented" role="radiogroup" aria-label="Modo">
            {PROFILES.map((x) => (
              <button key={x.id} role="radio" aria-checked={p.profile === x.id} className={p.profile === x.id ? 'on' : ''} onClick={() => p.onProfile(x.id)}>
                {x.label}
              </button>
            ))}
          </div>
          <button
            className="ghost"
            onClick={() => {
              p.onFrom(p.to);
              p.onTo(p.from);
            }}
            title="Inverter origem e destino"
          >
            <ArrowUpDown size={14} /> Inverter
          </button>
        </div>
        <p className="hint">Dica: clique no mapa para definir {p.activeField === 'from' ? 'a origem' : 'o destino'}.</p>
      </section>

      {p.error && <div className="alert bad">{p.error}</div>}
      {p.loading && <div className="alert">Calculando rotas e exposição…</div>}

      {p.dest && p.to && <DestinationCard dest={p.dest} />}
      {p.to && p.destIncidents.length > 0 && (
        <div className="alert bad">
          <strong>
            {p.destIncidents.length} tiroteio(s) a menos de 1 km do destino nas últimas {p.incidentHours} h
          </strong>
          <span>Mais próximo a {fmtDistance(p.destIncidents[0].distanceM)} · Fogo Cruzado</span>
        </div>
      )}

      {p.routes.length > 0 && (
        <section className="routes">
          <h2>Rotas ({p.routes.length})</h2>
          {p.routes.map((r, i) => {
            const lbl = scoreLabel(r.score);
            return (
              <button key={i} className={`route ${i === p.selected ? 'sel' : ''}`} onClick={() => p.onSelect(i)}>
                <div className="route-top">
                  <span className="time">{fmtDuration(r.durationS)}</span>
                  <span className="dist">{fmtDistance(r.distanceM)}</span>
                  <span className={`score ${lbl.tone}`}>{r.score}</span>
                </div>
                <div className="tags">
                  {i === p.safestIdx && <span className="tag good">Mais segura</span>}
                  {i === p.fastestIdx && <span className="tag">Mais rápida</span>}
                  {r.source === 'desvio' && <span className="tag muted">Alternativa por desvio</span>}
                  {r.incidents.length > 0 && (
                    <span className="tag bad">
                      {r.incidents.length} tiroteio(s) nas últimas {INCIDENT_ROUTE_HOURS} h perto
                    </span>
                  )}
                  <span className={`tag ${lbl.tone}`}>{lbl.text}</span>
                </div>
                <div className="meta">
                  {fmtDistance(r.insideM)} dentro de áreas mapeadas · {r.crossed.filter((c) => c.insideM > 0).length} área(s) atravessada(s) ·{' '}
                  {fmtDistance(r.nearM)} a menos de 150 m
                </div>
              </button>
            );
          })}
        </section>
      )}

      {sel && sel.crossed.length > 0 && (
        <section className="crossed">
          <h2>Áreas no caminho (rota selecionada)</h2>
          <ul>
            {sel.crossed.slice(0, 25).map((c) => (
              <li key={c.zone.id}>
                <span className="sw" style={{ background: FACTIONS[c.zone.faction].color }} />
                <span className="nm">{c.zone.name}</span>
                <span className="fx">{c.zone.faction}</span>
                <span className="m">{c.insideM > 0 ? `atravessa ${fmtDistance(c.insideM)}` : `margeia ${fmtDistance(c.nearM)}`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function DestinationCard({ dest }: { dest: DestinationAnalysis }) {
  if (dest.inside) {
    return (
      <div className="alert bad">
        <strong>Destino dentro de área mapeada</strong>
        <span>
          {dest.inside.name} · {FACTIONS[dest.inside.faction].label}
        </span>
      </div>
    );
  }
  const n = dest.nearest;
  if (!n) return <div className="alert good">Nenhuma área mapeada perto do destino.</div>;
  const tone = n.distanceM < 300 ? 'bad' : n.distanceM < 1000 ? 'warn' : 'good';
  return (
    <div className={`alert ${tone}`}>
      <strong>Destino a {fmtDistance(n.distanceM)} de área mapeada</strong>
      <span>
        Mais próxima: {n.zone.name} ({FACTIONS[n.zone.faction].label})
        {dest.within1km.length > 1 && ` · ${dest.within1km.length} áreas num raio de 1 km`}
      </span>
    </div>
  );
}
