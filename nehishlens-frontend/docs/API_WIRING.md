# API wiring status

Mirrors the structure of `NehishLensAPIWiringGuide.docx` so the two read side by
side. "Live" = the screen calls the real endpoint and renders what it returns.
This build is **live-data-only**: `src/fixtures/` is gone,
`VITE_ALLOW_FIXTURE_FALLBACK` defaults to `false`, and a failed call shows the
server's own message (`QueryState` → `ApiErrorBanner`), never placeholder data.

| Screen | Reads live | Not wired |
|---|---|---|
| Today | KPI tiles, priorities (CR-01 loop indicator; `stage: null` = not a loop item), briefing (incl. its `text: null` + `note` empty state), Cortex context, CR-10 `baseline` chip → `/derivations/hours-saved` panel (`?derive=hours-saved&state=`) (`src/screens/Today.tsx`). Exec lens renders the Executive preview here | 30-day sparkline — no time-series endpoint |
| Executive | Composed from `/metrics/summary`, `/corpus/metrics`, `/audit/verify`, `/derivations/hours-saved` (`src/screens/Executive.tsx`) | — (no dedicated endpoint; re-projection is the design) |
| Incidents (list) | `/incidents`, stage filter + counts; `POST /incidents` (Observe form) (`src/screens/Incidents.tsx`) | — |
| Incident detail | `/incidents/{id}`, `/incidents/{id}/recall`, `/policy/approvers`, `POST /actions`, applied/failed `POST /actions/{id}/approve`, `PATCH /incidents/{id}/loop`, `POST /incidents/{id}/recall/reject`, `POST /resolutions` (capture panel), `/signatures/{id}` + `/occurrences` (fingerprint sheet via `SignatureSheet.tsx`) (`src/screens/IncidentDetail.tsx`) | `/runbooks/{id}` (mock returns `not_found` for the resolution ids in the seed) |
| EOD & Batch | `/runs/{id}` timeline + stage focus, `/feeds/health` (`src/screens/Eod.tsx`) | — |
| Audit | `/audit?limit=50`, `/audit/verify`, `/audit/{hash}` (row expand) (`src/screens/Audit.tsx`) | — |
| Evidence-pack builder | `/audit/verify` (check step) (`src/screens/PackBuilder.tsx`) | **Pack generation** — `/audit/packs/*` is 404; scope/export controls inert and labelled |
| Corpus | `/corpus/metrics`, `/resolutions`, `/sources` (ingestion coverage) (`src/screens/Corpus.tsx`) | — |
| Resolution detail | `/resolutions/{id}`, `/signatures/{id}` + `/occurrences` via `SignatureSheet.tsx` (only when the resolution has a `signatureId`; mock resolutions do not), `POST /resolutions/{id}/reuse` (`src/screens/ResolutionDetail.tsx`) | — (capture now lives on Incident detail) |
| Sources | v12 catalogue table (`?q=`, `?state=` forwarded as `X-Mock-State`), searchable `/sources?q=`, per-source `/sources/{id}` detail route, list fan-out via `fetchAllSettled`, `/citations` index (`src/screens/Sources.tsx`; also prefetched at boot by `Shell` via `useCitationIndex` so `<Cite>` chips resolve by label locally) | `/citations/{id}` — list carries full rows, not needed |
| Settings | `/config/thresholds` — renders exactly the 3 it exposes; dev-only `/_states` + `POST /_reset` panel (`src/screens/Settings.tsx`) | PATCH not implemented on the mock — screen is read-only by design |
| DB Console | — | **Entire screen** — mock exposes no `/db/*` endpoint; screen states this |
| Cortex | `/cortex/context`, `POST /cortex/ask` (`src/screens/Cortex.tsx`) | — |

## The list envelope

Every collection endpoint returns `{ items, total, cursor }`. `src/api/client.ts`
adds `api.list<T>()` (→ `T[]`) and `api.page<T>()` (→ `{ items, total, cursor }`);
`src/api/endpoints.ts` routes every list call through them. Do not `api.get` a
list endpoint and `.map` the result — you'll map the envelope.

## The pattern used everywhere

```tsx
const kpis = useHydrated(['metrics-summary'], TodayApi.metricsSummary);
// kpis.data, kpis.isLoading, kpis.error
<QueryState q={kpis} what="the KPI tiles">{(data) => /* render data */}</QueryState>
```

`QueryState` (`src/components/ui.tsx`): skeleton while loading, `ApiErrorBanner`
with the server's message on error, children once data is present.
`TableRowsState` is the `<tbody>`-safe variant. Writes use React Query
`useMutation` directly (see `IncidentDetail.tsx`).

## Five rules from the guide, and where they live

1. **Render the server's message, never your own apology.** → `ApiErrorBanner` renders `error.message` verbatim; surfaced by `QueryState`.
2. **Never show fixtures as if they were live.** → taken further here: no fixtures at all. A failed call is an error state, not silent placeholder data.
3. **The lens travels with every request.** → `X-Lens` set in `src/api/client.ts`, driven by `LensContext` + the top-bar switcher, kept in sync with the signed-in user by `LensSync` in `App.tsx`. Controls are never hidden by lens — a `403 not_granted` renders as a flagged, denied entry (`Sources.tsx`).
4. **One owner per fragment.** → each screen's `useHydrated`/`useQuery` call is the only writer of that piece of state; React Query cache keys keep fragments independent.
5. **A refusal is data, not a failure.** → `fetchAllSettled()` in `Sources.tsx`; and Cortex renders a `refused` answer (confidence + threshold applied) like any other.

## Contract gaps (for the backend team)

- **DB Console** — no `/db/*` surface exists. The screen renders an honest "not exposed by the mock API" panel rather than inventing a schema browser.
- **Evidence-pack generation** — `/audit/packs/*` → 404. Only the integrity/continuity check (`/audit/verify`) is real.
- **Incident sorting** — `GET /incidents` has no `sort` param; `slaAt` is a time of day with no date and `openedAt` is display text. The list sorts client-side (`src/lib/incidentSort.ts`) by parsing both. Requested: `slaDueAt`, `openedAtIso` (ISO 8601), `priority` if it differs from severity, and `?sort=` before pagination. Full request: [API_REQUEST_INCIDENT_SORTING.md](API_REQUEST_INCIDENT_SORTING.md).
- **Audit "Method" column** — the prototype fixtures distinguished maker-checker vs fast-path. `/audit` entries carry no such field; they have `actorKind` (`ai | human`), which is a different axis. The Audit screen's "Kind" column renders `actorKind` as-is and does not synthesise Method from it. Needs a field on the entry if the distinction is real.
- **Settings** — `/config/thresholds` exposes 3 parameters; the prototype's Settings screen documented 7. This build shows the 3 that exist, with their `tuned` flag and `note`, rather than 7 half-backed rows. If the other 4 are real product parameters they need endpoints.
- **Citation targets are API paths, not routes** — `/briefing` cites `runs/2026-07-28` and `resolutions/res-1204`. `src/lib/appRoute.ts` maps them (`runs/` → `/eod/`, `resolutions/` → `/corpus/`). Prefer the API sending a route-neutral `{kind, id}`.
- **Derivation mock states** — `/derivations/hours-saved` returns the identical payload for `_state=empty|zero|stale|confirmed`; only `error` (503), `denied` (403) and `loading` (504 at the gateway) differ. The panel therefore derives its tag/freshness from the payload (`recomputedDays`, `excludes`, `value`); those four v12 states won't show until the mock varies them.
- **`/runbooks/{id}`** — returns `not_found` for the resolution ids in the current seed, so the incident detail links to the resolution record instead.

## Endpoint coverage

Every operation in `openapi.json` has a typed function in `src/api/endpoints.ts`
and is called from a screen, with three deliberate exceptions: `GET /runbooks/{id}`
(returns `not_found` on the seed; `/recall` returns the same `steps`),
`GET /citations/{id}` (the `/citations` list already carries full rows), and `GET /actions/{id}/receipt` (the approve response already carries the receipt — it is rendered from that, not re-fetched). `npm run check-api`
also exercises `POST /incidents`, `POST /actions`, `POST /actions/{id}/approve`, `POST /_reset`.
