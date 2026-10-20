import type { StyleSpecification } from 'maplibre-gl';
import { applyTheme, SENTINELA_THEME, WAZE_DAY_THEME, WAZE_NIGHT_THEME, type MapTheme } from './mapTheme';

export type BasemapId = 'satellite' | 'waze-day' | 'waze-night' | 'sentinela' | 'liberty' | 'positron' | 'dark' | 'osm';

/** Raster basemaps may stack transparent `overlays` (labels, roads) on top of the base tiles. */
type Basemap =
  | { id: BasemapId; label: string; kind: 'vector'; style: string; theme?: MapTheme }
  | { id: BasemapId; label: string; kind: 'raster'; url: string; attribution: string; overlays?: string[] };

// OpenFreeMap: free vector tiles, no API key, no usage limits (https://openfreemap.org).
const OFM = 'https://tiles.openfreemap.org/styles';
export const OSM_TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const OFM_ATTRIBUTION =
  '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank">OpenMapTiles</a> © <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
export const OSM_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';
// Esri World Imagery: free satellite tiles with attribution.
const ESRI = 'https://server.arcgisonline.com/ArcGIS/rest/services';
const ESRI_ATTRIBUTION = 'Imagens © <a href="https://www.esri.com" target="_blank">Esri</a>, Maxar, Earthstar Geographics';

export const BASEMAPS: Basemap[] = [
  {
    id: 'satellite',
    label: 'Satélite',
    kind: 'raster',
    url: `${ESRI}/World_Imagery/MapServer/tile/{z}/{y}/{x}`,
    attribution: ESRI_ATTRIBUTION,
    overlays: [`${ESRI}/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}`, `${ESRI}/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}`],
  },
  { id: 'waze-night', label: 'Waze noite', kind: 'vector', style: `${OFM}/dark`, theme: WAZE_NIGHT_THEME },
  { id: 'sentinela', label: 'Sentinela', kind: 'vector', style: `${OFM}/positron`, theme: SENTINELA_THEME },
  { id: 'waze-day', label: 'Waze dia', kind: 'vector', style: `${OFM}/positron`, theme: WAZE_DAY_THEME },
  { id: 'liberty', label: 'Detalhado', kind: 'vector', style: `${OFM}/liberty` },
  { id: 'positron', label: 'Claro', kind: 'vector', style: `${OFM}/positron` },
  { id: 'dark', label: 'Escuro', kind: 'vector', style: `${OFM}/dark` },
  { id: 'osm', label: 'OSM clássico', kind: 'raster', url: OSM_TILES, attribution: OSM_ATTRIBUTION },
];

const styleCache = new Map<string, Promise<StyleSpecification>>();

export function basemapById(id: BasemapId) {
  return BASEMAPS.find((b) => b.id === id) ?? BASEMAPS[0];
}

/** Style JSON for a vector basemap, with its color theme applied. */
export function loadStyle(b: Extract<Basemap, { kind: 'vector' }>): Promise<StyleSpecification> {
  const key = b.id;
  let p = styleCache.get(key);
  if (!p) {
    p = fetch(b.style)
      .then((r) => {
        if (!r.ok) throw new Error(`Estilo do mapa indisponível (${r.status})`);
        return r.json() as Promise<StyleSpecification>;
      })
      .then((s) => (b.theme ? applyTheme(s, b.theme) : s));
    p.catch(() => styleCache.delete(key));
    styleCache.set(key, p);
  }
  return p;
}

const STORAGE_KEY = 'sentinela.basemap';

export function savedBasemap(): BasemapId {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v && BASEMAPS.some((b) => b.id === v)) return v as BasemapId;
  } catch {
    /* storage blocked */
  }
  return 'satellite';
}

export function saveBasemap(id: BasemapId) {
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* storage blocked */
  }
}
