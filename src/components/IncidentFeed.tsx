import { useEffect, useState } from 'react';
import { fmtAgo, incidentPlace, incidentTitle } from '../hooks/useIncidents';
import type { Incident } from '../lib/incidentTypes';


/** Pop-in cards for shootings that showed up since the last poll. */
export function IncidentToasts({ fresh, onShow }: { fresh: Incident[]; onShow: (i: Incident) => void }) {
  const [toasts, setToasts] = useState<Incident[]>([]);

  useEffect(() => {
    if (!fresh.length) return;
    setToasts((t) => [...fresh, ...t].slice(0, 4));
    const ids = new Set(fresh.map((f) => f.id));
    const timer = setTimeout(() => setToasts((t) => t.filter((x) => !ids.has(x.id))), 20_000);
    return () => clearTimeout(timer);
  }, [fresh]);

  if (!toasts.length) return null;
  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((i) => (
        <div key={i.id} className="toast">
          <button
            className="toast-main"
            onClick={() => {
              onShow(i);
              setToasts((t) => t.filter((x) => x.id !== i.id));
            }}
          >
            <span className="inc-dot" />
            <span>
              <strong>Novo: {incidentPlace(i)}</strong>
              <span>
                {incidentTitle(i)} · {fmtAgo(i.date)}
              </span>
            </span>
          </button>
          <button className="icon-btn" aria-label="Fechar" onClick={() => setToasts((t) => t.filter((x) => x.id !== i.id))}>
            ×
          </button>
        </div>
      ))}
    </div>
  );
}
