/**
 * Dev-only API request/response capture.
 *
 * When `VITE_API_LOG` is true, every call made through `src/api/client.ts` is
 * mirrored — method, path, lens, status, duration, request body, response body
 * — to the Vite dev server, which writes it under `logs/api/` (see the
 * `apiLogPlugin` in `vite.config.ts`).
 *
 * Why this is safe for a client / production deployment:
 *   1. `apiConfig.apiLog` defaults to false. Unless VITE_API_LOG is explicitly
 *      set truthy at build time, `recordApiCall` returns on its first line and
 *      the whole branch is dead code the bundler drops.
 *   2. The receiving `/__apilog` endpoint only exists on the Vite dev server.
 *      A production build has no such route, so even a stray beacon just 404s
 *      and is swallowed here.
 *   3. Sending is fire-and-forget (`sendBeacon`) — it never blocks a request,
 *      never throws into the app, and never changes what a screen renders.
 */
import { apiConfig } from './config';

export interface ApiLogRecord {
  ts: string;
  method: string;
  path: string;
  url: string;
  lens: string;
  status: number;
  ok: boolean;
  durationMs: number;
  requestBody: unknown;
  responseBody: unknown;
  error?: string;
}

/** Credential fields never written to disk — /auth/* bodies carry them. */
const SECRET_KEYS = new Set(['password', 'accessToken', 'refreshToken']);

export function recordApiCall(rec: ApiLogRecord): void {
  // `import.meta.env.DEV` is statically replaced with `false` by `vite build`,
  // so in a production bundle this returns immediately and the minifier drops
  // everything below — the `/__apilog` beacon never ships to a client at all.
  if (!import.meta.env.DEV || !apiConfig.apiLog) return;
  try {
    const payload = JSON.stringify(rec, (key, value) => (SECRET_KEYS.has(key) ? '[redacted]' : value));
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/__apilog', new Blob([payload], { type: 'application/json' }));
    } else if (typeof fetch === 'function') {
      void fetch('/__apilog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload,
        keepalive: true,
      }).catch(() => {});
    }
  } catch {
    /* logging must never break the app */
  }
}
