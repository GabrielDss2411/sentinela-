import { MapPin, Search, Users } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { searchPlaces, type Place } from '../lib/geocode';
import { normalize } from '../lib/text';
import { FACTIONS, type Zone } from '../lib/zones';

type Props = {
  zones: Zone[];
  onPickZone: (z: Zone) => void;
  onPickPlace: (p: Place) => void;
};

/** One box for both mapped communities (local) and addresses (Photon). */
export function GlobalSearch({ zones, onPickZone, onPickPlace }: Props) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [places, setPlaces] = useState<Place[]>([]);

  const index = useMemo(() => zones.map((z) => ({ z, key: normalize(z.name) })), [zones]);
  const zoneHits = useMemo(() => {
    const v = normalize(q);
    return v.length < 2 ? [] : index.filter((e) => e.key.includes(v)).slice(0, 5);
  }, [q, index]);

  useEffect(() => {
    if (q.trim().length < 3) {
      setPlaces([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, undefined, ctrl.signal)
        .then((r) => setPlaces(r.slice(0, 5)))
        .catch(() => {});
    }, 300);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);

  const done = () => {
    setOpen(false);
    setQ('');
  };
  const hasResults = zoneHits.length > 0 || places.length > 0;

  return (
    <div className="gsearch">
      <Search size={18} aria-hidden />
      <input
        aria-label="Buscar bairro, endereço ou comunidade"
        placeholder="Buscar bairro, endereço, comunidade…"
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => e.key === 'Escape' && done()}
      />
      {open && q.trim().length >= 2 && (
        <div className="gsearch-results">
          {!hasResults && <p className="empty">Nenhum resultado</p>}
          {zoneHits.length > 0 && <h3>Comunidades</h3>}
          {zoneHits.map(({ z }) => (
            <button
              key={`z${z.id}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPickZone(z);
                done();
              }}
            >
              <Users size={16} style={{ color: FACTIONS[z.faction].color }} />
              <span>
                <strong>{z.name}</strong>
                <small>{FACTIONS[z.faction].label}</small>
              </span>
            </button>
          ))}
          {places.length > 0 && <h3>Endereços</h3>}
          {places.map((p, i) => (
            <button
              key={`p${i}`}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onPickPlace(p);
                done();
              }}
            >
              <MapPin size={16} />
              <span>
                <strong>{p.label}</strong>
                {p.detail && <small>{p.detail}</small>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
