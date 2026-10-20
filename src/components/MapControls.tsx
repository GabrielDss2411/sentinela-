import { Crosshair, Layers, LocateFixed, Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';
import { BASEMAPS, type BasemapId } from '../lib/basemaps';
import { RIO_CENTER } from './mapTypes';

type Props = { basemap: BasemapId; onBasemap: (id: BasemapId) => void; onLocate: () => void };

/** Floating control column on the map's right edge. */
export function MapControls({ basemap, onBasemap, onLocate }: Props) {
  const map = useMap();
  const [styles, setStyles] = useState(false);

  // Keep clicks and scrolls on the controls from reaching the map.
  const stop = (el: HTMLDivElement | null) => {
    if (el) {
      L.DomEvent.disableClickPropagation(el);
      L.DomEvent.disableScrollPropagation(el);
    }
  };

  return (
    <div className="map-ctrls" ref={stop}>
      <div className="ctrl-group">
        <button title="Centralizar no Rio" onClick={() => map.flyTo([RIO_CENTER.lat, RIO_CENTER.lng], 11, { duration: 0.6 })}>
          <Crosshair size={18} />
        </button>
        <button title="Aproximar" onClick={() => map.zoomIn()}>
          <Plus size={18} />
        </button>
        <button title="Afastar" onClick={() => map.zoomOut()}>
          <Minus size={18} />
        </button>
        <button title="Minha localização" onClick={onLocate}>
          <LocateFixed size={18} />
        </button>
      </div>
      <div className="ctrl-group">
        <button title="Estilo do mapa" className={styles ? 'on' : ''} onClick={() => setStyles((s) => !s)}>
          <Layers size={18} />
        </button>
      </div>
      {styles && (
        <div className="ctrl-pop" role="menu">
          <h4>Estilo do mapa</h4>
          {BASEMAPS.map((b) => (
            <button
              key={b.id}
              role="menuitemradio"
              aria-checked={basemap === b.id}
              className={basemap === b.id ? 'on' : ''}
              onClick={() => {
                onBasemap(b.id);
                setStyles(false);
              }}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
