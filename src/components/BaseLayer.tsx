import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import '@maplibre/maplibre-gl-leaflet';
import { setWorkerUrl } from 'maplibre-gl';
import maplibreWorkerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { basemapById, loadStyle, OFM_ATTRIBUTION, OSM_ATTRIBUTION, OSM_TILES, type BasemapId } from '../lib/basemaps';

// MapLibre locates its worker next to its own module, which breaks once Vite
// bundles it; point it at a worker Vite builds instead.
setWorkerUrl(maplibreWorkerUrl);

/** Swaps the basemap under the risk layers: MapLibre vector styles or OSM raster tiles. */
export function BaseLayer({ id }: { id: BasemapId }) {
  const map = useMap();

  useEffect(() => {
    const b = basemapById(id);
    let layer: L.Layer | null = null;
    let cancelled = false;

    if (b.kind === 'raster') {
      const tiles = [L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19 }), ...(b.overlays ?? []).map((u) => L.tileLayer(u, { maxZoom: 19 }))];
      layer = L.layerGroup(tiles).addTo(map);
    } else {
      loadStyle(b)
        .then((style) => {
          if (cancelled) return;
          // The binding forwards customAttribution to Leaflet's attribution control.
          layer = L.maplibreGL({ style, attributionControl: { customAttribution: OFM_ATTRIBUTION } }).addTo(map);
        })
        .catch(() => {
          // Vector style failed (offline, service down): fall back to raster OSM.
          if (!cancelled) layer = L.tileLayer(OSM_TILES, { attribution: OSM_ATTRIBUTION, maxZoom: 19 }).addTo(map);
        });
    }

    return () => {
      cancelled = true;
      if (layer) map.removeLayer(layer);
    };
  }, [id, map]);

  return null;
}
