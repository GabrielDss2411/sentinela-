import { LocateFixed, MapPinned, Navigation, Phone, Search, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { haversine, HOSPITAL_TYPES, telHref, type Hospital, type HospitalType } from '../lib/hospitals';
import type { LngLat } from '../lib/routing';
import { fmtDistance } from '../lib/safety';
import { normalize } from '../lib/text';
import { FACTIONS, type Zone, type ZoneIndex } from '../lib/zones';

const TYPE_ORDER: HospitalType[] = ['hospital', 'upa', 'pronto-socorro', 'maternidade'];
const RADII = [0, 2000, 5000, 10000, 20000];
const SPHERES = [
  { id: '', label: 'Todas' },
  { id: 'MUNICIPAL', label: 'Municipal' },
  { id: 'ESTADUAL', label: 'Estadual' },
];
const EMERGENCY = [
  { n: '192', label: 'SAMU' },
  { n: '193', label: 'Bombeiros' },
  { n: '190', label: 'Polícia Militar' },
];

type Props = {
  hospitals: Hospital[];
  zones: ZoneIndex | null;
  here: LngLat | null;
  locating: boolean;
  locError: string | null;
  onLocate: () => void;
  onRoute: (h: Hospital) => void;
  onShowOnMap: (h: Hospital) => void;
};

type Row = { h: Hospital; distanceM: number | null; zone: Zone | undefined };

export function HealthScreen({ hospitals, zones, here, locating, locError, onLocate, onRoute, onShowOnMap }: Props) {
  const [q, setQ] = useState('');
  const [city, setCity] = useState('');
  const [types, setTypes] = useState<Set<HospitalType>>(() => new Set(TYPE_ORDER));
  const [sphere, setSphere] = useState('');
  const [radius, setRadius] = useState(0);
  const [outsideZones, setOutsideZones] = useState(false);
  const [withPhone, setWithPhone] = useState(false);
  const [sortByName, setSortByName] = useState(false);

  // Zone lookups are the costly part; do them once per dataset, not per filter change.
  const zoneOf = useMemo(() => new Map(hospitals.map((h) => [h.id, zones?.containing(h.coord[0], h.coord[1])])), [hospitals, zones]);
  const cities = useMemo(() => [...new Set(hospitals.map((h) => h.city))].sort((a, b) => a.localeCompare(b, 'pt')), [hospitals]);

  const all: Row[] = useMemo(
    () => hospitals.map((h) => ({ h, distanceM: here ? haversine(here, h.coord) : null, zone: zoneOf.get(h.id) })),
    [hospitals, here, zoneOf],
  );

  const typeCounts = useMemo(() => {
    const c: Partial<Record<HospitalType, number>> = {};
    for (const { h } of all) c[h.type] = (c[h.type] ?? 0) + 1;
    return c;
  }, [all]);

  const byDistance = here !== null && !sortByName;
  const rows = useMemo(() => {
    const v = normalize(q);
    const list = all.filter(({ h, distanceM, zone }) => {
      if (!types.has(h.type)) return false;
      if (city && h.city !== city) return false;
      if (sphere && h.sphere !== sphere) return false;
      if (radius && distanceM !== null && distanceM > radius) return false;
      if (outsideZones && zone) return false;
      if (withPhone && !h.phone) return false;
      if (v && !normalize(`${h.name} ${h.address} ${h.city}`).includes(v)) return false;
      return true;
    });
    return list.sort((a, b) => (byDistance ? a.distanceM! - b.distanceM! : a.h.name.localeCompare(b.h.name, 'pt')));
  }, [all, q, city, types, sphere, radius, outsideZones, withPhone, byDistance]);

  const toggleType = (t: HospitalType) =>
    setTypes((v) => {
      const n = new Set(v);
      if (n.has(t)) n.delete(t);
      else n.add(t);
      return n;
    });

  const nearest = here && rows.length ? rows.reduce((best, r) => (r.distanceM! < best.distanceM! ? r : best)) : undefined;

  return (
    <div className="screen health-screen">
      <header className="screen-head">
        <div>
          <h1>Saúde</h1>
          <p>Unidades públicas (municipais e estaduais) com atendimento de emergência 24h no estado · Fonte: CNES / Ministério da Saúde</p>
        </div>
        <div className="screen-actions">
          {EMERGENCY.map((e) => (
            <a key={e.n} className="sos-chip" href={`tel:${e.n}`}>
              <Phone size={14} />
              <strong>{e.n}</strong> {e.label}
            </a>
          ))}
        </div>
      </header>

      <section className={`locate-bar ${here ? 'on' : ''}`}>
        {!here ? (
          <>
            <div>
              <strong>Encontre a emergência mais perto de você</strong>
              <span>Sua localização é usada só neste navegador para calcular as distâncias.</span>
            </div>
            <button className="primary" onClick={onLocate} disabled={locating}>
              <LocateFixed size={16} /> {locating ? 'Obtendo localização…' : 'Usar minha localização'}
            </button>
          </>
        ) : nearest ? (
          <>
            <div>
              <span className="eyebrow">Mais próxima com os filtros atuais</span>
              <strong>{nearest.h.name}</strong>
              <span>
                {HOSPITAL_TYPES[nearest.h.type].short} · {fmtDistance(nearest.distanceM!)} em linha reta · {nearest.h.city}
              </span>
            </div>
            <div className="locate-actions">
              <button className="primary" onClick={() => onRoute(nearest.h)}>
                <Navigation size={16} /> Traçar rota
              </button>
              {nearest.h.phone && (
                <a className="ghost" href={telHref(nearest.h.phone)}>
                  <Phone size={14} /> Ligar
                </a>
              )}
              <button className="ghost" onClick={onLocate} disabled={locating} title="Atualizar localização">
                <LocateFixed size={14} /> {locating ? 'Atualizando…' : 'Atualizar'}
              </button>
            </div>
          </>
        ) : (
          <div>
            <strong>Nenhuma unidade com os filtros atuais.</strong>
          </div>
        )}
      </section>
      {locError && <div className="alert bad">{locError}</div>}

      <section className="card table-card">
        <div className="filter-bar">
          <label className="filter-search">
            <Search size={16} />
            <input placeholder="Buscar por nome, endereço ou bairro…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar unidade" />
          </label>
          <select value={city} onChange={(e) => setCity(e.target.value)} aria-label="Município">
            <option value="">Todos os municípios</option>
            {cities.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select value={radius} onChange={(e) => setRadius(Number(e.target.value))} aria-label="Distância máxima" disabled={!here} title={here ? undefined : 'Use sua localização para filtrar por distância'}>
            {RADII.map((r) => (
              <option key={r} value={r}>
                {r ? `Até ${fmtDistance(r)}` : 'Qualquer distância'}
              </option>
            ))}
          </select>
          <div className="segmented" role="radiogroup" aria-label="Esfera">
            {SPHERES.map((s) => (
              <button key={s.id} role="radio" aria-checked={sphere === s.id} className={sphere === s.id ? 'on' : ''} onClick={() => setSphere(s.id)}>
                {s.label}
              </button>
            ))}
          </div>
        </div>
        <div className="filter-bar sub">
          <div className="chips">
            {TYPE_ORDER.map((t) => (
              <button key={t} className={`chip ${types.has(t) ? 'on' : ''}`} onClick={() => toggleType(t)} aria-pressed={types.has(t)}>
                <span className="h-dot" style={{ background: HOSPITAL_TYPES[t].color }}>
                  +
                </span>
                {HOSPITAL_TYPES[t].short}
                <span className="cnt">{typeCounts[t] ?? 0}</span>
              </button>
            ))}
          </div>
          <label className="check">
            <input type="checkbox" checked={outsideZones} onChange={(e) => setOutsideZones(e.target.checked)} /> Fora de áreas mapeadas
          </label>
          <label className="check">
            <input type="checkbox" checked={withPhone} onChange={(e) => setWithPhone(e.target.checked)} /> Com telefone
          </label>
          <div className="list-meta">
            <span>
              {rows.length} unidade{rows.length === 1 ? '' : 's'}
            </span>
            <div className="segmented" role="radiogroup" aria-label="Ordenar">
              <button role="radio" aria-checked={byDistance} className={byDistance ? 'on' : ''} onClick={() => (here ? setSortByName(false) : onLocate())}>
                Mais próximas
              </button>
              <button role="radio" aria-checked={!byDistance} className={!byDistance ? 'on' : ''} onClick={() => setSortByName(true)}>
                Nome
              </button>
            </div>
          </div>
        </div>

        <ul className="h-rows">
          {hospitals.length === 0 && <li className="empty-row">Carregando unidades…</li>}
          {hospitals.length > 0 && rows.length === 0 && <li className="empty-row">Nenhuma unidade com esses filtros.</li>}
          {rows.map(({ h, distanceM, zone }) => (
            <li key={h.id} className="h-row">
              <span className="h-type" style={{ background: HOSPITAL_TYPES[h.type].color }} title={HOSPITAL_TYPES[h.type].label}>
                +
              </span>
              <div className="h-info">
                <strong>{h.name}</strong>
                <span>
                  {HOSPITAL_TYPES[h.type].short} · {h.sphere === 'ESTADUAL' ? 'Estadual' : 'Municipal'} · {h.city}
                </span>
                {h.address && <span>{h.address}</span>}
                {zone && (
                  <span className="h-warn">
                    <TriangleAlert size={13} /> Dentro de área mapeada: {zone.name} ({FACTIONS[zone.faction].label})
                  </span>
                )}
              </div>
              <div className="h-dist">
                {distanceM !== null ? (
                  <>
                    <strong>{fmtDistance(distanceM)}</strong>
                    <small>em linha reta</small>
                  </>
                ) : (
                  <small>—</small>
                )}
              </div>
              <div className="h-actions">
                <button className="ghost" onClick={() => onRoute(h)} title="Traçar rota até a unidade">
                  <Navigation size={14} /> Rota
                </button>
                {h.phone ? (
                  <a className="ghost" href={telHref(h.phone)} title={h.phone}>
                    <Phone size={14} /> Ligar
                  </a>
                ) : (
                  <span className="ghost disabled" title="Telefone não informado no CNES">
                    <Phone size={14} /> Ligar
                  </span>
                )}
                <button className="ghost" onClick={() => onShowOnMap(h)} title="Ver no mapa">
                  <MapPinned size={14} /> Mapa
                </button>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <p className="hint">
        Distâncias em linha reta; o tempo real de trajeto aparece ao traçar a rota. As coordenadas vêm do CNES e algumas podem estar erradas.
        Confirme o funcionamento antes de ir, se puder.
      </p>
    </div>
  );
}
