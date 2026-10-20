// Standalone HTTP server for the functions in api/, for hosts without Vercel (the VPS).
// The Android app calls it from its own origin, so it answers with CORS headers for
// the origins listed in API_ALLOWED_ORIGINS.
//
// Run: node server/api-server.ts   (Node 24 runs TypeScript directly)
import http from 'node:http';
import { GET as fogoCruzado } from '../api/fogo-cruzado.ts';

const PORT = Number(process.env.PORT) || 8787;
// Capacitor serves the Android app from https://localhost.
const ALLOWED = new Set(
  (process.env.API_ALLOWED_ORIGINS ?? 'https://localhost')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const routes: Record<string, (r: Request) => Promise<Response>> = {
  '/api/fogo-cruzado': fogoCruzado,
};

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

function corsHeaders(origin: string | undefined): Record<string, string> {
  if (!origin || !ALLOWED.has(origin)) return {};
  return { 'access-control-allow-origin': origin, 'access-control-allow-methods': 'GET, OPTIONS', vary: 'Origin', 'access-control-max-age': '86400' };
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const cors = corsHeaders(req.headers.origin);

  if (url.pathname === '/health') {
    res.writeHead(200, { 'content-type': 'text/plain' }).end('ok');
    return;
  }
  if (req.method === 'OPTIONS') {
    res.writeHead(204, cors).end();
    return;
  }
  const handler = routes[url.pathname];
  if (!handler || req.method !== 'GET') {
    res.writeHead(404, { 'content-type': 'application/json', ...cors }).end('{"error":"not found"}');
    return;
  }
  try {
    const response = await handler(new Request(url));
    const headers: Record<string, string> = { ...cors };
    response.headers.forEach((v, k) => (headers[k] = v));
    res.writeHead(response.status, headers).end(Buffer.from(await response.arrayBuffer()));
  } catch (e) {
    log('erro em', url.pathname, e);
    res.writeHead(500, { 'content-type': 'application/json', ...cors }).end('{"error":"internal"}');
  }
});

server.listen(PORT, () => log(`API ouvindo na porta ${PORT} · origens permitidas: ${[...ALLOWED].join(', ')}`));
for (const sig of ['SIGTERM', 'SIGINT'] as const) process.on(sig, () => server.close(() => process.exit(0)));
