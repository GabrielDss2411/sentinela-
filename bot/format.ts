import type { Incident } from '../src/lib/incidentTypes.ts';
import { esc } from './telegram.ts';
import type { Place } from './state.ts';

export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6_371_000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Closest saved place within the radius, if any. */
export function nearestPlace(i: Incident, places: Place[], radiusKm: number) {
  let best: { place: Place; distanceM: number } | null = null;
  for (const place of places) {
    const d = haversineM(i.coord[1], i.coord[0], place.lat, place.lng);
    if (d <= radiusKm * 1000 && (!best || d < best.distanceM)) best = { place, distanceM: d };
  }
  return best;
}

export function fmtDist(m: number) {
  return m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

const clock = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export function fmtWhen(iso: string, now = Date.now()) {
  const min = Math.max(0, Math.round((now - Date.parse(iso)) / 60_000));
  const ago = min < 60 ? `há ${min} min` : min < 24 * 60 ? `há ${Math.floor(min / 60)} h${min % 60 ? ` ${min % 60} min` : ''}` : `há ${Math.floor(min / 1440)} d`;
  return `${clock.format(new Date(iso)).replace(',', '')} (${ago})`;
}

function severity(i: Incident) {
  if (i.dead > 0 || i.massacre) return '🔴';
  if (i.wounded > 0 || i.policeAction) return '🟠';
  return '🟡';
}

export function title(i: Incident) {
  const kind = i.policeAction ? 'Tiroteio com ação policial' : 'Tiroteio / disparos';
  return i.massacre ? `${kind} · chacina` : kind;
}

export function place(i: Incident) {
  return [i.neighborhood, i.city].filter(Boolean).join(', ') || i.address || 'Local não informado';
}

export function incidentMessage(i: Incident, near: { place: Place; distanceM: number } | null) {
  const lines: string[] = [];
  if (near) lines.push(`⚠️ <b>PERTO DE ${esc(near.place.name.toUpperCase())}</b> · ${fmtDist(near.distanceM)}`, '');
  lines.push(`${severity(i)} <b>${esc(title(i))}</b>`);
  lines.push(`📍 ${esc(place(i))}${i.locality ? ` · ${esc(i.locality)}` : ''}`);
  if (i.address && i.address !== place(i)) lines.push(`🏠 ${esc(i.address)}`);
  lines.push(`🕒 ${fmtWhen(i.date)}`);
  const victims = [i.dead && `☠️ ${i.dead} morto${i.dead > 1 ? 's' : ''}`, i.wounded && `🩸 ${i.wounded} ferido${i.wounded > 1 ? 's' : ''}`].filter(Boolean);
  if (victims.length) lines.push(victims.join(' · '));
  if (i.reason) lines.push(`Motivo: ${esc(i.reason)}${i.complementaryReasons.length ? ` (${esc(i.complementaryReasons.join(', '))})` : ''}`);
  if (i.policeUnit) lines.push(`👮 ${esc(i.policeUnit)}`);
  const [lng, lat] = i.coord;
  lines.push('', `<a href="https://www.google.com/maps?q=${lat},${lng}">Ver no mapa</a> · Fonte: Fogo Cruzado${i.number ? ` nº ${i.number}` : ''}`);
  return lines.join('\n');
}

/** One line per occurrence, for /ultimas. */
export function incidentLine(i: Incident, near: { place: Place; distanceM: number } | null) {
  const nearTxt = near ? ` · ⚠️ ${fmtDist(near.distanceM)} de ${esc(near.place.name)}` : '';
  return `${severity(i)} <b>${esc(place(i))}</b> — ${esc(title(i))}\n     ${fmtWhen(i.date)}${nearTxt}`;
}
