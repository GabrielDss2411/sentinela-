import { ChevronDown, ChevronUp, Download, MapPinned, Search } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { fmtAgo, incidentSeverity, SEVERITY_LABEL, type IncidentsState } from '../hooks/useIncidents';
import type { Incident, VictimGroup } from '../lib/incidentTypes';
import { normalize } from '../lib/text';

const PERIODS = [
  { id: 1, label: '24 h' },
  { id: 7, label: '7 dias' },
  { id: 15, label: '15 dias' },
  { id: 30, label: '30 dias' },
] as const;
type PeriodDays = (typeof PERIODS)[number]['id'];

const GROUPS: { id: VictimGroup; label: string }[] = [
  { id: 'civilians', label: 'Civis' },
  { id: 'agents', label: 'Agentes de segurança' },
  { id: 'men', label: 'Homens' },
  { id: 'women', label: 'Mulheres' },
  { id: 'kids', label: 'Crianças' },
  { id: 'teenagers', label: 'Adolescentes' },
  { id: 'elderly', label: 'Idosos' },
];

const TZ = 'America/Sao_Paulo';
const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });
const hourKey = (iso: string) => new Date(iso).toLocaleString('en-CA', { timeZone: TZ, hour: '2-digit', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
/** "FAVELA DO LIXAO" → "Favela do Lixao"; connecting words stay lowercase. */
const titleCase = (s: string) =>
  s
    .toLowerCase()
    .replace(/(^|\s|\()(\p{L})(\p{L}*)/gu, (m, a: string, b: string, rest: string) =>
      a !== '' && a !== '(' && /^(d[aeo]s?|e)$/.test(b + rest) ? m : a + b.toUpperCase() + rest,
    );

function place(i: Incident) {
  return titleCase(i.locality ?? i.neighborhood ?? i.city ?? 'Local não informado');
}

type Sort = { key: 'date' | 'victims'; dir: 1 | -1 };

export function IncidentsScreen({ state, onShowOnMap }: { state: IncidentsState; onShowOnMap: (i: Incident) => void }) {
  const [days, setDays] = useState<PeriodDays>(7);
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [reason, setReason] = useState('');
  const [onlyVictims, setOnlyVictims] = useState(false);
  const [onlyPolice, setOnlyPolice] = useState(false);
  const [sort, setSort] = useState<Sort>({ key: 'date', dir: -1 });
  const [open, setOpen] = useState<string | null>(null);

  const refTime = state.fetchedAt ? Date.parse(state.fetchedAt) : 0;
  const inPeriod = useMemo(() => state.incidents.filter((i) => Date.parse(i.date) >= refTime - days * 86_400_000), [state.incidents, days, refTime]);

  const cities = useMemo(() => [...new Set(inPeriod.map((i) => i.city).filter((c): c is string => !!c))].sort(), [inPeriod]);
  const reasons = useMemo(() => [...new Set(inPeriod.map((i) => i.reason).filter((r): r is string => !!r))].sort(), [inPeriod]);

  const rows = useMemo(() => {
    const v = normalize(q);
    const list = inPeriod.filter((i) => {
      if (city && i.city !== city) return false;
      if (reason && i.reason !== reason) return false;
      if (onlyVictims && i.dead + i.wounded === 0) return false;
      if (onlyPolice && !i.policeAction) return false;
      if (v) {
        const hay = normalize([i.address, i.neighborhood, i.locality, i.city, i.reason, i.policeUnit, i.number].filter(Boolean).join(' '));
        if (!hay.includes(v)) return false;
      }
      return true;
    });
    const val = (i: Incident) => (sort.key === 'date' ? Date.parse(i.date) : i.dead * 1000 + i.wounded);
    return list.sort((a, b) => (val(a) - val(b)) * sort.dir || Date.parse(b.date) - Date.parse(a.date));
  }, [inPeriod, q, city, reason, onlyVictims, onlyPolice, sort]);

  const totals = useMemo(() => {
    const t = { dead: 0, wounded: 0, agents: 0, police: 0, massacres: 0 };
    for (const i of rows) {
      t.dead += i.dead;
      t.wounded += i.wounded;
      t.agents += i.victims.agents.dead + i.victims.agents.wounded;
      if (i.policeAction) t.police++;
      if (i.massacre) t.massacres++;
    }
    return t;
  }, [rows]);

  const toggleSort = (key: Sort['key']) => setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: -1 }));

  return (
    <div className="screen inc-screen">
      <header className="screen-head">
        <div>
          <h1>Ocorrências</h1>
          <p>
            Tiroteios e disparos de arma de fogo no estado do Rio de Janeiro · Fonte: Instituto Fogo Cruzado
            {state.fetchedAt && ` · atualizado ${fmtAgo(state.fetchedAt)}`}
          </p>
        </div>
        <div className="screen-actions">
          <div className="segmented" role="radiogroup" aria-label="Período">
            {PERIODS.map((p) => (
              <button key={p.id} role="radio" aria-checked={days === p.id} className={days === p.id ? 'on' : ''} onClick={() => setDays(p.id)}>
                {p.label}
              </button>
            ))}
          </div>
          <button className="ghost" onClick={() => exportCsv(rows)} disabled={!rows.length}>
            <Download size={15} /> Exportar CSV
          </button>
        </div>
      </header>

      {state.status === 'unconfigured' && <div className="alert warn">Integração com o Fogo Cruzado ainda não configurada (veja o README).</div>}
      {state.status === 'error' && <div className="alert bad">{state.error}</div>}
      {state.demo && <div className="alert warn">Dados de demonstração: ocorrências fictícias, só para testar a interface.</div>}

      <div className="stat-row">
        <Stat label="Ocorrências" value={rows.length} />
        <Stat label="Mortos" value={totals.dead} tone="bad" />
        <Stat label="Feridos" value={totals.wounded} tone="warn" />
        <Stat label="Com ação policial" value={totals.police} sub={rows.length ? `${Math.round((totals.police / rows.length) * 100)}% do total` : undefined} />
        <Stat label="Agentes atingidos" value={totals.agents} />
        <Stat label="Chacinas" value={totals.massacres} tone={totals.massacres ? 'bad' : undefined} />
      </div>

      <div className="screen-grid">
        <section className="card table-card">
          <div className="filter-bar">
            <label className="filter-search">
              <Search size={16} />
              <input placeholder="Buscar bairro, endereço, unidade ou nº…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar ocorrência" />
            </label>
            <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Município">
              <option value="">Todos os municípios</option>
              {cities.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo principal">
              <option value="">Todos os motivos</option>
              {reasons.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
            <label className="check">
              <input type="checkbox" checked={onlyVictims} onChange={(e) => setOnlyVictims(e.target.checked)} /> Com vítimas
            </label>
            <label className="check">
              <input type="checkbox" checked={onlyPolice} onChange={(e) => setOnlyPolice(e.target.checked)} /> Ação policial
            </label>
          </div>

          <div className="table-scroll">
            <table className="inc-table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>
                    <button onClick={() => toggleSort('date')}>
                      Data <SortIcon sort={sort} k="date" />
                    </button>
                  </th>
                  <th>Local</th>
                  <th>Motivo</th>
                  <th>Polícia</th>
                  <th>
                    <button onClick={() => toggleSort('victims')}>
                      Vítimas <SortIcon sort={sort} k="victims" />
                    </button>
                  </th>
                  <th>Gravidade</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="empty-row">
                      {state.status === 'loading' ? 'Carregando ocorrências…' : 'Nenhuma ocorrência com esses filtros.'}
                    </td>
                  </tr>
                )}
                {rows.map((i) => {
                  const sev = incidentSeverity(i);
                  const isOpen = open === i.id;
                  return (
                    <Fragment key={i.id}>
                      <tr className={`inc-tr ${isOpen ? 'open' : ''}`} onClick={() => setOpen(isOpen ? null : i.id)} aria-expanded={isOpen}>
                        <td className="num">{i.number ?? '—'}</td>
                        <td className="nowrap">{fmtDateTime(i.date)}</td>
                        <td>
                          <strong>{place(i)}</strong>
                          <small>{[i.locality && i.neighborhood && titleCase(i.neighborhood), i.city].filter(Boolean).join(' · ')}</small>
                        </td>
                        <td>
                          {i.reason ?? 'Não identificado'}
                          {i.complementaryReasons.length > 0 && <small>{i.complementaryReasons.join(' · ')}</small>}
                        </td>
                        <td>
                          {i.policeAction ? 'Ação policial' : i.agentPresence ? 'Agentes presentes' : '—'}
                          {i.policeUnit && <small>{i.policeUnit}</small>}
                        </td>
                        <td className="nowrap">
                          {i.dead + i.wounded === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <>
                              {i.dead > 0 && <span className="vic dead">{i.dead} morto{i.dead > 1 ? 's' : ''}</span>}
                              {i.wounded > 0 && <span className="vic wounded">{i.wounded} ferido{i.wounded > 1 ? 's' : ''}</span>}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`sev-badge ${sev}`}>{SEVERITY_LABEL[sev]}</span>
                          {i.massacre && <span className="sev-badge alta">Chacina</span>}
                        </td>
                      </tr>
                      {isOpen && (
                        <tr className="inc-detail">
                          <td colSpan={7}>
                            <Detail incident={i} onShowOnMap={onShowOnMap} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="screen-side">
          <DailyChart rows={rows} days={days} refTime={refTime} />
          <RankCard title="Principais motivos" items={countBy(rows, (i) => i.reason ?? 'Não identificado')} />
          <RankCard title="Bairros mais atingidos" items={countBy(rows, (i) => (i.neighborhood ? titleCase(i.neighborhood) : null))} />
          <VictimProfile rows={rows} />
        </aside>
      </div>
    </div>
  );
}

function SortIcon({ sort, k }: { sort: Sort; k: Sort['key'] }) {
  if (sort.key !== k) return null;
  return sort.dir === -1 ? <ChevronDown size={14} /> : <ChevronUp size={14} />;
}

function Stat({ label, value, sub, tone }: { label: string; value: number; sub?: string; tone?: 'bad' | 'warn' }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong className={tone ? `tone-${tone}` : ''}>{value.toLocaleString('pt-BR')}</strong>
      {sub && <small>{sub}</small>}
    </div>
  );
}

function Detail({ incident: i, onShowOnMap }: { incident: Incident; onShowOnMap: (i: Incident) => void }) {
  const groups = GROUPS.filter((g) => i.victims[g.id].dead + i.victims[g.id].wounded > 0);
  return (
    <div className="detail">
      <dl className="detail-list">
        <div>
          <dt>Endereço</dt>
          <dd>{i.address ?? '—'}</dd>
        </div>
        <div>
          <dt>Bairro</dt>
          <dd>{i.neighborhood ? titleCase(i.neighborhood) : '—'}</dd>
        </div>
        <div>
          <dt>Localidade</dt>
          <dd>{i.locality ? titleCase(i.locality) : '—'}</dd>
        </div>
        <div>
          <dt>Município</dt>
          <dd>{i.city ?? '—'}</dd>
        </div>
        <div>
          <dt>Ação policial</dt>
          <dd>{i.policeAction ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Presença de agentes</dt>
          <dd>{i.agentPresence ? 'Sim' : 'Não'}</dd>
        </div>
        <div>
          <dt>Unidade policial</dt>
          <dd>{i.policeUnit ?? '—'}</dd>
        </div>
        <div>
          <dt>Coordenadas</dt>
          <dd>
            {i.coord[1].toFixed(5)}, {i.coord[0].toFixed(5)}
          </dd>
        </div>
      </dl>
      <div className="detail-side">
        {groups.length > 0 ? (
          <table className="mini-table">
            <thead>
              <tr>
                <th>Vítimas</th>
                <th>Mortos</th>
                <th>Feridos</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.id}>
                  <td>{g.label}</td>
                  <td>{i.victims[g.id].dead}</td>
                  <td>{i.victims[g.id].wounded}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="hint">Nenhuma vítima registrada.</p>
        )}
        <button className="primary" onClick={() => onShowOnMap(i)}>
          <MapPinned size={16} /> Ver no mapa
        </button>
      </div>
    </div>
  );
}

function countBy(rows: Incident[], key: (i: Incident) => string | null) {
  const m = new Map<string, number>();
  for (const i of rows) {
    const k = key(i);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 7);
}

function RankCard({ title, items }: { title: string; items: [string, number][] }) {
  const max = Math.max(1, ...items.map(([, n]) => n));
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
      </header>
      <div className="card-body">
        {items.length === 0 ? (
          <p className="hint">Sem dados no período.</p>
        ) : (
          <ul className="rank">
            {items.map(([name, n]) => (
              <li key={name} title={`${name}: ${n}`}>
                <span className="rank-name">{name}</span>
                <span className="rank-track">
                  <span style={{ width: `${(n / max) * 100}%` }} />
                </span>
                <span className="rank-val">{n}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Occurrences per day (per hour for the 24 h period), one hue, hover shows the exact count. */
function DailyChart({ rows, days, refTime }: { rows: Incident[]; days: number; refTime: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const hourly = days === 1;
  const buckets = useMemo(() => {
    const n = hourly ? 24 : days;
    const step = hourly ? 3_600_000 : 86_400_000;
    const keyOf = hourly ? hourKey : dayKey;
    const list = Array.from({ length: n }, (_, k) => {
      const t = new Date(refTime - (n - 1 - k) * step).toISOString();
      return {
        key: keyOf(t),
        label: hourly
          ? `${new Date(t).toLocaleTimeString('pt-BR', { timeZone: TZ, hour: '2-digit' })} h`
          : new Date(t).toLocaleDateString('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit' }),
        count: 0,
      };
    });
    const index = new Map(list.map((b, k) => [b.key, k]));
    for (const i of rows) {
      const k = index.get(keyOf(i.date));
      if (k !== undefined) list[k].count++;
    }
    return list;
  }, [rows, days, refTime, hourly]);

  const max = Math.max(1, ...buckets.map((b) => b.count));
  const h = hover !== null ? buckets[hover] : null;

  return (
    <section className="card">
      <header className="card-head">
        <h2>{hourly ? 'Ocorrências por hora' : 'Ocorrências por dia'}</h2>
        <span className="chart-readout">{h ? `${h.label}: ${h.count}` : `máx. ${max}`}</span>
      </header>
      <div className="card-body">
        <div className="cols" onMouseLeave={() => setHover(null)} role="img" aria-label={`${hourly ? 'Ocorrências por hora' : 'Ocorrências por dia'}, máximo ${max}`}>
          {buckets.map((b, k) => (
            <div key={b.key} className={`col ${hover === k ? 'on' : ''}`} onMouseEnter={() => setHover(k)} title={`${b.label}: ${b.count}`}>
              <span style={{ height: `${(b.count / max) * 100}%` }} />
            </div>
          ))}
        </div>
        <div className="cols-axis">
          <span>{buckets[0]?.label}</span>
          <span>{buckets[buckets.length - 1]?.label}</span>
        </div>
      </div>
    </section>
  );
}

function VictimProfile({ rows }: { rows: Incident[] }) {
  const sums = GROUPS.map((g) => ({
    ...g,
    dead: rows.reduce((s, i) => s + i.victims[g.id].dead, 0),
    wounded: rows.reduce((s, i) => s + i.victims[g.id].wounded, 0),
  }));
  return (
    <section className="card">
      <header className="card-head">
        <h2>Perfil das vítimas</h2>
      </header>
      <div className="card-body">
        <table className="mini-table">
          <thead>
            <tr>
              <th />
              <th>Mortos</th>
              <th>Feridos</th>
            </tr>
          </thead>
          <tbody>
            {sums.map((g) => (
              <tr key={g.id}>
                <td>{g.label}</td>
                <td>{g.dead}</td>
                <td>{g.wounded}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** Same columns as the Fogo Cruzado "occurrences with victims" export. */
function exportCsv(rows: Incident[]) {
  const head = [
    'id', 'address', 'city', 'neighborhood', 'locality', 'latitude', 'longitude', 'data', 'police_action', 'agent_presence', 'police_unit',
    'main_reason', 'complementary_reason', 'massacre', 'civilians_dead', 'civilians_wounded', 'agents_dead', 'agents_wounded', 'men_dead',
    'men_wounded', 'women_dead', 'women_wounded', 'kids_dead', 'kids_wounded', 'teenagers_dead', 'teenagers_wounded', 'elderly_dead', 'elderly_wounded',
  ];
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = rows.map((i) =>
    [
      i.number ?? i.id, i.address, i.city, i.neighborhood, i.locality, i.coord[1], i.coord[0], fmtDateTime(i.date), i.policeAction, i.agentPresence,
      i.policeUnit, i.reason, i.complementaryReasons.join('; '), i.massacre,
      ...GROUPS.flatMap((g) => [i.victims[g.id].dead, i.victims[g.id].wounded]),
    ]
      .map(cell)
      .join(','),
  );
  // BOM so Excel opens the accents correctly.
  const blob = new Blob(['﻿' + [head.join(','), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `ocorrencias_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}
