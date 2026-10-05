# CLAUDE.md

Guidance for Claude Code (and humans) working in this repo.

## What this is

React 19 + TypeScript + Vite port of the client prototype `reference/nehishlens-v8.html`,
wired against the NehishLens **mock** API described in `reference/NehishLensAPIWiringGuide.docx`.
It is an operations console for a bank ("lenses" = roles: `ops | eng | assure | exec`).

- Mock API docs: https://mock-api-nehishlens.aminobots.com/docs
- Endpoint browser: https://mock-api-nehishlens.aminobots.com/api-console

## Commands

```bash
npm install
npm run dev          # Vite dev server -> http://localhost:5173
npm run build        # tsc -b (typecheck) + vite build -> dist/
npm run preview      # serve the production build
npm run lint         # oxlint
npm run check-api    # node scripts/check-api.mjs — smoke-tests the live mock (creates + resets an incident)
npm run check-endpoints  # READ-ONLY sweep: every GET the app calls + Cortex with predefined questions. Writes nothing; safe any time.
```

`npm run check-endpoints` prints one line per endpoint (`ok`/`warn`/`FAIL`, status, latency),
then asks Cortex the app's own suggestion-chip questions plus two deliberate misses and
reports `grounded / partial / refused / error` counts. Use it to answer "how many APIs are up
right now" and "is Cortex actually working". Exit 0 = all good.

There is no unit-test runner configured. "Testing" = `npm run build` (typecheck),
`npm run lint`, `npm run check-api`, and driving the app in a browser.

`npm run check-api` writes to the shared live mock store (POST /actions, POST /incidents)
and then POST /_reset. Do not run it against a deployed host during a demo.

## Architecture — the request path

Every wired screen fragment follows the same chain (see `docs/CODE_WALKTHROUGH.md` for the
full trace):

```
screen  →  useHydrated(key, fetcher)           src/hooks/useHydrated.ts   (or useQuery/useMutation directly)
        →  <Domain>Api.<call>()                 src/api/endpoints.ts      (one fn per endpoint)
        →  api.get/list/page/post/patch()       src/api/client.ts         (the ONLY fetch() in the app)
        →  reads apiConfig                      src/api/config.ts         (the ONLY reader of import.meta.env)
```

- **This build is live-data-only.** Screens render what the API returns; on error they show
  the server's own message (`ApiErrorBanner` / `QueryState` in `src/components/ui.tsx`),
  never bundled placeholder values. `src/fixtures/` was removed and
  `VITE_ALLOW_FIXTURE_FALLBACK` defaults to `false`. `useHydrated` still accepts an optional
  fixture arg for future use, but no screen passes one.
- **`QueryState` / `TableRowsState`** (`src/components/ui.tsx`) are the standard fragment
  wrappers: skeleton while loading, `ApiErrorBanner` on error, children once data is present.
  `TableRowsState` is the `<tbody>`-safe variant (its fallback is a `<tr>`).
- **`api.list<T>()` / `api.page<T>()`** (`src/api/client.ts`) unwrap the mock's
  `{ items, total, cursor }` list envelope to `T[]`. Every list endpoint returns that shape —
  call these, not `api.get`.
- **`fetchAllSettled`** (`src/api/client.ts`) — use instead of `Promise.all` whenever fanning
  out one request per list item, so a single 403 doesn't take the whole screen down. Worked
  example: `src/screens/Sources.tsx`.
- **Lens** travels as the `X-Lens` header on every request, set from `LensContext`
  (`src/context/LensContext.tsx`) via the switcher in `Topbar.tsx`, and kept in sync with the
  signed-in user by `LensSync` in `App.tsx`. `LensContext` also stamps `data-lens` on `<html>`
  to activate the accent rules in `legacy.css`. Never hide a control based on lens — render
  whatever the server returns, including a 403.
- **Auth** is a mock gate (`src/context/AuthContext.tsx`, `src/screens/Login.tsx`): username +
  lens, persisted to `localStorage`. No real credential check — the API has no auth. `App.tsx`
  renders `<Login>` until a user exists, then the shell; sign-out clears storage.
- **Role-based menu** (`src/nav.ts` + `src/hooks/useAccess.ts`): the rail shows only the items
  the active lens may see; `RouteGuard` in `App.tsx` redirects a disallowed deep link to the
  lens landing; `view` access makes screens drop write controls (`useAccess().readOnly`).
  Rules: ops/eng/assure get Cortex + Settings; **exec sees only Today and Corpus** (Corpus
  read-only); DB Console is eng-only. Full matrix: `docs/SCREENS.md` → "Menu visibility per
  lens". The rail shows the active lens name under the logo.
- **Theme** (`src/context/ThemeContext.tsx`): light default, dark opt-in via
  `html[data-theme="dark"]` whose rules live in `src/styles/theme-dark.css` (ported verbatim
  from the v7 prototype). Toggle in the top bar; persisted to `localStorage`.
- **Routing** is `HashRouter` (`src/App.tsx`) — URLs look like `#/incidents/INC-2261`. This
  matches the prototype's scheme and needs no server config.

## Layout of `src/`

| Path | Purpose |
|---|---|
| `api/config.ts` | all env config, read once; nothing else touches `import.meta.env` |
| `api/client.ts` | fetch wrapper: `X-Lens` header, `ApiError`, connection state, `api.list`/`api.page` envelope unwrap, `fetchAllSettled` |
| `api/endpoints.ts` | one typed function per mock endpoint, grouped to match the wiring guide; response types tightened against the live mock |
| `hooks/useHydrated.ts` | thin `useQuery` wrapper (`data`/`isLoading`/`error`); fixture arg optional and unused |
| `hooks/useConnection.ts` | one-time `/health` probe before first paint |
| `context/AuthContext.tsx` | mock sign-in (name + lens), `localStorage`, `LENS_LANDING` map |
| `context/ThemeContext.tsx` | light/dark, `html[data-theme]`, `localStorage` |
| `context/LensContext.tsx` | active lens → `X-Lens` header + `html[data-lens]` |
| `screens/*.tsx` | one file per screen/route (see `docs/SCREENS.md`) |
| `components/Rail.tsx` `Topbar.tsx` `ScreenHeader.tsx` | the prototype shell |
| `components/ui.tsx` | shared building blocks: `QueryState`, `TableRowsState`, `Conf`, `Sev`, `Cite`, `PanelHead`, `Trace`, `Skeleton`, `EmptyState` |
| `components/ApiErrorBanner.tsx` `ConnectionBanner.tsx` | API-layer status UI |
| `assets/nehish-logo.png` | NEHISH mark (decoded from the prototype), used by `Login` + `Rail` |
| `styles/legacy.css` | design system extracted verbatim from the prototype — use its CSS custom properties (`--surface`, `--line`, `--lens`, …); do not invent colors |
| `styles/theme-dark.css` | dark-theme overrides, ported verbatim from `reference/nehishlens-v7-light-dark-toggle.html` |
| `index.css` | the few styles not in the prototype (API banners, account menu, login, timeline helpers) |

## Environment

Config lives in `.env.development` (used by `npm run dev`) / `.env.production` (used by
`npm run build`); `.env.example` is the annotated reference. Personal overrides go in
`.env.*.local` (gitignored). Key vars: `VITE_API_BASE_URL`, `VITE_API_ROOT`,
`VITE_DEFAULT_LENS`, `VITE_FORCE_MOCK_STATE` (drive one of the nine mock states across the
whole app — useful for checking empty/error/denied branches), `VITE_ALLOW_FIXTURE_FALLBACK`
(now `false`), `VITE_DEBUG_API_LOGGING`, `VITE_API_LOG`. Full table: `docs/ENVIRONMENT.md`.
Never hard-code an API URL anywhere but `.env*` and `src/api/config.ts`.

**Request/response capture** — `VITE_API_LOG=true` (dev only) mirrors every API call
(method, path, lens, status, duration, bodies) to `logs/api/` as NDJSON + one pretty file
each. The writer is a `apply: 'serve'` Vite plugin in `vite.config.ts`, so it is never in
`vite build` output; `src/api/apiLog.ts` is guarded by `import.meta.env.DEV` and compiled
out of a production bundle. Client deploys are unaffected regardless of env. Full rationale,
data flow, schema, and troubleshooting: `docs/API_LOGGING.md` (short version in
`docs/ENVIRONMENT.md` → "Request/response capture", folder note in `logs/README.md`).

## Conventions

- Keep `src/api/endpoints.ts` grouped and ordered like the wiring guide so the two read
  side-by-side.
- Field names in endpoint types stay identical to the API's; shape adaptation happens in the
  hook layer, not in `endpoints.ts`.
- When wiring a new fragment, update `docs/API_WIRING.md` and `docs/SCREENS.md` in the same change.
- Match the surrounding code's style; new UI reuses `legacy.css` classes and custom properties.
- Static editorial copy carried over from the prototype (section headings, `.trace` provenance
  strips, the "Preview only" label on Executive) is chrome, not data — keep it. Anything that
  is a *value* (counts, names, timestamps, statuses) must come from the API.

## Current state

All screens are built to the prototype layout and wired to the live mock. `npm run build`,
`npm run lint` and `npm run check-api` (15/15) pass; a headless pass over all 13 routes renders
clean, and the incident propose → approve → receipt → capture flow works end to end.

**Endpoint coverage:** every operation in `openapi.json` has a typed function in
`src/api/endpoints.ts` and is called from a screen, except `GET /runbooks/{id}` (mock returns
`not_found` on the seed; `/recall` already returns the same steps) and `GET /citations/{id}`
(the list carries full rows). See `docs/SCREENS.md` → "Endpoint coverage".

**Cortex** (`/cortex`, a rail item — not the prototype's side panel) is wired to
`/cortex/context` + `POST /cortex/ask` and works — but the mock only holds grounded material
for a few incident-context questions and **refuses** the rest by design ("a refusal is data").
The screen defaults to the `incident-detail` / `INC-2261` context and its suggestion chips
one-click a grounded question, so it doesn't look broken. Rail icon is a chat bubble. Visible
to ops/eng/assure only.

Two screens have **no endpoint on the mock** and say so on-screen rather than showing invented
data:
- **DB Console** (`/db-console`) — no `/db/*` surface exists.
- **Evidence-pack generation** (`/audit/packs/new`) — `/audit/packs/*` is 404. The builder's
  *check* step is live (`/audit/verify`); scope/export controls are inert and labelled.

Everything else (Today, Executive, Incidents + detail, EOD, Audit, Corpus + resolution detail,
Sources, Settings, Cortex) is fully API-driven. Per-screen endpoint map: `docs/SCREENS.md`.

## Reference material

`reference/` holds the client's originals: the wiring guide `.docx`, `nehishlens-v8.html` (the
prototype this is ported from), and `nehishlens-v7-light-dark-toggle.html` (the theme-toggle
revision `styles/theme-dark.css` is ported from). `docs/` holds the implementation-side docs —
start with `docs/CODE_WALKTHROUGH.md`; `docs/SCREENS.md` is the per-screen route/endpoint map.
