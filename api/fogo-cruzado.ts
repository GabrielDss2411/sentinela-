// Proxy for the Instituto Fogo Cruzado API (https://api.fogocruzado.org.br/docs).
// Credentials live only on the server: FOGOCRUZADO_EMAIL / FOGOCRUZADO_PASSWORD.
// Deployed as a Vercel Function; in development the Vite plugin in vite.config.ts
// serves it at the same path.
//
// GET /api/fogo-cruzado?hours=720  →  IncidentsResponse (up to 30 days)
import type { Incident, IncidentsError, IncidentsResponse, VictimBreakdown } from '../src/lib/incidentTypes.ts';

const API = 'https://api-service.fogocruzado.org.br/api/v2';
const STATE_NAME = 'Rio de Janeiro';
const PAGE_SIZE = 100;
const MAX_PAGES = 10;
const MAX_HOURS = 30 * 24;
/** Shared by everyone hitting this instance; the API is not hit more often than this. */
const CACHE_MS = 60_000;

type Token = { value: string; validUntil: number };
let token: Token | null = null;
let stateId: string | null = null;
const cache = new Map<number, { at: number; body: IncidentsResponse }>();

class HttpError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Also used by the Telegram bot (bot/main.ts). */
export function credentials() {
  const email = process.env.FOGOCRUZADO_EMAIL;
  const password = process.env.FOGOCRUZADO_PASSWORD;
  return email && password ? { email, password } : null;
}

async function login(creds: { email: string; password: string }): Promise<string> {
  if (token && Date.now() < token.validUntil) return token.value;
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(creds),
  });
  if (res.status === 401) throw new HttpError(502, 'Credenciais do Fogo Cruzado recusadas');
  if (!res.ok) throw new HttpError(502, `Login no Fogo Cruzado falhou (${res.status})`);
  const data = (await res.json()) as { data: { accessToken: string; expiresIn: number } };
  // Renew a minute early so a request never goes out with an expiring token.
  token = { value: data.data.accessToken, validUntil: Date.now() + (data.data.expiresIn - 60) * 1000 };
  return token.value;
}

async function api<T>(path: string, creds: { email: string; password: string }): Promise<{ body: T; headers: Headers }> {
  let res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${await login(creds)}` } });
  if (res.status === 401) {
    // Token revoked or clock skew: log in again once.
    token = null;
    res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${await login(creds)}` } });
  }
  if (res.status === 429) throw new HttpError(503, 'Fogo Cruzado limitou as requisições; tente em instantes');
  if (!res.ok) throw new HttpError(502, `Fogo Cruzado respondeu ${res.status} em ${path.split('?')[0]}`);
  return { body: (await res.json()) as T, headers: res.headers };
}

async function rjStateId(creds: { email: string; password: string }) {
  if (stateId) return stateId;
  const { body } = await api<{ data: { id: string; name: string }[] }>('/states', creds);
  const rj = body.data.find((s) => s.name.toLowerCase() === STATE_NAME.toLowerCase());
  if (!rj) throw new HttpError(502, 'Estado RJ não encontrado na API do Fogo Cruzado');
  stateId = rj.id;
  return stateId;
}

/** YYYY-MM-DD in Brasília time, the timezone the API filters by. */
function brtDate(ms: number) {
  return new Date(ms - 3 * 3600_000).toISOString().slice(0, 10);
}

/**
 * The API reports dates in Brasília time (UTC-3) since its timezone change, but the
 * string may still carry a "Z". Treat the wall-clock part as BRT either way.
 */
function parseBrt(date: string) {
  const wall = date.replace(/(\.\d+)?(Z|[+-]\d{2}:?\d{2})$/, '');
  return new Date(`${wall}-03:00`);
}

type RawVictim = {
  type?: string;
  situation?: string;
  personType?: string;
  ageGroup?: { name?: string } | null;
  genre?: { name?: string } | null;
};
type RawOccurrence = {
  id: string;
  documentNumber?: number | null;
  address?: string | null;
  city?: { name?: string } | null;
  neighborhood?: { name?: string } | null;
  locality?: { name?: string } | string | null;
  latitude?: string | number | null;
  longitude?: string | number | null;
  date: string;
  policeAction?: boolean;
  agentPresence?: boolean;
  contextInfo?: {
    mainReason?: { name?: string } | null;
    complementaryReasons?: { name?: string }[] | null;
    massacre?: boolean;
    policeUnit?: string | null;
  } | null;
  victims?: RawVictim[];
};

const emptyBreakdown = (): VictimBreakdown => ({
  civilians: { dead: 0, wounded: 0 },
  agents: { dead: 0, wounded: 0 },
  men: { dead: 0, wounded: 0 },
  women: { dead: 0, wounded: 0 },
  kids: { dead: 0, wounded: 0 },
  teenagers: { dead: 0, wounded: 0 },
  elderly: { dead: 0, wounded: 0 },
});

/** API values seen: situation Dead/Wounded, personType Civilian/Agent, ageGroup Adulto/Idoso/Adolescente/Criança. */
function countVictims(victims: RawVictim[] = []) {
  const by = emptyBreakdown();
  let dead = 0;
  let wounded = 0;
  for (const v of victims) {
    if (v.type && v.type !== 'People') continue;
    const k = v.situation === 'Dead' ? 'dead' : v.situation === 'Wounded' ? 'wounded' : null;
    if (!k) continue;
    if (k === 'dead') dead++;
    else wounded++;
    by[v.personType === 'Agent' ? 'agents' : 'civilians'][k]++;
    const genre = (v.genre?.name ?? '').toLowerCase();
    if (genre.startsWith('homem')) by.men[k]++;
    else if (genre.startsWith('mulher')) by.women[k]++;
    const age = (v.ageGroup?.name ?? '').toLowerCase();
    if (age.startsWith('crian')) by.kids[k]++;
    else if (age.startsWith('adolesc')) by.teenagers[k]++;
    else if (age.startsWith('idos')) by.elderly[k]++;
  }
  return { dead, wounded, victims: by };
}

const clean = (s: string | null | undefined) => (s && s.trim() && s.trim().toLowerCase() !== 'não identificado' ? s.trim() : null);

function toIncident(o: RawOccurrence): Incident | null {
  const lat = Number(o.latitude);
  const lng = Number(o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || lat === 0 || lng === 0) return null;
  const { dead, wounded, victims } = countVictims(o.victims);
  const ctx = o.contextInfo;
  return {
    id: o.id,
    date: parseBrt(o.date).toISOString(),
    coord: [lng, lat],
    address: o.address ?? null,
    neighborhood: o.neighborhood?.name ?? null,
    city: o.city?.name ?? null,
    policeAction: Boolean(o.policeAction),
    agentPresence: Boolean(o.agentPresence),
    dead,
    wounded,
    reason: ctx?.mainReason?.name ?? null,
    massacre: Boolean(ctx?.massacre),
    number: o.documentNumber ?? null,
    locality: clean(typeof o.locality === 'string' ? o.locality : o.locality?.name),
    policeUnit: clean(ctx?.policeUnit),
    complementaryReasons: (ctx?.complementaryReasons ?? []).map((r) => clean(r.name)).filter((r): r is string => r !== null),
    victims,
  };
}

export async function fetchIncidents(hours: number, creds: { email: string; password: string }): Promise<IncidentsResponse> {
  const now = Date.now();
  const since = now - hours * 3600_000;
  const id = await rjStateId(creds);
  const incidents: Incident[] = [];
  let sourceUpdatedAt: string | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const q = new URLSearchParams({
      idState: id,
      initialdate: brtDate(since),
      finaldate: brtDate(now),
      order: 'DESC',
      take: String(PAGE_SIZE),
      page: String(page),
    });
    const { body, headers } = await api<{ data: RawOccurrence[]; pageMeta?: { hasNextPage?: boolean } }>(`/occurrences?${q}`, creds);
    sourceUpdatedAt ??= headers.get('x-last-update-state') ?? headers.get('x-last-update');
    for (const o of body.data) {
      const inc = toIncident(o);
      if (inc && Date.parse(inc.date) >= since) incidents.push(inc);
    }
    if (!body.pageMeta?.hasNextPage) break;
  }

  incidents.sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  return { incidents, sourceUpdatedAt, fetchedAt: new Date(now).toISOString(), demo: false };
}

/** Synthetic sample for trying the UI before API access is approved. Never real data. */
function demoIncidents(): IncidentsResponse {
  const now = Date.now();
  const spots: [string, string, number, number, number, boolean][] = [
    ['Complexo do Alemão', 'Rio de Janeiro', -43.2722, -22.8613, 25, true],
    ['Maré', 'Rio de Janeiro', -43.2436, -22.8615, 70, true],
    ['Cidade de Deus', 'Rio de Janeiro', -43.3637, -22.9465, 150, false],
    ['Jacarezinho', 'Rio de Janeiro', -43.2585, -22.8885, 330, true],
    ['Salgueiro', 'São Gonçalo', -43.0207, -22.8065, 600, false],
  ];
  return {
    incidents: spots.map(([neighborhood, city, lng, lat, minAgo, police], i) => ({
      id: `demo-${i}`,
      date: new Date(now - minAgo * 60_000).toISOString(),
      coord: [lng, lat],
      address: null,
      neighborhood,
      city,
      policeAction: police,
      agentPresence: police,
      dead: i === 1 ? 1 : 0,
      wounded: i === 0 ? 2 : 0,
      reason: police ? 'Ação policial' : null,
      massacre: false,
      number: null,
      locality: null,
      policeUnit: police ? 'PM' : null,
      complementaryReasons: [],
      victims: {
        ...emptyBreakdown(),
        civilians: { dead: i === 1 ? 1 : 0, wounded: i === 0 ? 2 : 0 },
        men: { dead: i === 1 ? 1 : 0, wounded: i === 0 ? 2 : 0 },
      },
    })),
    sourceUpdatedAt: null,
    fetchedAt: new Date(now).toISOString(),
    demo: true,
  };
}

function json(body: IncidentsResponse | IncidentsError, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Let the CDN absorb bursts; clients poll every couple of minutes.
      'cache-control': status === 200 ? 'public, s-maxage=60, stale-while-revalidate=120' : 'no-store',
    },
  });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const hours = Math.min(MAX_HOURS, Math.max(1, Number(url.searchParams.get('hours')) || MAX_HOURS));

  const creds = credentials();
  if (!creds) {
    if (process.env.FOGOCRUZADO_DEMO === '1') return json(demoIncidents());
    return json({ error: 'Integração com o Fogo Cruzado não configurada', configured: false }, 503);
  }

  const hit = cache.get(hours);
  if (hit && Date.now() - hit.at < CACHE_MS) return json(hit.body);
  try {
    const body = await fetchIncidents(hours, creds);
    cache.set(hours, { at: Date.now(), body });
    return json(body);
  } catch (e) {
    // Serve the last good answer rather than blanking the map on a transient failure.
    if (hit) return json(hit.body);
    const status = e instanceof HttpError ? e.status : 502;
    return json({ error: e instanceof Error ? e.message : 'Falha ao consultar o Fogo Cruzado', configured: true }, status);
  }
}
