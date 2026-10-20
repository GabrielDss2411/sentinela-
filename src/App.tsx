import { ChevronDown, MapPin } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { IncidentsCard, TerritoryCard } from './components/DashboardCards';
import { HealthScreen } from './components/HealthScreen';
import { IncidentToasts } from './components/IncidentFeed';
import { IncidentsScreen } from './components/IncidentsScreen';
import { REGIONS, type Bounds, type MapLayers } from './components/mapTypes';
import { MapView } from './components/MapView';
import { AlertModal, DisclaimerModal } from './components/Modals';
import { MonitorPanel } from './components/MonitorPanel';
import { ComingSoon, SettingsPanel } from './components/Panels';
import { RoutePlanner } from './components/RoutePlanner';
import { SideNav } from './components/SideNav';
import { TopBar } from './components/TopBar';
import { ZoneSearch } from './components/ZoneSearch';
import { fmtClock, INCIDENT_WINDOWS, useIncidents, type IncidentWindow } from './hooks/useIncidents';
import { useProximityMonitor, type MonitorOptions } from './hooks/useProximityMonitor';
import { useWeather } from './hooks/useWeather';
import { saveBasemap, savedBasemap, type BasemapId } from './lib/basemaps';
import { reverse, type Place } from './lib/geocode';
import { HOSPITAL_TYPES, loadHospitals, type Hospital, type HospitalType } from './lib/hospitals';
import type { Incident } from './lib/incidentTypes';
import { moduleById, type ModuleId } from './lib/modules';
import { findRoutes, type LngLat, type Profile } from './lib/routing';
import {
  analyzeDestination,
  analyzeRoute,
  INCIDENT_ROUTE_HOURS,
  incidentsWithin,
  withIncidents,
  type DestinationAnalysis,
  type RouteAnalysis,
} from './lib/safety';
import { FACTION_ORDER, FACTIONS, loadZones, type FactionId, type Zone, type ZoneIndex } from './lib/zones';

const ALL_HOSPITAL_TYPES = new Set(Object.keys(HOSPITAL_TYPES) as HospitalType[]);

const LAYER_FILTERS: { id: keyof MapLayers; label: string }[] = [
  { id: 'incidents', label: 'Ocorrências' },
  { id: 'zones', label: 'Comunidades' },
  { id: 'hospitals', label: 'Saúde' },
];

const NAV_KEY = 'sentinela.nav.collapsed';

/** Starts collapsed on narrower screens unless the user chose otherwise. */
function savedNavCollapsed() {
  try {
    const v = localStorage.getItem(NAV_KEY);
    if (v !== null) return v === '1';
  } catch {
    /* storage blocked */
  }
  return window.innerWidth <= 1440;
}

function saveNavCollapsed(v: boolean) {
  try {
    localStorage.setItem(NAV_KEY, v ? '1' : '0');
  } catch {
    /* storage blocked */
  }
}

export default function App() {
  const [zones, setZones] = useState<ZoneIndex | null>(null);
  const [zonesErr, setZonesErr] = useState<string | null>(null);
  const [visible, setVisible] = useState<Set<FactionId>>(new Set(FACTION_ORDER));

  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [activeField, setActiveField] = useState<'from' | 'to'>('from');
  const [profile, setProfile] = useState<Profile>('car');

  const [rawRoutes, setRoutes] = useState<RouteAnalysis[]>([]);
  const [selected, setSelected] = useState(0);
  const [dest, setDest] = useState<DestinationAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [module, setModule] = useState<ModuleId>('overview');
  const [navCollapsed, setNavCollapsed] = useState(savedNavCollapsed);
  const [focus, setFocus] = useState<{ zone: Zone; nonce: number } | null>(null);
  const [monOpts, setMonOpts] = useState<MonitorOptions>({ radiusM: 1000, vibration: true, beeps: false, voice: false });
  const incidentsState = useIncidents();
  const [incidentHours, setIncidentHours] = useState<IncidentWindow>(12);
  const monitor = useProximityMonitor(zones, monOpts, incidentsState.incidents);
  const [basemap, setBasemap] = useState<BasemapId>(savedBasemap);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [lastFix, setLastFix] = useState<LngLat | null>(null);
  const [locating, setLocating] = useState(false);
  const [locError, setLocError] = useState<string | null>(null);
  const [flyTo, setFlyTo] = useState<{ coord: LngLat; nonce: number } | null>(null);
  const [fitTo, setFitTo] = useState<{ bounds: Bounds; nonce: number } | null>(null);
  const [region, setRegion] = useState(REGIONS[0].id);
  const [layers, setLayers] = useState<MapLayers>({ zones: true, incidents: true, hospitals: true });
  const weather = useWeather();
  // Live GPS while monitoring, otherwise the last one-off location fix.
  const here = monitor.position ?? lastFix;

  useEffect(() => {
    loadZones().then(setZones, (e: Error) => setZonesErr(e.message));
    loadHospitals().then(setHospitals, (e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!from || !to || !zones) {
      setRoutes([]);
      setDest(null);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    findRoutes(profile, from.coord, to.coord, ctrl.signal)
      .then((raw) => {
        const analyzed = raw.map((r) => analyzeRoute(r, zones));
        setRoutes(analyzed);
        // Default selection: safest route, ties broken by duration.
        const best = analyzed.reduce((b, r, i) => {
          const cur = analyzed[b];
          return r.score > cur.score || (r.score === cur.score && r.durationS < cur.durationS) ? i : b;
        }, 0);
        setSelected(best);
        setDest(analyzeDestination(to.coord, zones));
      })
      .catch((e: Error) => {
        if (e.name !== 'AbortError') setError(`Não foi possível traçar a rota: ${e.message}`);
      })
      .finally(() => setLoading(false));
    return () => ctrl.abort();
  }, [from, to, profile, zones]);

  // Windows are measured from the last fetch, which refreshes every poll.
  const refTime = incidentsState.fetchedAt ? Date.parse(incidentsState.fetchedAt) : 0;
  const visibleIncidents = useMemo(() => {
    const cutoff = refTime - incidentHours * 3600_000;
    return incidentsState.incidents.filter((i) => Date.parse(i.date) >= cutoff).sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  }, [incidentsState.incidents, incidentHours, refTime]);

  // Route scores use a fixed recent window, independent of what the map shows.
  const routes = useMemo(() => {
    const cutoff = refTime - INCIDENT_ROUTE_HOURS * 3600_000;
    const recent = incidentsState.incidents.filter((i) => Date.parse(i.date) >= cutoff);
    return rawRoutes.map((r) => withIncidents(r, recent));
  }, [rawRoutes, incidentsState.incidents, refTime]);

  const destIncidents = useMemo(() => (to ? incidentsWithin(to.coord, visibleIncidents, 1000) : []), [to, visibleIncidents]);

  const fly = (coord: LngLat) => setFlyTo({ coord, nonce: Date.now() });
  // An incident opened from the occurrences screen stays on the map even when it is older than the map's window.
  const [pinned, setPinned] = useState<Incident | null>(null);
  const mapIncidents = useMemo(
    () => (pinned && !visibleIncidents.some((i) => i.id === pinned.id) ? [...visibleIncidents, pinned] : visibleIncidents),
    [visibleIncidents, pinned],
  );
  const showIncident = (i: Incident) => {
    setLayers((l) => ({ ...l, incidents: true }));
    setPinned(i);
    fly(i.coord);
  };
  const showHospitalOnMap = (h: Hospital) => {
    setModule('overview');
    setLayers((l) => ({ ...l, hospitals: true }));
    fly(h.coord);
  };
  const showIncidentOnMap = (i: Incident) => {
    setModule('overview');
    showIncident(i);
  };

  const fastestIdx = useMemo(() => routes.reduce((b, r, i) => (r.durationS < routes[b].durationS ? i : b), 0), [routes]);
  const safestIdx = useMemo(
    () => routes.reduce((b, r, i) => (r.score > routes[b].score || (r.score === routes[b].score && r.durationS < routes[b].durationS) ? i : b), 0),
    [routes],
  );

  const counts = useMemo(() => {
    const c: Partial<Record<FactionId, number>> = {};
    for (const z of zones?.zones ?? []) c[z.faction] = (c[z.faction] ?? 0) + 1;
    return c;
  }, [zones]);

  const onMapClick = useCallback(
    async (c: [number, number]) => {
      // Map clicks only pick route points while the route planner is open.
      if (module !== 'routes') return;
      const place = await reverse(c);
      if (activeField === 'from' || !from) {
        setFrom(place);
        setActiveField('to');
      } else {
        setTo(place);
      }
    },
    [activeField, from, module],
  );

  const getPosition = (onFix: (c: LngLat) => void) => {
    if (!navigator.geolocation) return setLocError('Geolocalização não suportada neste navegador.');
    setLocating(true);
    setLocError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: LngLat = [pos.coords.longitude, pos.coords.latitude];
        setLocating(false);
        setLastFix(c);
        onFix(c);
      },
      () => {
        setLocating(false);
        setLocError('Não foi possível obter sua localização. Verifique a permissão de localização do navegador.');
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const locateAsOrigin = () =>
    getPosition(async (c) => {
      const place = await reverse(c);
      setFrom({ ...place, label: 'Minha localização' });
      setActiveField('to');
    });

  const routeToHospital = (h: Hospital) => {
    setTo({ label: h.name, detail: h.address, coord: h.coord });
    if (here) setFrom({ label: 'Minha localização', detail: '', coord: here });
    else setActiveField('from');
    setModule('routes');
  };

  const toggleFaction = (f: FactionId) => {
    setVisible((v) => {
      const n = new Set(v);
      if (n.has(f)) n.delete(f);
      else n.add(f);
      return n;
    });
  };

  const pickZone = (z: Zone) => {
    setLayers((l) => ({ ...l, zones: true }));
    setVisible((v) => (v.has(z.faction) ? v : new Set(v).add(z.faction)));
    setFocus({ zone: z, nonce: Date.now() });
  };

  const changeBasemap = (id: BasemapId) => {
    setBasemap(id);
    saveBasemap(id);
  };

  const pickRegion = (id: string) => {
    setRegion(id);
    const r = REGIONS.find((x) => x.id === id);
    if (r) setFitTo({ bounds: r.bounds, nonce: Date.now() });
  };

  const allLayers = layers.zones && layers.incidents && layers.hospitals;
  const current = moduleById(module);

  const panel = (() => {
    switch (module) {
      case 'routes':
        return (
          <RoutePlanner
            from={from}
            to={to}
            onFrom={setFrom}
            onTo={setTo}
            activeField={activeField}
            onActiveField={setActiveField}
            onLocate={locateAsOrigin}
            profile={profile}
            onProfile={setProfile}
            routes={routes}
            selected={selected}
            onSelect={setSelected}
            fastestIdx={fastestIdx}
            safestIdx={safestIdx}
            dest={dest}
            destIncidents={destIncidents}
            incidentHours={incidentHours}
            loading={loading}
            error={error ?? locError}
          />
        );
      case 'areas':
        return (
          <div className="stack">
            <ZoneSearch zones={zones?.zones ?? []} onPick={pickZone} />
            <section className="legend">
              <h2>Facções · {zones ? `${zones.zones.length} áreas` : 'carregando…'}</h2>
              <div className="chips">
                {FACTION_ORDER.map((f) => (
                  <button key={f} className={`chip ${visible.has(f) ? 'on' : ''}`} onClick={() => toggleFaction(f)}>
                    <span className="sw" style={{ background: FACTIONS[f].color }} />
                    {FACTIONS[f].label}
                    <span className="cnt">{counts[f] ?? 0}</span>
                  </button>
                ))}
              </div>
            </section>
          </div>
        );
      case 'monitor':
        return <MonitorPanel state={monitor} opts={monOpts} onOpts={setMonOpts} onStart={monitor.start} onStop={monitor.stop} />;
      case 'settings':
        return <SettingsPanel basemap={basemap} onBasemap={changeBasemap} hours={incidentHours} onHours={setIncidentHours} />;
      default:
        return <ComingSoon module={current} />;
    }
  })();

  const online = incidentsState.status === 'ok';
  // These modules take over the map area with their own screen; the map stays mounted underneath.
  const fullScreen = module === 'incidents' || module === 'health';
  const toggleNav = () => {
    setNavCollapsed(!navCollapsed);
    saveNavCollapsed(!navCollapsed);
  };

  return (
    <div className={`shell ${navCollapsed ? 'nav-collapsed' : ''} ${fullScreen ? 'screen-open' : ''}`}>
      <TopBar zones={zones?.zones ?? []} weather={weather} onPickZone={(z) => {
          if (fullScreen) setModule('overview');
          pickZone(z);
        }}
        onPickPlace={(p) => {
          if (fullScreen) setModule('overview');
          fly(p.coord);
        }} onBrand={() => setModule('overview')} />

      <SideNav
        active={module}
        onChange={setModule}
        badges={{ incidents: { count: visibleIncidents.length, tone: 'bad' } }}
        collapsed={navCollapsed}
        onToggle={toggleNav}
      />

      {module === 'incidents' && <IncidentsScreen state={incidentsState} onShowOnMap={showIncidentOnMap} />}
      {module === 'health' && (
        <HealthScreen
          hospitals={hospitals}
          zones={zones}
          here={here}
          locating={locating}
          locError={locError}
          onLocate={() => getPosition(() => {})}
          onRoute={routeToHospital}
          onShowOnMap={showHospitalOnMap}
        />
      )}

      <main className="center">
        <section className="map-card">
          <div className="map-toolbar">
            <label className="region">
              <MapPin size={16} />
              <select value={region} onChange={(e) => pickRegion(e.target.value)} aria-label="Região">
                {REGIONS.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={16} />
            </label>
            <div className="filters" role="group" aria-label="Camadas">
              <button className={allLayers ? 'on' : ''} onClick={() => setLayers({ zones: true, incidents: true, hospitals: true })}>
                Todos
              </button>
              {LAYER_FILTERS.map((f) => (
                <button key={f.id} className={layers[f.id] && !allLayers ? 'on' : ''} aria-pressed={layers[f.id]} onClick={() => setLayers((l) => (allLayers ? { zones: false, incidents: false, hospitals: false, [f.id]: true } : { ...l, [f.id]: !l[f.id] }))}>
                  <span className={`f-dot ${f.id} ${layers[f.id] ? 'lit' : ''}`} />
                  {f.label}
                </button>
              ))}
            </div>
            {layers.incidents && (
              <div className="segmented map-window" role="radiogroup" aria-label="Ocorrências no mapa">
                {INCIDENT_WINDOWS.map((h) => (
                  <button key={h} role="radio" aria-checked={incidentHours === h} className={incidentHours === h ? 'on' : ''} onClick={() => setIncidentHours(h)}>
                    {h} h
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="map-wrap">
            <MapView
              zones={zones}
              visible={visible}
              routes={routes}
              selected={selected}
              onSelect={setSelected}
              from={from?.coord ?? null}
              to={to?.coord ?? null}
              onMapClick={onMapClick}
              user={monitor.position}
              userRadiusM={monOpts.radiusM}
              focus={focus}
              basemap={basemap}
              hospitals={hospitals}
              hospitalTypes={ALL_HOSPITAL_TYPES}
              onHospitalRoute={routeToHospital}
              flyTo={flyTo}
              incidents={mapIncidents}
              layers={layers}
              onBasemap={changeBasemap}
              fitTo={fitTo}
              onLocate={() => getPosition(fly)}
            />
            {module === 'routes' && <div className="map-hint">Clique no mapa para definir {activeField === 'from' ? 'a origem' : 'o destino'}</div>}
          </div>
        </section>

      </main>

      <aside className="side">
        {zonesErr && <div className="alert bad">{zonesErr}</div>}
        {module === 'overview' ? (
          <IncidentsCard
            state={incidentsState}
            incidents={visibleIncidents}
            hours={incidentHours}
            onShow={showIncident}
            onOpen={() => setModule('incidents')}
            className="panel"
          />
        ) : (
          <section className="card panel">
            <header className="card-head">
              <h2>{current.label}</h2>
              <button className="link" onClick={() => setModule('overview')}>
                Visão geral
              </button>
            </header>
            <div className="card-body panel-body">{panel}</div>
          </section>
        )}
        <TerritoryCard counts={counts} total={zones?.zones.length ?? 0} onOpen={() => setModule('areas')} />
      </aside>

      <footer className="statusbar">
        <span className={`sys ${online ? 'ok' : 'off'}`}>
          <span className="sys-dot" /> {online ? 'Sistema online' : incidentsState.status === 'loading' ? 'Conectando…' : 'Ocorrências indisponíveis'}
        </span>
        {incidentsState.fetchedAt && <span>Última atualização: {fmtClock(incidentsState.fetchedAt)}</span>}
        <span className="sources">Fogo Cruzado · CNES · OpenStreetMap · Esri</span>
      </footer>

      {monitor.alert && <AlertModal alert={monitor.alert} onClose={monitor.dismissAlert} />}
      <IncidentToasts fresh={incidentsState.fresh} onShow={showIncident} />
      <DisclaimerModal />
    </div>
  );
}
