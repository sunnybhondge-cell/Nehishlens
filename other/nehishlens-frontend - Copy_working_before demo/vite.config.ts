import { mkdirSync, appendFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

/**
 * Dev-only API request/response logger.
 *
 * Receives records posted by `src/api/apiLog.ts` to `/__apilog` and writes them
 * under `logs/api/`:
 *   - `session-<timestamp>.ndjson` — one JSON line per call (tail / grep this)
 *   - `<timestamp>__<METHOD>__<path>.json` — one pretty file per call
 *
 * Enabled only when `VITE_API_LOG` is truthy (1 | true | yes). `apply: 'serve'`
 * means this plugin is attached to the dev server ONLY — it is never part of a
 * `vite build`, so a client / production deployment has neither this endpoint
 * nor any file I/O regardless of environment.
 */
function apiLogPlugin(flag: string | undefined): Plugin {
  const enabled = /^(1|true|yes)$/i.test((flag ?? '').trim())
  return {
    name: 'nehishlens-api-log',
    apply: 'serve',
    configureServer(server) {
      if (!enabled) return
      const dir = resolve(process.cwd(), 'logs/api')
      mkdirSync(dir, { recursive: true })
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const ndjson = resolve(dir, `session-${stamp}.ndjson`)
      server.config.logger.info(`  \x1b[36m➜\x1b[0m  API log:  logs/api/session-${stamp}.ndjson`)

      server.middlewares.use('/__apilog', (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          return res.end()
        }
        let raw = ''
        req.on('data', (c) => {
          raw += c
          if (raw.length > 5_000_000) req.destroy() // guard against a runaway body
        })
        req.on('end', () => {
          try {
            const rec = JSON.parse(raw)
            appendFileSync(ndjson, JSON.stringify(rec) + '\n')
            const t = String(rec.ts ?? new Date().toISOString()).replace(/[:.]/g, '-')
            const slug =
              String(rec.path ?? 'root')
                .replace(/[^\w.-]+/g, '_')
                .replace(/^_+|_+$/g, '')
                .slice(0, 80) || 'root'
            writeFileSync(
              resolve(dir, `${t}__${rec.method ?? 'GET'}__${slug}.json`),
              JSON.stringify(rec, null, 2),
            )
          } catch {
            /* ignore an unparseable record */
          }
          res.statusCode = 204
          res.end()
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), apiLogPlugin(process.env.VITE_API_LOG ?? env.VITE_API_LOG)],
  }
})
