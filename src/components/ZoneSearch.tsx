import { useMemo, useState } from 'react';
import { normalize } from '../lib/text';
import { FACTIONS, type Zone } from '../lib/zones';

export function ZoneSearch({ zones, onPick }: { zones: Zone[]; onPick: (z: Zone) => void }) {
  const [q, setQ] = useState('');
  const index = useMemo(() => zones.map((z) => ({ z, key: normalize(z.name) })), [zones]);
  const hits = useMemo(() => {
    const v = normalize(q);
    return v.length < 2 ? [] : index.filter((e) => e.key.includes(v)).slice(0, 30);
  }, [q, index]);

  return (
    <div className="zone-search">
      <div className="place">
        <span aria-hidden>⌕</span>
        <input aria-label="Buscar comunidade" placeholder="Buscar comunidade…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {q.trim().length >= 2 && (
        <ul className="zone-results">
          {hits.length === 0 && <li className="empty">Nenhuma área encontrada</li>}
          {hits.map(({ z }) => (
            <li key={z.id}>
              <button onClick={() => onPick(z)}>
                <span className="sw" style={{ background: FACTIONS[z.faction].color }} />
                <span className="nm">{z.name}</span>
                <span className="fx">{z.faction}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
