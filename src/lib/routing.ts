import type { LineString } from 'geojson';

export type LngLat = [number, number];
export type Profile = 'car' | 'bike' | 'foot';

export type RawRoute = {
  geometry: LineString;
  distanceM: number;
  durationS: number;
  /** How this candidate was produced, for display. */
  source: 'osrm' | 'desvio';
};

// Public OSRM instances run by FOSSGIS (openstreetmap.de). Fine for personal use;
// for production, host your own OSRM/Valhalla/GraphHopper.
const OSRM_BASE: Record<Profile, string> = {
  car: 'https://routing.openstreetmap.de/routed-car/route/v1/driving',
  bike: 'https://routing.openstreetmap.de/routed-bike/route/v1/driving',
  foot: 'https://routing.openstreetmap.de/routed-foot/route/v1/driving',
};

type OsrmResponse = {
  code: string;
  message?: string;
  routes: { geometry: LineString; distance: number; duration: number }[];
};

async function osrm(profile: Profile, points: LngLat[], alternatives: number, signal?: AbortSignal) {
  const coords = points.map((p) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`).join(';');
  const params = new URLSearchParams({
    overview: 'full',
    geometries: 'geojson',
    steps: 'false',
    alternatives: alternatives > 0 ? String(alternatives) : 'false',
  });
  const res = await fetch(`${OSRM_BASE[profile]}/${coords}?${params}`, { signal });
  if (!res.ok) throw new Error(`Roteador respondeu ${res.status}`);
  const data = (await res.json()) as OsrmResponse;
  if (data.code !== 'Ok') throw new Error(data.message ?? data.code);
  return data.routes;
}

/**
 * Detour waypoints perpendicular to the straight line between origin and
 * destination. They push the router onto different corridors so we have more
 * candidates to compare than OSRM's own alternatives.
 */
function detourVias(a: LngLat, b: LngLat): LngLat[] {
  const cosLat = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  const dx = (b[0] - a[0]) * cosLat;
  const dy = b[1] - a[1];
  const len = Math.hypot(dx, dy);
  if (len === 0) return [];
  const mid: LngLat = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  // Offset of ~25% of the trip length, at least ~800 m.
  const off = Math.max(len * 0.25, 0.0075);
  const nx = -dy / len;
  const ny = dx / len;
  return [1, -1].map((s) => [mid[0] + (s * nx * off) / cosLat, mid[1] + s * ny * off] as LngLat);
}

function isDuplicate(r: RawRoute, list: RawRoute[]) {
  return list.some(
    (o) => Math.abs(o.distanceM - r.distanceM) / o.distanceM < 0.01 && Math.abs(o.durationS - r.durationS) / o.durationS < 0.01,
  );
}

export async function findRoutes(profile: Profile, from: LngLat, to: LngLat, signal?: AbortSignal): Promise<RawRoute[]> {
  const main = await osrm(profile, [from, to], 3, signal);
  const out: RawRoute[] = main.map((r) => ({
    geometry: r.geometry,
    distanceM: r.distance,
    durationS: r.duration,
    source: 'osrm',
  }));

  const fastest = out[0]?.durationS ?? Infinity;
  const detours = await Promise.allSettled(detourVias(from, to).map((via) => osrm(profile, [from, via, to], 0, signal)));
  for (const d of detours) {
    if (d.status !== 'fulfilled' || !d.value[0]) continue;
    const r = d.value[0];
    const cand: RawRoute = { geometry: r.geometry, distanceM: r.distance, durationS: r.duration, source: 'desvio' };
    // Ignore detours that more than double the trip time.
    if (cand.durationS <= fastest * 2 && !isDuplicate(cand, out)) out.push(cand);
  }
  return out.slice(0, 5);
}
