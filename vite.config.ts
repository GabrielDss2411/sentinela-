import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Serves the Vercel Functions in api/ during `npm run dev`, so the app talks to
 * /api/* the same way locally and in production. Server-only env vars come from
 * .env.local (no VITE_ prefix, so they never reach the browser bundle).
 */
function devApi(env: Record<string, string>): Plugin {
  return {
    name: 'sentinela-dev-api',
    apply: 'serve',
    configureServer(server) {
      Object.assign(process.env, env)
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split('?')[0]
        if (path !== '/api/fogo-cruzado' || req.method !== 'GET') return next()
        try {
          const mod = (await server.ssrLoadModule('/api/fogo-cruzado.ts')) as { GET: (r: Request) => Promise<Response> }
          const response = await mod.GET(new Request(`http://localhost${req.url}`))
          res.statusCode = response.status
          response.headers.forEach((v, k) => res.setHeader(k, v))
          res.end(await response.text())
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => ({
  plugins: [react(), devApi(loadEnv(mode, process.cwd(), 'FOGOCRUZADO_'))],
  // MapLibre's worker is an ES module.
  worker: { format: 'es' },
}))
