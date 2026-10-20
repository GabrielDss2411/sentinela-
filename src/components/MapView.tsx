import { useEffect, useMemo, useState } from 'react';
import { Circle, CircleMarker, GeoJSON, MapContainer, Marker, Polyline, Popup, ScaleControl, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { FACTIONS, type Zone, type ZoneProps } from '../lib/zones';
import type { RouteAnalysis } from '../lib/safety';
import type { LngLat } from '../lib/routing';
import { BaseLayer } from './BaseLayer';
import { HOSPITAL_TYPES, telHref, type HospitalType } from '../lib/hospitals';
import { fmtAgo, incidentPlace, incidentTitle, minutesAgo } from '../hooks/useIncidents';
import type { Incident } from '../lib/incidentTypes';
import { RIO_CENTER, type MapViewProps } from './mapTypes';
import { MapControls } from './MapControls';
import type { Feature, Polygon } from 'geojson';

/** Default Leaflet prefix includes a flag icon; keep a plain-text credit instead. */
function AttributionPrefix() {
  const map = useMap();
  useEffect(() => {
    map.attributionControl?.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
  }, [map]);
  return null;
}

function ClickHandler({ onMapClick }: { onMapClick: (c: LngLat) => void }) {
  useMapEvents({ click: (e) => onMapClick([e.latlng.lng, e.latlng.lat]) });
  return null;
}

function FitRoutes({ routes }: { routes: RouteAnalysis[] }) {
  const map = useMap();
  useEffect(() => {
    if (!routes.length) return;
    const b = L.latLngBounds([]);
    for (const r of routes) for (const [lng, lat] of r.geometry.coordinates) b.extend([lat, lng]);
    map.invalidateSize();
    map.fitBounds(b, { padding: [40, 40] });
  }, [routes, map]);
  return null;
}

function FocusZone({ focus }: { focus: MapViewProps['focus'] }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const [x0, y0, x1, y1] = focus.zone.bbox;
    map.invalidateSize();
    map.fitBounds([[y0, x0], [y1, x1]], { maxZoom: 16, padding: [30, 30] });
  }, [focus, map]);
  return null;
}

/** Centers on the user once, when monitoring starts; afterwards the user pans freely. */
function FollowUserOnce({ user }: { user: LngLat | null }) {
  const map = useMap();
  const hasUser = user !== null;
  useEffect(() => {
    map.invalidateSize();
    if (user) map.setView([user[1], user[0]], Math.max(map.getZoom(), 14));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when tracking toggles on
  }, [hasUser, map]);
  return null;
}

function FitTo({ fitTo }: { fitTo: MapViewProps['fitTo'] }) {
  const map = useMap();
  useEffect(() => {
    if (!fitTo) return;
    map.invalidateSize();
    map.flyToBounds(fitTo.bounds, { duration: 0.6 });
  }, [fitTo, map]);
  return null;
}

/** The map lives in a resizable grid cell; tell Leaflet when the cell changes size. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

function FlyTo({ flyTo }: { flyTo: MapViewProps['flyTo'] }) {
  const map = useMap();
  useEffect(() => {
    if (!flyTo) return;
    // The map may have just been shown again (it stays mounted, hidden, under full screens).
    map.invalidateSize();
    map.flyTo([flyTo.coord[1], flyTo.coord[0]], Math.max(map.getZoom(), 15), { duration: 0.6 });
  }, [flyTo, map]);
  return null;
}

const hospitalIcons = Object.fromEntries(
  Object.entries(HOSPITAL_TYPES).map(([t, v]) => [
    t,
    L.divIcon({ className: '', html: `<div class="h-pin" style="background:${v.color}">+</div>`, iconSize: [24, 24], iconAnchor: [12, 12], popupAnchor: [0, -12] }),
  ]),
) as Record<HospitalType, L.DivIcon>;

/** Hospital pins clutter the regional view; show them once zoomed into a city area. */
const HOSPITAL_MIN_ZOOM = 12;

function useZoom() {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });
  return zoom;
}

function HospitalLayer({ hospitals, types, onRoute }: { hospitals: MapViewProps['hospitals']; types: MapViewProps['hospitalTypes']; onRoute: MapViewProps['onHospitalRoute'] }) {
  const zoom = useZoom();
  if (zoom < HOSPITAL_MIN_ZOOM) return null;
  return hospitals
    .filter((h) => types.has(h.type))
    .map((h) => (
      <Marker key={h.id} position={[h.coord[1], h.coord[0]]} icon={hospitalIcons[h.type]} bubblingMouseEvents={false}>
        <Popup>
          <div className="h-pop">
            <strong>{h.name}</strong>
            <span style={{ color: HOSPITAL_TYPES[h.type].color }}>{HOSPITAL_TYPES[h.type].label}</span>
            {h.address && <span>{h.address}</span>}
            <div className="h-actions">
              <button className="primary" onClick={() => onRoute(h)}>
                Rota até aqui
              </button>
              {h.phone && (
                <a className="ghost" href={telHref(h.phone)}>
                  Ligar
                </a>
              )}
            </div>
          </div>
        </Popup>
      </Marker>
    ));
}

/** Age buckets: < 1 h pulses red, < 6 h orange, older grey. */
function incidentIcon(i: Incident) {
  const m = minutesAgo(i.date);
  const age = m < 60 ? 'fresh' : m < 360 ? 'recent' : 'old';
  return L.divIcon({ className: '', html: `<div class="inc-pin ${age}"><span></span></div>`, iconSize: [26, 26], iconAnchor: [13, 13], popupAnchor: [0, -12] });
}

function IncidentLayer({ incidents }: { incidents: Incident[] }) {
  return incidents.map((i) => (
    <Marker key={i.id} position={[i.coord[1], i.coord[0]]} icon={incidentIcon(i)} bubblingMouseEvents={false} zIndexOffset={500}>
      <Popup>
        <div className="h-pop">
          <strong>{incidentTitle(i)}</strong>
          <span>
            {incidentPlace(i)} · {fmtAgo(i.date)}
          </span>
          {(i.dead > 0 || i.wounded > 0) && (
            <span>
              {i.dead > 0 && `${i.dead} morto(s)`}
              {i.dead > 0 && i.wounded > 0 && ' · '}
              {i.wounded > 0 && `${i.wounded} ferido(s)`}
            </span>
          )}
          {i.reason && <span>Motivo: {i.reason}</span>}
          <span className="src">Fonte: Fogo Cruzado</span>
        </div>
      </Popup>
    </Marker>
  ));
}

// Waze-style route: bright cyan line over a darker casing.
const ROUTE = { casing: '#0b6e99', line: '#33ccff', alt: '#8a9bab', altCasing: '#5d6b78' };

function zoneTooltip(z: Pick<Zone, 'name' | 'faction'>) {
  const name = z.name.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);
  return `<b>${name}</b><br>${FACTIONS[z.faction].label}`;
}

export function MapView({
  zones,
  visible,
  routes,
  selected,
  onSelect,
  from,
  to,
  onMapClick,
  user,
  userRadiusM,
  focus,
  basemap,
  hospitals,
  hospitalTypes,
  onHospitalRoute,
  flyTo,
  incidents,
  layers,
  onBasemap,
  fitTo,
  onLocate,
}: MapViewProps) {
  const data = useMemo(() => {
    if (!zones) return null;
    return { ...zones.collection, features: zones.collection.features.filter((f) => visible.has(f.properties.f)) };
  }, [zones, visible]);

  const order = routes.map((_, i) => i).filter((i) => i !== selected);
  if (routes[selected]) order.push(selected);

  return (
    <MapContainer center={[RIO_CENTER.lat, RIO_CENTER.lng]} zoom={11} preferCanvas className="map" zoomControl={false}>
      <AttributionPrefix />
      <BaseLayer id={basemap} />
      <ClickHandler onMapClick={onMapClick} />
      <FitRoutes routes={routes} />
      <FocusZone focus={focus} />
      <FollowUserOnce user={user} />
      <FlyTo flyTo={flyTo} />
      <FitTo fitTo={fitTo} />
      <AutoResize />
      <ScaleControl position="bottomleft" imperial={false} />
      <MapControls basemap={basemap} onBasemap={onBasemap} onLocate={onLocate} />

      {data && layers.zones && (
        <GeoJSON
          key={[...visible].join(',')}
          data={data}
          style={(f) => {
            const c = FACTIONS[(f as Feature<Polygon, ZoneProps>).properties.f].color;
            return { color: c, weight: 1, fillColor: c, fillOpacity: 0.28 };
          }}
          onEachFeature={(f: Feature<Polygon, ZoneProps>, layer) => {
            layer.bindTooltip(zoneTooltip({ name: f.properties.n, faction: f.properties.f }), { sticky: true });
          }}
        />
      )}

      {order.map((i) => {
        const r = routes[i];
        const isSel = i === selected;
        const positions = r.geometry.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]);
        return [
          <Polyline
            key={`c-${i}-${r.distanceM}`}
            positions={positions}
            interactive={false}
            pathOptions={{ color: isSel ? ROUTE.casing : ROUTE.altCasing, weight: isSel ? 11 : 8, opacity: isSel ? 1 : 0.5, lineCap: 'round', lineJoin: 'round' }}
          />,
          <Polyline
            key={`l-${i}-${r.distanceM}`}
            positions={positions}
            bubblingMouseEvents={false}
            pathOptions={{ color: isSel ? ROUTE.line : ROUTE.alt, weight: isSel ? 7 : 5, opacity: isSel ? 1 : 0.7, lineCap: 'round', lineJoin: 'round' }}
            eventHandlers={{ click: () => onSelect(i) }}
          >
            <Tooltip sticky>Rota {i + 1}</Tooltip>
          </Polyline>,
        ];
      })}

      {layers.hospitals && <HospitalLayer hospitals={hospitals} types={hospitalTypes} onRoute={onHospitalRoute} />}
      {layers.incidents && <IncidentLayer incidents={incidents} />}

      {focus && (
        <GeoJSON
          key={`focus-${focus.nonce}`}
          data={focus.zone.feature}
          interactive={false}
          style={{ color: '#111827', weight: 3, dashArray: '6 4', fill: false }}
        />
      )}

      {user && (
        <>
          <Circle
            center={[user[1], user[0]]}
            radius={userRadiusM}
            interactive={false}
            pathOptions={{ color: '#3FA9F5', weight: 1, dashArray: '4 6', fillColor: '#3FA9F5', fillOpacity: 0.06 }}
          />
          <CircleMarker center={[user[1], user[0]]} radius={7} className="user-dot" pathOptions={{ color: '#fff', weight: 3, fillColor: '#1a73e8', fillOpacity: 1 }}>
            <Tooltip>Você</Tooltip>
          </CircleMarker>
        </>
      )}

      {from && (
        <CircleMarker center={[from[1], from[0]]} radius={8} pathOptions={{ color: '#fff', weight: 3, fillColor: '#3FA9F5', fillOpacity: 1 }}>
          <Tooltip>Origem</Tooltip>
        </CircleMarker>
      )}
      {to && (
        <CircleMarker center={[to[1], to[0]]} radius={9} pathOptions={{ color: '#fff', weight: 3, fillColor: '#F5523F', fillOpacity: 1 }}>
          <Tooltip>Destino</Tooltip>
        </CircleMarker>
      )}
    </MapContainer>
  );
}
