import { booleanPointInPolygon, point, pointToPolygonDistance } from '@turf/turf';
import type { LineString } from 'geojson';
import { FACTIONS, type FactionId, type Zone, type ZoneIndex } from './zones';
import type { LngLat, RawRoute } from './routing';
import type { Incident } from './incidentTypes';

/** Distance at which a route is considered "passing near" a mapped area. */
export const NEAR_M = 150;
/** Sampling step along the route. */
const STEP_M = 25;

export type CrossedZone = {
  zone: Zone;
  insideM: number;
  nearM: number;
};

export type RouteAnalysis = RawRoute & {
  insideM: number;
  nearM: number;
  crossed: CrossedZone[];
  byFaction: Partial<Record<FactionId, number>>;
  /** 0 (pior) a 100 (sem exposição mapeada). */
  score: number;
};

export type DestinationAnalysis = {
  inside?: Zone;
  nearest?: { zone: Zone; distanceM: number };
  /** Risk zones within 1 km of the destination. */
  within1km: { zone: Zone; distanceM: number }[];
};

function haversine(a: LngLat, b: LngLat) {
  const R = 6_371_000;
  const dLat = ((b[1] - a[1]) * Math.PI) / 180;
  const dLng = ((b[0] - a[0]) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos((a[1] * Math.PI) / 180) * Math.cos((b[1] * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Points every STEP_M along the line, each carrying the length it represents. */
function sample(line: LineString): { p: LngLat; w: number }[] {
  const out: { p: LngLat; w: number }[] = [];
  const c = line.coordinates as LngLat[];
  for (let i = 0; i < c.length - 1; i++) {
    const a = c[i];
    const b = c[i + 1];
    const d = haversine(a, b);
    const n = Math.max(1, Math.ceil(d / STEP_M));
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / n;
      out.push({ p: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], w: d / n });
    }
  }
  return out;
}

/**
 * Heuristic score. Weighted exposure = metres inside a mapped area plus a third
 * of metres passing close to one; expressed as a share of the trip, plus a small
 * penalty per distinct area crossed.
 */
function computeScore(totalM: number, insideM: number, nearM: number, crossedInside: number) {
  if (totalM <= 0) return 100;
  const exposure = (insideM + nearM / 3) / totalM; // 0..1
  const penalty = exposure * 250 + crossedInside * 3;
  return Math.max(0, Math.round(100 - penalty));
}

export function analyzeRoute(route: RawRoute, idx: ZoneIndex): RouteAnalysis {
  const crossed = new Map<number, CrossedZone>();
  let insideM = 0;
  let nearM = 0;

  for (const { p, w } of sample(route.geometry)) {
    const cands = idx.candidates(p[0], p[1], NEAR_M).filter((z) => FACTIONS[z.faction].risk);
    if (cands.length === 0) continue;
    const pt = point(p);

    let inZone: Zone | undefined;
    for (const z of cands) {
      if (booleanPointInPolygon(pt, z.feature)) {
        inZone = z;
        break;
      }
    }
    if (inZone) {
      insideM += w;
      const c = crossed.get(inZone.id) ?? { zone: inZone, insideM: 0, nearM: 0 };
      c.insideM += w;
      crossed.set(inZone.id, c);
      continue;
    }

    let closest: { z: Zone; d: number } | undefined;
    for (const z of cands) {
      const d = pointToPolygonDistance(pt, z.feature, { units: 'meters' });
      if (d <= NEAR_M && (!closest || d < closest.d)) closest = { z, d };
    }
    if (closest) {
      nearM += w;
      const c = crossed.get(closest.z.id) ?? { zone: closest.z, insideM: 0, nearM: 0 };
      c.nearM += w;
      crossed.set(closest.z.id, c);
    }
  }

  const list = [...crossed.values()].sort((a, b) => b.insideM - a.insideM || b.nearM - a.nearM);
  const byFaction: RouteAnalysis['byFaction'] = {};
  for (const c of list) {
    if (c.insideM > 0) byFaction[c.zone.faction] = (byFaction[c.zone.faction] ?? 0) + c.insideM;
  }
  const crossedInside = list.filter((c) => c.insideM > 0).length;

  return {
    ...route,
    insideM,
    nearM,
    crossed: list,
    byFaction,
    score: computeScore(route.distanceM, insideM, nearM, crossedInside),
  };
}

export function analyzeDestination(to: LngLat, idx: ZoneIndex): DestinationAnalysis {
  const within1km = idx.within(to[0], to[1], 1000);
  return {
    inside: idx.containing(to[0], to[1]),
    nearest: within1km[0] ?? idx.nearest(to[0], to[1], 10_000),
    within1km,
  };
}

/** Recent shootings within this distance of a route count against it. */
export const INCIDENT_ROUTE_M = 300;
export const INCIDENT_ROUTE_HOURS = 6;
/** Score points lost per recent shooting near the route, capped. */
const INCIDENT_PENALTY = 8;
const INCIDENT_PENALTY_MAX = 40;

export type IncidentNear = { incident: Incident; distanceM: number };

/** Meters from p to segment ab, on a local equirectangular projection (fine at city scale). */
function pointSegmentM(p: LngLat, a: LngLat, b: LngLat) {
  const k = Math.cos((p[1] * Math.PI) / 180) * 111_320;
  const ax = (a[0] - p[0]) * k, ay = (a[1] - p[1]) * 111_320;
  const bx = (b[0] - p[0]) * k, by = (b[1] - p[1]) * 111_320;
  const dx = bx - ax, dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 ? Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2)) : 0;
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function incidentsNearLine(line: LineString, incidents: Incident[], maxM: number): IncidentNear[] {
  const c = line.coordinates as LngLat[];
  const out: IncidentNear[] = [];
  for (const incident of incidents) {
    let best = Infinity;
    for (let i = 0; i < c.length - 1 && best > 0; i++) best = Math.min(best, pointSegmentM(incident.coord, c[i], c[i + 1]));
    if (best <= maxM) out.push({ incident, distanceM: best });
  }
  return out;
}

export function incidentsWithin(p: LngLat, incidents: Incident[], maxM: number): IncidentNear[] {
  return incidents
    .map((incident) => ({ incident, distanceM: haversine(p, incident.coord) }))
    .filter((x) => x.distanceM <= maxM)
    .sort((a, b) => a.distanceM - b.distanceM);
}

/** Applies recent-shooting penalties on top of the territorial score. */
export function withIncidents(r: RouteAnalysis, recent: Incident[]): RouteAnalysis & { incidents: IncidentNear[] } {
  const incidents = incidentsNearLine(r.geometry, recent, INCIDENT_ROUTE_M);
  const penalty = Math.min(INCIDENT_PENALTY_MAX, incidents.length * INCIDENT_PENALTY);
  return { ...r, incidents, score: Math.max(0, r.score - penalty) };
}

export function scoreLabel(score: number) {
  if (score >= 85) return { text: 'Baixa exposição', tone: 'good' as const };
  if (score >= 60) return { text: 'Exposição moderada', tone: 'warn' as const };
  return { text: 'Alta exposição', tone: 'bad' as const };
}

export function fmtDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

export function fmtDuration(s: number) {
  const min = Math.round(s / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
}
