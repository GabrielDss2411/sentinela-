import { useCallback, useEffect, useRef, useState } from 'react';
import type { Incident, IncidentsError, IncidentsResponse } from '../lib/incidentTypes';
import { API_BASE } from '../lib/api';

const POLL_MS = 2 * 60_000;

export const INCIDENT_WINDOWS = [3, 12, 24] as const;
export type IncidentWindow = (typeof INCIDENT_WINDOWS)[number];
/** The server always fetches the widest window (30 days); the map and screens filter locally. */
const FETCH_HOURS = 30 * 24;

export type IncidentsState = {
  incidents: Incident[];
  status: 'loading' | 'ok' | 'unconfigured' | 'error';
  error: string | null;
  demo: boolean;
  fetchedAt: string | null;
  /** Incidents that appeared since the previous poll (empty on first load). */
  fresh: Incident[];
};

export function useIncidents() {
  const [state, setState] = useState<IncidentsState>({ incidents: [], status: 'loading', error: null, demo: false, fetchedAt: null, fresh: [] });
  const seen = useRef<Set<string> | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/fogo-cruzado?hours=${FETCH_HOURS}`);
      const body = (await res.json()) as IncidentsResponse | IncidentsError;
      if ('error' in body) {
        setState((s) => ({ ...s, status: body.configured ? 'error' : 'unconfigured', error: body.error }));
        return;
      }
      const prev = seen.current;
      // Records can be added days late; only announce ones that happened in the last day.
      const recent = Date.now() - 24 * 3600_000;
      const fresh = prev ? body.incidents.filter((i) => !prev.has(i.id) && Date.parse(i.date) >= recent) : [];
      seen.current = new Set(body.incidents.map((i) => i.id));
      setState({ incidents: body.incidents, status: 'ok', error: null, demo: body.demo, fetchedAt: body.fetchedAt, fresh });
    } catch {
      // Network blip: keep what we have and try again on the next tick.
      setState((s) => ({ ...s, status: s.incidents.length ? s.status : 'error', error: 'Sem conexão com o servidor de alertas' }));
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void load();
    }, POLL_MS);
    const onVisible = () => document.visibilityState === 'visible' && void load();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [load]);

  return { ...state, reload: load };
}

export function minutesAgo(iso: string, now = Date.now()) {
  return Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
}

export function fmtAgo(iso: string, now = Date.now()) {
  const m = minutesAgo(iso, now);
  if (m < 1) return 'agora';
  if (m < 60) return `há ${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `há ${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `há ${Math.floor(h / 24)} d`;
}

export function incidentTitle(i: Incident) {
  const kind = i.policeAction ? 'Tiroteio com ação policial' : 'Tiroteio / disparos';
  return i.massacre ? `${kind} · chacina` : kind;
}

export function incidentPlace(i: Incident) {
  return [i.neighborhood, i.city].filter(Boolean).join(', ') || i.address || 'Local não informado';
}

export type Severity = 'alta' | 'media' | 'baixa';
export const SEVERITY_LABEL: Record<Severity, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

/** Deaths or a massacre rank high, wounded medium, everything else low. */
export function incidentSeverity(i: Incident): Severity {
  if (i.massacre || i.dead > 0) return 'alta';
  if (i.wounded > 0 || i.policeAction) return 'media';
  return 'baixa';
}

export function fmtClock(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
