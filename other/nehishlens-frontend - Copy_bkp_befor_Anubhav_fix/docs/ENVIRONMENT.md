# Environment configuration

This app never hard-codes an API URL. All of it is read once, in
`src/api/config.ts`, from Vite env files. Change the API the app talks to
by editing a `.env` file — no source changes, no rebuild-from-scratch.

## The files

| File | When Vite loads it | Committed? |
|---|---|---|
| `.env.example` | never (reference only) | yes |
| `.env.development` | `npm run dev` | yes — team default, points at the shared mock |
| `.env.production` | `npm run build` | yes — team default |
| `.env.local`, `.env.development.local`, `.env.production.local` | on top of the above, always wins | **no** — gitignored, for personal overrides |

To point your own machine at a different API without touching the tracked
files, copy `.env.example` to `.env.development.local` and edit that — it's
gitignored and always takes precedence.

## Variables

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `VITE_API_BASE_URL` | yes | `https://mock-api-nehishlens.aminobots.com/api/v1` | Base for every `/api/v1/*` call — see `src/api/endpoints.ts`. |
| `VITE_API_ROOT` | yes | `https://mock-api-nehishlens.aminobots.com` | Base for the unversioned routes: `/health`, `/docs`, `/api-console`, `/collection.json`. |
| `VITE_DEFAULT_LENS` | no | `ops` | Initial `X-Lens` header (`ops \| eng \| assure \| exec`) until switched in the top bar. |
| `VITE_API_TIMEOUT_MS` | no | `10000` | Abort a request and treat it as failed after this many ms. |
| `VITE_FORCE_MOCK_STATE` | no | *(empty)* | Forces every GET to carry `X-Mock-State: <value>` — see "Driving the nine states" below. |
| `VITE_ALLOW_FIXTURE_FALLBACK` | no | `false` | Legacy flag. This build ships no fixtures (`src/fixtures/` was removed) and is live-data-only, so a failed call always surfaces the server's error via `QueryState` regardless of this value. |
| `VITE_DEBUG_API_LOGGING` | no | `false` | Logs method/path/status/duration/lens for every call to the browser console. |
| `VITE_API_LOG` | no | `false` | **Dev-only.** When truthy (`1 \| true \| yes`), every request+response (method, path, lens, status, duration, request body, response body) is written to `logs/api/` by the Vite dev middleware. No effect on `vite build` — see "Request/response capture" below. Keep `false` for any client deployment. |

## Pointing at a different environment

**Local mock instance** (per the wiring guide, `check-api.sh http://localhost:8099`):

```bash
# .env.development.local
VITE_API_BASE_URL=http://localhost:8099/api/v1
VITE_API_ROOT=http://localhost:8099
```

**A staging or production deployment of the real (non-mock) backend**, once
it exists: same two variables, pointed at that host, in `.env.production`
or `.env.production.local`. Nothing else in the app changes — that's the
point of the config being centralized in one file.

## Driving the nine mock states

The mock service can be told to answer any `GET` a specific way, via
`?_state=` or `X-Mock-State`, without waiting on real data:

`loading` · `empty` · `partial` · `error` · `denied` · `zero` · `stale` ·
`confirmed` · `default`

Two ways to use this from the app:

1. **Per-request**, in code: `TodayApi.derivation('hours-saved', 'error')` — every typed function in `src/api/endpoints.ts` accepts an optional trailing `mockState`/`?_state=` argument for exactly this.
2. **Globally**, for a demo or a manual QA pass: set `VITE_FORCE_MOCK_STATE=error` in `.env.development.local` and restart `npm run dev`. Every GET in the app will carry that header until you unset it.

The old prototype's state URLs (e.g. `#/today?derive=hours-saved&state=error`)
still work against the live API unchanged — see the wiring guide.

## Debug logging

Set `VITE_DEBUG_API_LOGGING=true` (already on by default in
`.env.development`) and watch the VS Code integrated terminal or browser
console while using the app:

```
[api] GET /metrics/summary -> 200 (142ms) lens=ops
[api] GET /priorities -> 403 (98ms) lens=ops
```

## Request/response capture (`logs/api/`)

For a full timing/debug trace that outlives the console, set `VITE_API_LOG=true`
in `.env.development.local` and restart `npm run dev`. Every call is then mirrored
to `logs/api/`:

| File | Contents |
|---|---|
| `session-<timestamp>.ndjson` | one JSON object per line, one line per call — `tail -f` / `grep` this |
| `<timestamp>__<METHOD>__<path>.json` | the same record pretty-printed, one file per call |

Each record: `ts, method, path, url, lens, status, ok, durationMs, requestBody,
responseBody, error`.

Full reference — file-by-file rationale, data flow, schema, safety argument,
troubleshooting: **[API_LOGGING.md](API_LOGGING.md)**.

**This is dev-tooling, not part of the app.** The writer is a Vite plugin in
`vite.config.ts` marked `apply: 'serve'`, so it is attached to the dev server
only and never enters `vite build` output. The client-side sender
(`src/api/apiLog.ts`) short-circuits on its first line when the flag is off, and
the bundler drops the dead branch. A client / production deployment therefore has
no `/__apilog` endpoint, no file writes, and no behavioural change — regardless
of what the env says. `logs/` is git-ignored (except `logs/README.md`).

To clear captures: `rm logs/api/*` or delete the folder.
