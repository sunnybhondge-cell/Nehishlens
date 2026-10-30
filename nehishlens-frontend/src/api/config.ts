/**
 * Every environment-driven value the API layer needs, read once here.
 * No other file should touch `import.meta.env` directly — this keeps the
 * "where do I change the API URL" question to a single answer: your .env
 * file (see .env.example), not the source code.
 */

export type Lens = 'ops' | 'eng' | 'assure' | 'exec';

function readBool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return value.toLowerCase() === 'true';
}

function readInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const apiConfig = {
  /** Base for all /api/v1/* calls. Everything in src/api/endpoints.ts is relative to this. */
  baseUrl: (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '')
    ?? 'https://mock-api-nehishlens.aminobots.com/api/v1',

  /** Root for the unversioned routes: /health, /docs, /api-console, /collection.json. */
  root: (import.meta.env.VITE_API_ROOT as string | undefined)?.replace(/\/+$/, '')
    ?? 'https://mock-api-nehishlens.aminobots.com',

  defaultLens: ((import.meta.env.VITE_DEFAULT_LENS as string | undefined) ?? 'ops') as Lens,

  timeoutMs: readInt(import.meta.env.VITE_API_TIMEOUT_MS as string | undefined, 10000),

  /** Injected as X-Mock-State on every GET when set — see "Driving the nine states". */
  forceMockState: (import.meta.env.VITE_FORCE_MOCK_STATE as string | undefined) || undefined,

  allowFixtureFallback: readBool(import.meta.env.VITE_ALLOW_FIXTURE_FALLBACK as string | undefined, true),

  debugLogging: readBool(import.meta.env.VITE_DEBUG_API_LOGGING as string | undefined, false),

  /**
   * Dev-only: mirror every request+response (with timing) to logs/api/ via the
   * Vite dev middleware. Defaults false — must stay false for any client /
   * production deploy. See src/api/apiLog.ts.
   */
  apiLog: readBool(import.meta.env.VITE_API_LOG as string | undefined, false),

  /**
   * Development affordances that must not ship: the mock's seeded sign-in
   * accounts and the Observe-incident form. On under `npm run dev`, off in
   * builds unless VITE_DEV_TOOLS=true.
   */
  devTools: readBool(import.meta.env.VITE_DEV_TOOLS as string | undefined, import.meta.env.DEV),
};

if (apiConfig.debugLogging) {
  // eslint-disable-next-line no-console
  console.info('[nehishlens] API config', apiConfig);
}
