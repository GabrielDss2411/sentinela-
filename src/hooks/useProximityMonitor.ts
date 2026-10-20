import { useCallback, useEffect, useRef, useState } from 'react';
import { beep, cancelSpeech, requestWakeLock, speak, unlockAudio, vibrate } from '../lib/alerts';
import type { Zone, ZoneIndex } from '../lib/zones';
import type { LngLat } from '../lib/routing';
import type { Incident } from '../lib/incidentTypes';
import { incidentsWithin } from '../lib/safety';

export type MonitorStatus = 'off' | 'starting' | 'nogps' | 'far' | 'near' | 'inside';

export type MonitorOptions = {
  radiusM: number;
  vibration: boolean;
  beeps: boolean;
  voice: boolean;
};

export type ProximityAlert =
  | { kind: 'zone'; zone: Zone; level: 1 | 2; distanceM: number }
  | { kind: 'incident'; incident: Incident; distanceM: number };

export type MonitorState = {
  status: MonitorStatus;
  position: LngLat | null;
  nearest?: { zone: Zone; distanceM: number };
  inRadius: number;
  /** Recent shootings inside the alert radius, closest first. */
  incidentsNear: { incident: Incident; distanceM: number }[];
};

/** Voice only speaks this close (or inside), and at most once per area every 10 min. */
const VOICE_MAX_M = 500;
const VOICE_REARM_MS = 10 * 60 * 1000;
/** Leaving 1.3× the radius re-arms alerts, so GPS jitter at the edge doesn't spam. */
const REARM_FACTOR = 1.3;
const VOICE_MSG = 'Atenção. Redobre o cuidado à frente.';
const VOICE_INCIDENT_MSG = 'Atenção. Tiroteio registrado recentemente nas proximidades.';
/** Only shootings this recent trigger a proximity alert. */
export const INCIDENT_ALERT_HOURS = 3;

export function useProximityMonitor(zones: ZoneIndex | null, opts: MonitorOptions, incidents: Incident[] = []) {
  const [state, setState] = useState<MonitorState>({ status: 'off', position: null, inRadius: 0, incidentsNear: [] });
  const [alert, setAlert] = useState<ProximityAlert | null>(null);

  const watchId = useRef<number | null>(null);
  const wake = useRef<WakeLockSentinel | null>(null);
  const alerted = useRef<{ id: number; level: number } | null>(null);
  const spoken = useRef<{ id: number; at: number } | null>(null);
  // Each shooting alerts once per monitoring session.
  const alertedIncidents = useRef(new Set<string>());
  // Latest values, read from inside the geolocation callback.
  const optsRef = useRef(opts);
  const zonesRef = useRef(zones);
  const incidentsRef = useRef(incidents);
  useEffect(() => {
    optsRef.current = opts;
    zonesRef.current = zones;
    incidentsRef.current = incidents;
  });

  const fire = useCallback((zone: Zone, level: 1 | 2, distanceM: number) => {
    const o = optsRef.current;
    let spoke = false;
    // Voice is checked before the repeat guard: with a 1–2 km radius the area was
    // usually already alerted further out, but the 500 m warning must still play.
    if (o.voice && (level === 2 || distanceM <= VOICE_MAX_M)) {
      const s = spoken.current;
      if (!s || s.id !== zone.id || Date.now() - s.at > VOICE_REARM_MS) {
        spoken.current = { id: zone.id, at: Date.now() };
        speak(VOICE_MSG);
        spoke = true;
      }
    }
    const a = alerted.current;
    if (a && a.id === zone.id && level <= a.level) return;
    alerted.current = { id: zone.id, level };
    setAlert({ kind: 'zone', zone, level, distanceM });
    if (o.vibration) vibrate(level);
    if (o.beeps && !spoke) beep();
  }, []);

  const fireIncident = useCallback((incident: Incident, distanceM: number) => {
    if (alertedIncidents.current.has(incident.id)) return;
    alertedIncidents.current.add(incident.id);
    const o = optsRef.current;
    setAlert({ kind: 'incident', incident, distanceM });
    if (o.vibration) vibrate(2);
    if (o.voice) speak(VOICE_INCIDENT_MSG);
    else if (o.beeps) beep();
  }, []);

  const onPosition = useCallback(
    (pos: GeolocationPosition) => {
      const idx = zonesRef.current;
      const position: LngLat = [pos.coords.longitude, pos.coords.latitude];
      if (!idx) return setState((s) => ({ ...s, position }));
      const { radiusM } = optsRef.current;
      const [lng, lat] = position;

      const inside = idx.containing(lng, lat);
      const around = idx.within(lng, lat, radiusM);
      const nearest = inside ? { zone: inside, distanceM: 0 } : (around[0] ?? idx.nearest(lng, lat, Math.max(3000, radiusM * 2)));
      const inRadius = around.length;
      const cutoff = Date.now() - INCIDENT_ALERT_HOURS * 3600_000;
      const incidentsNear = incidentsWithin(position, incidentsRef.current.filter((i) => Date.parse(i.date) >= cutoff), radiusM);

      let status: MonitorStatus = 'far';
      if (inside) {
        status = 'inside';
        fire(inside, 2, 0);
      } else if (nearest && nearest.distanceM <= radiusM) {
        status = 'near';
        fire(nearest.zone, 1, nearest.distanceM);
      } else if (!nearest || nearest.distanceM > radiusM * REARM_FACTOR) {
        alerted.current = null;
      }
      // A recent shooting outranks the territorial warning.
      if (incidentsNear[0]) fireIncident(incidentsNear[0].incident, incidentsNear[0].distanceM);
      setState({ status, position, nearest, inRadius, incidentsNear });
    },
    [fire, fireIncident],
  );

  const stop = useCallback(() => {
    if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current);
    watchId.current = null;
    void wake.current?.release().catch(() => {});
    wake.current = null;
    alerted.current = null;
    alertedIncidents.current.clear();
    cancelSpeech();
    setState({ status: 'off', position: null, inRadius: 0, incidentsNear: [] });
  }, []);

  const start = useCallback(async () => {
    if (!('geolocation' in navigator)) return setState((s) => ({ ...s, status: 'nogps' }));
    // Called from the button click: unlock audio while we still have the gesture.
    if (optsRef.current.beeps || optsRef.current.voice) unlockAudio();
    setState((s) => ({ ...s, status: 'starting' }));
    watchId.current = navigator.geolocation.watchPosition(onPosition, () => setState((s) => ({ ...s, status: 'nogps' })), {
      enableHighAccuracy: true,
      maximumAge: 2000,
      timeout: 15000,
    });
    wake.current = await requestWakeLock();
  }, [onPosition]);

  // A new radius re-arms alerts so the user is warned again under the new rule.
  useEffect(() => {
    alerted.current = null;
  }, [opts.radiusM]);

  useEffect(() => stop, [stop]);

  return { ...state, active: state.status !== 'off', start, stop, alert, dismissAlert: () => setAlert(null) };
}
