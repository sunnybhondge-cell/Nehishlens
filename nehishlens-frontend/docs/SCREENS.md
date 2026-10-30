# Screens — route, endpoints, prototype mapping

Every screen is built to the layout of `reference/nehishlens-v8.html` using the
`src/styles/legacy.css` design system, and driven only by live mock data. Static
editorial copy from the prototype (headings, `.trace` strips, the "Preview only"
label) is kept as chrome; every value shown is fetched.

| Route | Screen file | Prototype section | Endpoints |
|---|---|---|---|
| `/login` | `Login.tsx` | (SSO note in prototype header) | `POST /auth/login` (username + password; lens comes back from the server — no picker). Dev builds list the seeded mock users |
| `/today` | `Today.tsx` | `#s-today` (exec lens: renders `Executive.tsx`, as v12 does) | `GET /metrics/summary`, `GET /priorities`, `GET /briefing`, `GET /cortex/context?screen=today`, `GET /derivations/hours-saved` via `?derive=hours-saved&state=` |
| `/executive` | `Executive.tsx` | `#s-executive` | `GET /metrics/summary`, `GET /corpus/metrics`, `GET /audit/verify`, `GET /derivations/hours-saved` (re-projection — no dedicated endpoint) |
| `/incidents` | `Incidents.tsx` | `#s-incidents` | `GET /incidents` (stage filter + counts computed client-side); `POST /incidents` via the "Observe incident" form — **dev builds only** (`VITE_DEV_TOOLS`; Open Queries C2) |
| `/incidents/:id` | `IncidentDetail.tsx` | `#s-incident-detail` | `GET /incidents/{id}`, `GET /incidents/{id}/recall`, `GET /policy/approvers?lens=&incidentId=`, `POST /actions`, `POST /actions/{id}/approve`, `PATCH /incidents/{id}/loop`, `POST /incidents/{id}/recall/reject`, `POST /resolutions` (capture-to-corpus panel), `GET /signatures/{id}` + `/occurrences` (problem fingerprint sheet, from the incident's `signatureId`) |
| `/eod`, `/eod/:runId` | `Eod.tsx` | `#s-eod` | `GET /runs/{id}` (default `2026-07-28`), `GET /feeds/health` |
| `/audit`, `/audit/:hash` | `Audit.tsx` | `#s-audit` | `GET /audit?limit=&q=&actor=&kind=&from=&to=&cursor=` (filters live in the query string), `GET /audit/verify`, `GET /audit/{hash}` (entry panel; `:hash` may be a prefix, so the URL can be shared) |
| `/audit/packs/new` | `PackBuilder.tsx` | `#s-pack-builder` | `GET /packs` (also the access check — `403 not_granted` without `pack:create`), `POST /packs/preview`, `POST /packs`, `GET /packs/{id}` (polled while `building`), `GET /audit/verify`, `GET /audit?q={packId}` |
| `/corpus` | `Corpus.tsx` | `#s-corpus` | `GET /corpus/metrics` (header subtitle + tiles), `GET /resolutions`, `GET /sources` (ingestion coverage). Resolutions / Sources tabs via `CorpusTabs` (shared with Sources) |
| `/corpus/:id` | `ResolutionDetail.tsx` | `#s-resolution-detail` | `GET /resolutions/{id}`, `GET /signatures/{id}` + `/occurrences` (only if the resolution carries a `signatureId` — the mock's do not today), `POST /resolutions/{id}/reuse` |
| `/sources`, `/sources/:id` (v12 deep links `/corpus/sources[/:id]` redirect here, query kept) | `Sources.tsx` | `#s-corpus-sources`, `#s-source-detail` | titled "Corpus" with the shared Resolutions / Sources tabs (Sources active); searchable `GET /sources?q=`, dedicated `GET /sources/{id}` detail, list fan-out with `fetchAllSettled` (per-lens `403 not_granted` kept + flagged), `GET /citations` (also prefetched once at boot by `Shell`; `<Cite>` chips resolve label-only citations against it via `useCitationIndex`) |
| `/db-console` | `DbConsole.tsx` | `#s-db` | `GET /db/schema?q=`, `GET /db/objects/{name}`, `POST /db/query`, `POST /db/investigations` |
| `/settings` | `Settings.tsx` | `#s-settings` | `GET /config/thresholds` (renders exactly the 3 it exposes); dev-only Mock-controls panel → `GET /_states`, `POST /_reset` |
| `/cortex` | `Cortex.tsx` | right-hand `.cop` panel, promoted to its own screen | `GET /cortex/context?screen=&lens=&objectId=`, `POST /cortex/ask` |

## Landing per lens

`src/context/AuthContext.tsx` → `LENS_LANDING`, mirroring `ROLES[lens].landing` in the prototype:

| Lens | Lands on |
|---|---|
| ops | `/today` |
| eng | `/incidents` |
| assure | `/audit` |
| exec | `/today` (renders the Executive preview) |

## Menu visibility per lens

`src/nav.ts` (`ACCESS`). `full`/`view` = shown in the rail; `none` = hidden **and**
route-guarded (a deep link redirects to the lens landing via `RouteGuard` in `App.tsx`).
`view` also makes screens drop write controls (`useAccess` → `readOnly`). `/executive` is a
preview reachable by link and not gated.

| Item | ops | eng | assure | exec |
|---|---|---|---|---|
| Today | full | full | full | full (Executive preview) |
| Incidents | full | full | view | **none** |
| EOD & Batch | full | full | view | **none** |
| Audit & Evidence | view | view | full | **none** |
| Corpus | full | full | view | **view** |
| Sources | full | full | view | **none** |
| DB Console | **none** | full | **none** | **none** |
| Cortex | full | full | full | **none** |
| Settings | view | view | view | **none** |

Rail size (v12 hard rule, ≤ 7): ops 6, eng 7, assure 6, exec 2. `/executive` is a route, not a rail item.

Net:
- **ops** — everything except DB Console.
- **eng** — everything.
- **assure** — everything except DB Console.
- **exec** — **only Today and Corpus** (Corpus read-only; the "Record a reuse" button on a
  resolution is replaced with "Read-only for this lens"). No Sources, no Cortex, no Settings.

## Not wired, and why

| Piece | Reason |
|---|---|
| Evidence-pack **download** | `downloadUrl` returns 404 on the mock; the button shows the server's error. |
| Today 30-day trend sparkline | No time-series endpoint; a fabricated series would violate the live-data-only rule. |
| Executive as a first-class lens | Prototype marks it Phase-2 preview-only; built as a re-projection of existing endpoints with the "Preview only" label kept. |

When any of these gets an endpoint, wire it with the same `useHydrated` / `QueryState`
pattern as the rest and move the row out of this table.

## Endpoint coverage

Every operation in the mock's OpenAPI spec has a typed function in
`src/api/endpoints.ts` and is called from a screen, **except**:

- `GET /auth/me` — the login response already carries the user. Kept defined.

- `GET /runbooks/{id}` — returns `not_found` for the seed's resolution ids, and
  `/incidents/{id}/recall` already returns the same `steps`. Kept defined, not surfaced.
- `GET /citations/{id}` — the `/citations` list already carries full rows; the
  single-id fetch isn't needed. Kept defined.
