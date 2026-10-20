import { bbox as turfBbox, booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf';
import type { Feature, FeatureCollection, Polygon } from 'geojson';

export type FactionId = 'CV' | 'TCP' | 'ADA' | 'MIL' | 'LJ' | 'MNI' | 'NEU';

export const FACTIONS: Record<FactionId, { label: string; color: string; risk: boolean }> = {
  CV: { label: 'Comando Vermelho (CV)', color: '#E0342C', risk: true },
  TCP: { label: 'Terceiro Comando Puro (TCP)', color: '#2FA46B', risk: true },
  ADA: { label: 'Amigos dos Amigos (ADA)', color: '#EDB72B', risk: true },
  MIL: { label: 'Milícia', color: '#4E9DE0', risk: true },
  LJ: { label: 'Liga da Justiça (CL220)', color: '#2B5BC7', risk: true },
  MNI: { label: 'Milícia de Nova Iguaçu', color: '#9B6BD6', risk: true },
  NEU: { label: 'Área neutra', color: '#8C97A3', risk: false },
};

export const FACTION_ORDER: FactionId[] = ['CV', 'TCP', 'ADA', 'MIL', 'LJ', 'MNI', 'NEU'];

export type ZoneProps = { n: string; f: FactionId };
export type ZoneFeature = Feature<Polygon, ZoneProps>;

export type Zone = {
  id: number;
  name: string;
  faction: FactionId;
  feature: ZoneFeature;
  /** [minLng, minLat, maxLng, maxLat] */
  bbox: [number, number, number, number];
};

export type ZoneIndex = {
  zones: Zone[];
  collection: FeatureCollection<Polygon, ZoneProps>;
  /** Zones whose bbox, expanded by `marginM` meters, contains the point. */
  candidates: (lng: number, lat: number, marginM: number) => Zone[];
  /** Zone that contains the point (risk zones only), if any. */
  containing: (lng: number, lat: number) => Zone | undefined;
  /** Nearest risk zone and distance in meters (0 when inside). */
  nearest: (lng: number, lat: number, searchRadiusM?: number) => { zone: Zone; distanceM: number } | undefined;
  /** Risk zones within `radiusM`, closest first. */
  within: (lng: number, lat: number, radiusM: number) => { zone: Zone; distanceM: number }[];
};

// Grid cell size in degrees (~1.1 km) for a coarse spatial index.
const CELL = 0.01;
const M_PER_DEG_LAT = 111_320;

function cellKey(x: number, y: number) {
  return `${x}:${y}`;
}

export async function loadZones(url = '/data/zonas.geojson'): Promise<ZoneIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Falha ao carregar áreas (${res.status})`);
  const collection = (await res.json()) as FeatureCollection<Polygon, ZoneProps>;

  const zones: Zone[] = collection.features.map((feature, id) => ({
    id,
    name: feature.properties.n,
    faction: feature.properties.f,
    feature,
    bbox: turfBbox(feature) as Zone['bbox'],
  }));

  const grid = new Map<string, Zone[]>();
  for (const z of zones) {
    const [x0, y0, x1, y1] = z.bbox;
    for (let x = Math.floor(x0 / CELL); x <= Math.floor(x1 / CELL); x++) {
      for (let y = Math.floor(y0 / CELL); y <= Math.floor(y1 / CELL); y++) {
        const k = cellKey(x, y);
        const list = grid.get(k);
        if (list) list.push(z);
        else grid.set(k, [z]);
      }
    }
  }

  const candidates = (lng: number, lat: number, marginM: number) => {
    const dLat = marginM / M_PER_DEG_LAT;
    const dLng = marginM / (M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180));
    const seen = new Set<number>();
    const out: Zone[] = [];
    for (let x = Math.floor((lng - dLng) / CELL); x <= Math.floor((lng + dLng) / CELL); x++) {
      for (let y = Math.floor((lat - dLat) / CELL); y <= Math.floor((lat + dLat) / CELL); y++) {
        for (const z of grid.get(cellKey(x, y)) ?? []) {
          if (seen.has(z.id)) continue;
          seen.add(z.id);
          const [x0, y0, x1, y1] = z.bbox;
          if (lng >= x0 - dLng && lng <= x1 + dLng && lat >= y0 - dLat && lat <= y1 + dLat) out.push(z);
        }
      }
    }
    return out;
  };

  const containing = (lng: number, lat: number) => {
    const p = point([lng, lat]);
    return candidates(lng, lat, 0).find((z) => FACTIONS[z.faction].risk && booleanPointInPolygon(p, z.feature));
  };

  const nearest = (lng: number, lat: number, searchRadiusM = 5000) => {
    const p = point([lng, lat]);
    let best: { zone: Zone; distanceM: number } | undefined;
    for (const z of candidates(lng, lat, searchRadiusM)) {
      if (!FACTIONS[z.faction].risk) continue;
      // pointToPolygonDistance is negative inside the polygon.
      const d = Math.max(0, pointToPolygonDistance(p, z.feature, { units: 'meters' }));
      if (!best || d < best.distanceM) best = { zone: z, distanceM: d };
      if (d === 0) break;
    }
    return best;
  };

  const within = (lng: number, lat: number, radiusM: number) => {
    const p = point([lng, lat]);
    const out: { zone: Zone; distanceM: number }[] = [];
    for (const z of candidates(lng, lat, radiusM)) {
      if (!FACTIONS[z.faction].risk) continue;
      const d = Math.max(0, pointToPolygonDistance(p, z.feature, { units: 'meters' }));
      if (d <= radiusM) out.push({ zone: z, distanceM: d });
    }
    return out.sort((a, b) => a.distanceM - b.distanceM);
  };

  return { zones, collection, candidates, containing, nearest, within };
}
