import type { LngLat } from './routing';

export type Place = { label: string; detail: string; coord: LngLat };

// Photon (komoot) — OSM-based geocoder with type-ahead support.
// Bounding box restricts results to the state of Rio de Janeiro.
const PHOTON = 'https://photon.komoot.io';
const RJ_BBOX = '-44.9,-23.4,-40.9,-20.7';

type PhotonFeature = {
  geometry: { coordinates: LngLat };
  properties: Record<string, string | undefined>;
};

function toPlace(f: PhotonFeature): Place {
  const p = f.properties;
  const street = [p.street, p.housenumber].filter(Boolean).join(', ');
  const label = p.name ?? (street || p.district || p.city || 'Local');
  const detail = [p.name ? street : undefined, p.district, p.city].filter(Boolean).join(' · ');
  return { label, detail, coord: f.geometry.coordinates };
}

export async function searchPlaces(q: string, near?: LngLat, signal?: AbortSignal): Promise<Place[]> {
  const params = new URLSearchParams({ q, limit: '6', bbox: RJ_BBOX });
  const [lon, lat] = near ?? [-43.2, -22.9];
  params.set('lon', String(lon));
  params.set('lat', String(lat));
  const res = await fetch(`${PHOTON}/api/?${params}`, { signal });
  if (!res.ok) return [];
  const data = (await res.json()) as { features: PhotonFeature[] };
  const seen = new Set<string>();
  return data.features.map(toPlace).filter((p) => {
    const k = `${p.label}|${p.detail}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export async function reverse(coord: LngLat, signal?: AbortSignal): Promise<Place> {
  const fallback = { label: `${coord[1].toFixed(5)}, ${coord[0].toFixed(5)}`, detail: 'Ponto no mapa', coord };
  try {
    const res = await fetch(`${PHOTON}/reverse?lon=${coord[0]}&lat=${coord[1]}`, { signal });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { features: PhotonFeature[] };
    return data.features[0] ? { ...toPlace(data.features[0]), coord } : fallback;
  } catch {
    return fallback;
  }
}
