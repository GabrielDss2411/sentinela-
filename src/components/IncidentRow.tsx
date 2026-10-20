import { Info, OctagonAlert, TriangleAlert } from 'lucide-react';
import { fmtClock, incidentPlace, incidentSeverity, incidentTitle, SEVERITY_LABEL } from '../hooks/useIncidents';
import type { Incident } from '../lib/incidentTypes';

const ICON = { alta: OctagonAlert, media: Info, baixa: TriangleAlert };

/** Compact incident line used by the dashboard lists: icon, title, time · place, severity badge. */
export function IncidentRow({ incident: i, onShow }: { incident: Incident; onShow: (i: Incident) => void }) {
  const sev = incidentSeverity(i);
  const Icon = ICON[sev];
  return (
    <li>
      <button className="inc-row" onClick={() => onShow(i)}>
        <span className={`sev-icon ${sev}`}>
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <span className="inc-row-text">
          <strong>{incidentTitle(i)}</strong>
          <small>
            {fmtClock(i.date)} · {incidentPlace(i)}
          </small>
        </span>
        <span className={`sev-badge ${sev}`}>{SEVERITY_LABEL[sev]}</span>
      </button>
    </li>
  );
}
