# Screen → API calls, interaction by interaction

For every screen: what fires **on load**, and what each **click / submit / select /
row-expand** calls. Sources of truth: `src/screens/*.tsx`, `src/api/endpoints.ts`,
`src/api/client.ts`.

Conventions used below:

- **On load** = the call runs when the screen mounts (a React Query `useQuery` /
  `useHydrated`), before any interaction.
- **enabled: …** = a `useQuery` that stays idle until its condition is true.
- **invalidates `[key]`** = `queryClient.invalidateQueries` after a mutation, which
  makes every mounted query with that key refetch.
- Every request after sign-in carries `Authorization: Bearer <accessToken>`.
  **No request sends `X-Lens`** — the server derives the lens from the token.
  On a 401 the client refreshes once (shared across concurrent requests — the
  refresh token is single-use) and retries. Requests carry `X-Mock-State: <value>` when
  `VITE_FORCE_MOCK_STATE` is set, or per-call where noted.
- "navigation only" = a `<Link>` / `navigate()` — no request of its own; the
  destination screen's own on-load calls then run.

---

## App shell — runs on every authenticated screen

Mounted by `src/App.tsx` (`Shell`) and `src/components/Topbar.tsx`, so these fire
once when you sign in and stay cached across screen changes.

| Trigger | API call | Method + path | Notes |
|---|---|---|---|
| Shell mount | `useConnectionProbe()` | `GET /health` | At `VITE_API_ROOT` (not `/api/v1`). Drives the "Live / unreachable" chip. Once, on mount. |
| Shell mount | `IncidentsApi.list()` | `GET /incidents` | key `['incidents']`, `staleTime 30s`. Rail incident-count badge. |
| Shell mount | `useCitationIndex()` → `SourcesApi.citations()` | `GET /citations` | key `['citations']`, `staleTime Infinity`. Fetched once at boot, keyed by label; every `<Cite>` chip resolves label-only citations against it locally (links to `/sources/{sourceId}`, tooltip = source · unit) — no call per chip. Shared with the Sources "Citations index" table. |
| Topbar mount | `CorpusApi.metrics` | `GET /corpus/metrics` | key `['corpus-metrics']`, `staleTime 60s`. Top-bar corpus ticker. |
| Topbar mount | `TodayApi.priorities` | `GET /priorities` | key `['priorities']`, `staleTime 30s`. "Attention" count + tray. |

| Interaction | Calls | Effect |
|---|---|---|
| Lens label | — | Read-only — shows the lens the server returned at sign-in. To see another lens, sign in as another user. |
| Theme toggle, "Cortex" button, "Attention" toggle, account menu | — | Local state / navigation only. |
| "Sign out" | `AuthApi.logout(refreshToken)` → `POST /auth/logout` | Fire-and-forget; tokens dropped from memory and the query cache cleared regardless of the response. |
| (background) | `POST /auth/refresh` | At ~80% of `expiresIn`, and on any 401. If it fails, the session ends and the sign-in screen shows the server's message. |

---

## `/login` — `Login.tsx`

| Trigger | API call |
|---|---|
| On load | **none** |
| "Sign in" (submit) | `AuthApi.login(username, password)` → `POST /auth/login`. Stores the token pair in memory, takes the lens from `user.lens`, routes to that lens's landing screen. A 401 renders the server's message. |
| Seeded-user buttons (**dev builds only**) | none — fill the username field |
| Theme toggle | none |

---

## `/today` — `Today.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `TodayApi.metricsSummary()` | `GET /metrics/summary` — KPI tiles |
| On load | `TodayApi.priorities()` | `GET /priorities` — priority cards + "Needs a decision" |
| On load | `TodayApi.briefing()` | `GET /briefing` — overnight Cortex briefing |
| On load | `CortexApi.context('today', lens)` | `GET /cortex/context?screen=today&lens=<lens>` — context line + suggestion chips |

| Interaction | API call | Method + path |
|---|---|---|
| "how this is derived" on a KPI tile | mounts `DerivationPanel` → `TodayApi.derivation(id, state)` | `GET /derivations/{derivationId}` (e.g. `/derivations/hours-saved`). A `state` param on the URL (`#/today?derive=…&state=error`) is sent as `X-Mock-State`. |
| "Close" on the derivation panel | — | unmounts the panel |
| "Collapse / Expand" priorities | — | local state |
| Priority-card action button, decision link, Cortex suggestion chip | — | navigation only |

---

## `/executive` — `Executive.tsx`

Re-projection of other screens' data — no executive-specific endpoint.

| Trigger | API call | Method + path |
|---|---|---|
| On load | `TodayApi.metricsSummary()` | `GET /metrics/summary` |
| On load | `CorpusApi.metrics()` | `GET /corpus/metrics` |
| On load | `AuditApi.verify()` | `GET /audit/verify` |
| On load | `TodayApi.derivation('hours-saved')` | `GET /derivations/hours-saved` |

No interactive calls — the screen is read-only.

---

## `/incidents` — `Incidents.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `IncidentsApi.list()` | `GET /incidents` — key `['incidents']`. Stage tallies are computed client-side. |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| Stage filter buttons (All / Observed / Understood / Acting / Acted / Remembered) | — | — | client-side filter of the already-loaded list |
| "+ Observe incident" (**dev builds only**, `VITE_DEV_TOOLS`) | — | — | opens the inline form |
| "Observe" (in the form) | `IncidentsApi.create({ title, message, severity })` | `POST /incidents` | invalidates `['incidents']`, calls `incidents.refetch()`, then `navigate('/incidents/{newId}')` |
| "Cancel" | — | — | closes the form |
| Incident title / "Review proposed action →" | — | — | navigation to `/incidents/{id}` |
| (assure lens) | — | — | "Observe incident" is replaced by a "read-only" chip; no create path |

---

## `/incidents/:id` — `IncidentDetail.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `IncidentsApi.detail(id)` | `GET /incidents/{id}` — key `['incident', id]` |
| On load | `IncidentsApi.recall(id)` | `GET /incidents/{id}/recall` — key `['incident-recall', id]` |
| On load | `ActionsApi.approvers(lens, id)` | `GET /policy/approvers?lens=<lens>&incidentId=<id>` — key `['approvers', lens, id]`; gates the whole action surface |
| Once the incident has a `signatureId` | `CorpusApi.signature(sigId)` (in `SignatureSheet`) | `GET /signatures/{id}` — key `['signature', sigId]`; "Problem fingerprint" panel: included + excluded facets, "X is not part of the fingerprint", note, occurrence count |
| Once the incident has a `signatureId` | `CorpusApi.signatureOccurrences(sigId)` (in `SignatureSheet`) | `GET /signatures/{id}/occurrences` — key `['signature-occurrences', sigId]`; occurrence chips |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| "Advance to <next stage>" (Loop panel) | `IncidentsApi.advanceLoop(id, toStage, actorId, reason)` | `PATCH /incidents/{id}/loop` — body `{ toStage, actorId, reason }` | invalidates `['incident', id]` |
| "Not the same thing" (Recall panel) | `IncidentsApi.rejectRecall(id, actorId, reason)` | `POST /incidents/{id}/recall/reject` — body `{ actorId, reason }` | invalidates `['incident-recall', id]` |
| Approver `<select>`, Outcome `<select>`, failure-condition input | — | — | local state only |
| "Propose action" | `ActionsApi.propose({ incidentId, steps, proposerId, requiredApproverId, resolutionId })` | `POST /actions` | stores `proposed` in local state |
| "Approve & apply" / "Record failed verification" | `ActionsApi.approve(proposed.id, { approverId, outcome, condition })` | `POST /actions/{actionId}/approve` | stores `approval`; invalidates `['incident', id]`, `['audit']`, `['audit-verify']`; renders the receipt from this response (`ApprovalReceipt`) — no re-fetch |
| "Capture resolution" (Capture-to-corpus panel) | `CorpusApi.capture({ incidentId, title, problem, cause, fix, verification, approvedBy, draftedBy })` | `POST /resolutions` | invalidates `['corpus-metrics']` |
| "Open {resolutionId} →", related-incident links, fingerprint occurrence chips | — | — | navigation |
| (assure lens) | — | — | advance / reject / propose / approve / capture controls are hidden; the `GET /policy/approvers` load still runs |

---

## `/eod`, `/eod/:runId` — `Eod.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `EodApi.run(runId)` | `GET /runs/{runId}` — default `runId` is `2026-07-28`; key `['run', runId]` |
| On load | `EodApi.feedHealth()` | `GET /feeds/health` — key `['feeds-health']` |

| Interaction | API call |
|---|---|
| Stage row in the timeline | — — local `setSelected`; opens the stage-focus panel from data already loaded |
| "Open {incidentId} →" in stage focus | — navigation to `/incidents/{incidentId}` |

---

## `/audit` — `Audit.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load / filter change | `AuditApi.search(filters, cursor)` | `GET /audit?limit=50&q=&actor=&kind=&from=&to=` — infinite query, key `['audit', filters]`; filters come from the URL query string |
| `#/audit/{hash}` in the URL | `AuditApi.byHash(hash)` | `GET /audit/{hash}` — key `['audit-entry', hash]`; entry panel above the table |
| On load | `AuditApi.verify()` | `GET /audit/verify` — key `['audit-verify']` |

| Interaction | API call | Method + path |
|---|---|---|
| Search form submit (text, actor) | key changes → refetch | `GET /audit?q=&actor=…` |
| Kind select, From / To dates | key changes → refetch | `GET /audit?kind=&from=&to=…` (dates sent as inclusive ISO timestamps) |
| "Clear" / "Clear filters" | key changes → refetch | `GET /audit?limit=50` |
| "Load more" (only when the response returned a `cursor`) | next page | `GET /audit?…&cursor=<cursor>` |
| Click / Enter on a row, "Previous hash" link | — | navigation to `#/audit/{hash8}` (filters kept) → entry panel load |
| "Copy link" | — | copies `#/audit/{hash8}` without filters |
| "Open evidence-pack builder →" | — | navigation to `/audit/packs/new` |

---

## `/audit/packs/new` — `PackBuilder.tsx`

Assurance only (`pack:create`). A user without the grant gets `403 not_granted`
from `GET /packs`; the screen shows that message instead of the builder.

| Trigger | API call | Method + path |
|---|---|---|
| On load | `PacksApi.list()` | `GET /packs` — key `['packs']`; "Recent packs" + access check |
| On load / scope change | `PacksApi.preview(scope)` | `POST /packs/preview` — key `['pack-preview', scope]`; live counts + `gaps[]` |
| On load | `AuditApi.verify()` | `GET /audit/verify` |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| Date range / Action types selects | preview refetches | `POST /packs/preview` | resets any started build |
| Gap checkboxes | — | — | local; every gap must be ticked before the build button enables (the server enforces it too: `422 gaps_not_declared`) |
| "Build signed evidence pack" | `PacksApi.create(scope, user.id, acknowledgedGaps)` | `POST /packs` | invalidates `['packs']`; then polls `GET /packs/{id}` every 1 s while `building` |
| (pack `ready`) | `AuditApi.search({ q: packId })` | `GET /audit?q={packId}` | finds the `pack.exported` row → "View the audit entry" link; invalidates `['audit-verify']` |
| "Download pack" | `api.download(downloadUrl)` | `GET {downloadUrl}` with bearer | 404 on the mock today — the server's error is shown |

---

## `/corpus` — `Corpus.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `CorpusApi.metrics()` | `GET /corpus/metrics` — key `['corpus-metrics']` |
| On load | `CorpusApi.resolutions()` | `GET /resolutions` — key `['resolutions']` |
| On load | `SourcesApi.list()` | `GET /sources` — key `['sources']`; drives "Ingestion coverage" |

| Interaction | API call |
|---|---|
| "Resolutions" / "Sources" tabs (`CorpusTabs`; Sources tab omitted for exec), resolution row / ID link, "Inspect source →" | — navigation only |

No write actions on this screen. The header subtitle ("1,852 resolutions · 15 reuse events
this week") and the tiles both come from the same `GET /corpus/metrics` response. Only
`addedToday` has a delta on the mock, so only the Resolutions tile shows one.

---

## `/corpus/:id` — `ResolutionDetail.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `CorpusApi.resolution(id)` | `GET /resolutions/{id}` — key `['resolution', id]` |
| Once the resolution has a `signatureId` | `CorpusApi.signature(sigId)` (in `SignatureSheet`) | `GET /signatures/{id}` — key `['signature', sigId]`. **The mock's resolutions carry no `signatureId` today, so this does not fire**; the fingerprint is shown on Incident detail instead. |
| Once the resolution has a `signatureId` | `CorpusApi.signatureOccurrences(sigId)` (in `SignatureSheet`) | `GET /signatures/{id}/occurrences` — key `['signature-occurrences', sigId]` (same caveat) |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| "Record a reuse" | `CorpusApi.reuse(id)` | `POST /resolutions/{id}/reuse` | invalidates `['resolution', id]` and `['corpus-metrics']` |
| Related-incident / occurrence chips | — | — | navigation to `/incidents/{id}` |
| (assure, exec lenses) | — | — | "Record a reuse" is replaced by "Read-only for this lens" — no reuse call |

---

## `/sources`, `/sources/:id` — `Sources.tsx`

**List route (`/sources`):**

| Trigger | API call | Method + path |
|---|---|---|
| On load | `SourcesApi.list(q)` | `GET /sources` or `GET /sources?q=<q>` — key `['sources', q]` |
| On load | `SourcesApi.citations()` | `GET /citations` — key `['citations']`; "Citations index" table |
| On load (`useEffect` fan-out) | `SourcesApi.detail(s.id)` for **each** source in the list | `GET /sources/{id}` ×N, batched via `fetchAllSettled` (`Promise.allSettled`). A per-lens `403 not_granted` is kept and flagged, not thrown. |

| Interaction | API call | Effect |
|---|---|---|
| Search form "Search" (submit) | `setSearch({ q })` | key changes → `GET /sources?q=` refetches; the `useEffect` re-runs the per-source `GET /sources/{id}` fan-out |
| "Clear" | `setSearch({})` | `GET /sources` refetches; fan-out re-runs |
| "Open source detail →" | — | navigation to `/sources/{id}` |

**Detail route (`/sources/:id`):**

Rendered as the prototype's source sheet (`SourceRecord` in `Sources.tsx`), under the shared
Resolutions / Sources tabs: type, status pill, server `note`, a 3-column field grid (version,
dated, size, owner, system, last ingested, `citedBy` answers, readable-by lenses), and a
freshness line computed from `ingestedDays` vs `staleAfter`. Coverage gaps and readable units
follow as before.

| Trigger | API call | Method + path |
|---|---|---|
| On load | `SourcesApi.detail(id)` | `GET /sources/{id}` — key `['source-detail', id]` |
| On load | `SourcesApi.list(q)`, `SourcesApi.citations()` | `GET /sources`, `GET /citations` — the hooks always mount; the fan-out `useEffect` returns early when `:id` is set |

---

## `/db-console` — `DbConsole.tsx`

| Trigger | API call |
|---|---|
| On load | `DbApi.schema(q)` | `GET /db/schema?q=` — key `['db-schema', q]` |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| Schema search submit | key changes | `GET /db/schema?q=` | empty result says "not indexed is not the same as not existing" |
| Click / Enter on an object row | `DbApi.object(name)` | `GET /db/objects/{name}` | columns (PK, masked), FKs, dependents, EOD batches, `notConfirmed[]`; `404 not_indexed` renders the server's message |
| "Run (audited)" | `DbApi.query(sql)` | `POST /db/query` | result table, masked columns named, link to the `db.query` audit row (`auditRef`). A non-SELECT shows a courtesy warning but is still sent — the server refuses with `422 not_read_only` |
| "Sign as {user} and attach" | `DbApi.investigate(queryAuditRefs, changeRecord, user.id)` | `POST /db/investigations` | shows id, change record, signer; link to its audit row |

---

## `/settings` — `Settings.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `SettingsApi.thresholds()` | `GET /config/thresholds` — key `['thresholds']`; renders exactly the 3 keys it returns |
| On load (**dev builds only**, `import.meta.env.DEV`) | `MockControlApi.states()` | `GET /_states` — key `['mock-states']` |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| "Reset mock store" (**dev only**) | `MockControlApi.reset()` | `POST /_reset` | `queryClient.invalidateQueries()` with no key → **every** mounted query refetches |
| Threshold rows | — | — | read-only; `PATCH` is not implemented on the mock |

---

## `/cortex` — `Cortex.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `CortexApi.context(screen, lens, objectId)` | `GET /cortex/context?screen=<screen>&lens=<lens>&objectId=<objectId>` — key `['cortex-context', screen, lens, objectId]`; defaults `screen=incident-detail`, `objectId=INC-2261` |

| Interaction | API call | Method + path |
|---|---|---|
| Screen `<select>` | key changes → `CortexApi.context(...)` refetches | `GET /cortex/context?…` |
| Object-id `<input>` | key changes on each keystroke → `CortexApi.context(...)` refetches | `GET /cortex/context?…` |
| Suggested-question chip | `CortexApi.ask({ question, context: { screen, lens, objectId } })` | `POST /cortex/ask` |
| "Ask" (form submit / button) | `CortexApi.ask({ question, context: { screen, lens, objectId } })` | `POST /cortex/ask` |

The answer is held in local mutation state — no cache invalidation.

---

## Endpoints defined but never called from a screen

From `src/api/endpoints.ts` (kept for completeness):

| Function | Endpoint | Why unused |
|---|---|---|
| `AuthApi.me()` | `GET /auth/me` | The login response already carries the user |
| `ActionsApi.runbook(resolutionId)` | `GET /runbooks/{id}` | Returns `not_found` for the seed's resolution ids; `/incidents/{id}/recall` already returns the same `steps` array |
| `SourcesApi.citation(citationId)` | `GET /citations/{id}` | The `/citations` list already carries full rows |
