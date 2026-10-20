import type { LayerSpecification, StyleSpecification } from 'maplibre-gl';

/**
 * Basemap color themes, applied on top of an OpenFreeMap style (OpenMapTiles
 * schema). Edit the colors here to restyle the map.
 */
export type MapTheme = {
  background: string;
  residential: string;
  water: string;
  park: string;
  wood: string;
  building: string;
  motorway: string;
  major: string;
  minor: string;
  casing: string;
  rail: string;
  boundary: string;
  label: string;
  labelHalo: string;
  /** Layers whose id contains any of these are hidden (less clutter under the risk polygons). */
  hide: string[];
};

export const SENTINELA_THEME: MapTheme = {
  background: '#f3f1ec',
  residential: '#efece6',
  water: '#a8c8e1',
  park: '#d9e8d2',
  wood: '#cfe2c6',
  building: '#e4e0d8',
  motorway: '#f2b84b',
  major: '#ffffff',
  minor: '#ffffff',
  casing: '#d3cdc2',
  rail: '#c3bdb3',
  boundary: '#b9b2a6',
  label: '#3b4552',
  labelHalo: '#ffffff',
  hide: ['aeroway', 'housenumber', 'boundary_3'],
};

/** Waze daytime look: pale land, cyan water, yellow highways, white streets. */
export const WAZE_DAY_THEME: MapTheme = {
  background: '#f2f2ee',
  residential: '#ecece6',
  water: '#9fd8f5',
  park: '#c7ebb3',
  wood: '#b9e3a2',
  building: '#e3e1db',
  motorway: '#ffcf45',
  major: '#fff3b0',
  minor: '#ffffff',
  casing: '#c9c6bd',
  rail: '#c8c8c8',
  boundary: '#b5b5b5',
  label: '#3c4043',
  labelHalo: '#ffffff',
  hide: ['aeroway', 'housenumber', 'boundary_3', 'railway_service', 'railway_dashline', 'railway_transit_dashline'],
};

/** Waze night look: navy land, deep-blue water, amber highways, slate streets. */
export const WAZE_NIGHT_THEME: MapTheme = {
  background: '#1b2633',
  residential: '#1f2b39',
  water: '#0f2a42',
  park: '#1e3a32',
  wood: '#1c362f',
  building: '#243242',
  motorway: '#d99a2b',
  major: '#4b6077',
  minor: '#34465a',
  casing: '#16202b',
  rail: '#2c3a4a',
  boundary: '#3a4b5e',
  label: '#c9d6e3',
  labelHalo: '#1b2633',
  hide: ['aeroway', 'housenumber', 'boundary_3', 'railway_minor', 'railway_dashline', 'railway_transit_dashline', 'railway_minor_dashline'],
};

type Rule = { match: RegExp; type: LayerSpecification['type']; paint: (t: MapTheme) => Record<string, string> };

// Layer ids follow OpenMapTiles naming used by every OpenFreeMap style. First match wins.
const RULES: Rule[] = [
  { match: /^background$/, type: 'background', paint: (t) => ({ 'background-color': t.background }) },
  { match: /^water/, type: 'fill', paint: (t) => ({ 'fill-color': t.water }) },
  { match: /^waterway/, type: 'line', paint: (t) => ({ 'line-color': t.water }) },
  { match: /park/, type: 'fill', paint: (t) => ({ 'fill-color': t.park }) },
  { match: /landcover_wood|landcover_grass/, type: 'fill', paint: (t) => ({ 'fill-color': t.wood }) },
  { match: /landuse_residential|landcover_ice|landcover_glacier|road_area_pier/, type: 'fill', paint: (t) => ({ 'fill-color': t.residential }) },
  { match: /^building/, type: 'fill', paint: (t) => ({ 'fill-color': t.building }) },
  { match: /casing/, type: 'line', paint: (t) => ({ 'line-color': t.casing }) },
  { match: /motorway.*(inner|subtle)|^highway_motorway$/, type: 'line', paint: (t) => ({ 'line-color': t.motorway }) },
  { match: /major.*(inner|subtle)/, type: 'line', paint: (t) => ({ 'line-color': t.major }) },
  { match: /highway_minor|highway_path|road_pier/, type: 'line', paint: (t) => ({ 'line-color': t.minor }) },
  { match: /^railway/, type: 'line', paint: (t) => ({ 'line-color': t.rail }) },
  { match: /^boundary/, type: 'line', paint: (t) => ({ 'line-color': t.boundary }) },
  { match: /./, type: 'symbol', paint: (t) => ({ 'text-color': t.label, 'text-halo-color': t.labelHalo }) },
];

/** Returns a copy of `style` with the theme's colors and hidden layers applied. */
export function applyTheme(style: StyleSpecification, theme: MapTheme): StyleSpecification {
  const layers = style.layers.map((layer) => {
    if (theme.hide.some((h) => layer.id.includes(h))) {
      return { ...layer, layout: { ...layer.layout, visibility: 'none' } } as LayerSpecification;
    }
    const rule = RULES.find((r) => r.type === layer.type && r.match.test(layer.id));
    if (!rule || !('paint' in layer)) return layer;
    // Symbol layers without text (icons, shields) don't accept text paint properties.
    if (layer.type === 'symbol' && !layer.layout?.['text-field']) return layer;
    return { ...layer, paint: { ...layer.paint, ...rule.paint(theme) } } as LayerSpecification;
  });
  return { ...style, layers };
}
