import type { FactionId, Zone, ZoneIndex } from '../lib/zones';
import type { RouteAnalysis } from '../lib/safety';
import type { LngLat } from '../lib/routing';
import type { BasemapId } from '../lib/basemaps';
import type { Hospital, HospitalType } from '../lib/hospitals';
import type { Incident } from '../lib/incidentTypes';

export type MapViewProps = {
  zones: ZoneIndex | null;
  visible: Set<FactionId>;
  routes: RouteAnalysis[];
  selected: number;
  onSelect: (i: number) => void;
  from: LngLat | null;
  to: LngLat | null;
  onMapClick: (c: LngLat) => void;
  /** Live GPS position while the proximity monitor runs. */
  user: LngLat | null;
  userRadiusM: number;
  /** Zone picked in the search; `nonce` re-triggers the fly-to on repeat picks. */
  focus: { zone: Zone; nonce: number } | null;
  basemap: BasemapId;
  hospitals: Hospital[];
  hospitalTypes: Set<HospitalType>;
  onHospitalRoute: (h: Hospital) => void;
  /** Point to center on (e.g. a hospital picked in the list); `nonce` re-triggers. */
  flyTo: { coord: LngLat; nonce: number } | null;
  /** Fogo Cruzado shootings already filtered to the chosen time window. */
  incidents: Incident[];
  layers: MapLayers;
  onBasemap: (id: BasemapId) => void;
  /** Bounds to frame (region picker); `nonce` re-triggers. */
  fitTo: { bounds: Bounds; nonce: number } | null;
  onLocate: () => void;
};

export type MapLayers = { zones: boolean; incidents: boolean; hospitals: boolean };
/** [[south, west], [north, east]] */
export type Bounds = [[number, number], [number, number]];

export const RIO_CENTER = { lat: -22.9, lng: -43.3 };

export const REGIONS: { id: string; label: string; bounds: Bounds }[] = [
  { id: 'capital', label: 'Rio de Janeiro · RJ', bounds: [[-23.08, -43.8], [-22.75, -43.1]] },
  { id: 'metro', label: 'Região Metropolitana', bounds: [[-23.1, -43.9], [-22.45, -42.7]] },
  { id: 'centro-sul', label: 'Centro e Zona Sul', bounds: [[-23.0, -43.3], [-22.89, -43.15]] },
  { id: 'norte', label: 'Zona Norte', bounds: [[-22.9, -43.4], [-22.78, -43.16]] },
  { id: 'oeste', label: 'Zona Oeste', bounds: [[-23.08, -43.8], [-22.85, -43.35]] },
  { id: 'baixada', label: 'Baixada Fluminense', bounds: [[-22.85, -43.75], [-22.55, -43.15]] },
  { id: 'leste', label: 'Niterói e São Gonçalo', bounds: [[-22.98, -43.15], [-22.75, -42.95]] },
];
