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
- Every request carries `X-Lens: <current lens>` (set from the top-bar lens
  switcher via `setLens`). Requests carry `X-Mock-State: <value>` when
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
| Topbar mount | `CorpusApi.metrics` | `GET /corpus/metrics` | key `['corpus-metrics']`, `staleTime 60s`. Top-bar corpus ticker. |
| Topbar mount | `TodayApi.priorities` | `GET /priorities` | key `['priorities']`, `staleTime 30s`. "Attention" count + tray. |

| Interaction | Calls | Effect |
|---|---|---|
| Lens tab (Operations / Engineering / Assurance / Executive) | — | `setActiveLens` → `setLens` changes the `X-Lens` header for **all later** requests. Queries whose key contains `lens` (`approvers`, `cortex-context`) refetch. |
| Theme toggle, "Cortex" button, "Attention" toggle, account menu, "Sign out" | — | Local state / navigation / `localStorage` only. Sign-in and sign-out make **no** network call — the API has no auth. |

---

## `/login` — `Login.tsx`

| Trigger | API call |
|---|---|
| On load | **none** |
| "Sign in" (submit) | **none** — `signIn(name, lens)` sets `X-Lens` and writes `localStorage`, then routes to the lens landing screen |
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
| "+ Observe incident" | — | — | opens the inline form |
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
| After an approval succeeds | `ActionsApi.receipt(proposed.id)` | `GET /actions/{actionId}/receipt` — `enabled: !!approval && !!proposed` |

| Interaction | API call | Method + path | After |
|---|---|---|---|
| "Advance to <next stage>" (Loop panel) | `IncidentsApi.advanceLoop(id, toStage, actorId, reason)` | `PATCH /incidents/{id}/loop` — body `{ toStage, actorId, reason }` | invalidates `['incident', id]` |
| "Not the same thing" (Recall panel) | `IncidentsApi.rejectRecall(id, actorId, reason)` | `POST /incidents/{id}/recall/reject` — body `{ actorId, reason }` | invalidates `['incident-recall', id]` |
| Approver `<select>`, Outcome `<select>`, failure-condition input | — | — | local state only |
| "Propose action" | `ActionsApi.propose({ incidentId, steps, proposerId, requiredApproverId, resolutionId })` | `POST /actions` | stores `proposed` in local state |
| "Approve & apply" / "Record failed verification" | `ActionsApi.approve(proposed.id, { approverId, outcome, condition })` | `POST /actions/{actionId}/approve` | stores `approval`; invalidates `['incident', id]` and `['audit']`; flips the receipt query on → `GET /actions/{actionId}/receipt` |
| "Capture resolution" (Capture-to-corpus panel) | `CorpusApi.capture({ incidentId, title, problem, cause, fix, verification, approvedBy, draftedBy })` | `POST /resolutions` | invalidates `['corpus-metrics']` |
| "Open {resolutionId} →", related-incident links | — | — | navigation |
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
| On load | `AuditApi.list(50)` | `GET /audit?limit=50` — key `['audit']` |
| On load | `AuditApi.verify()` | `GET /audit/verify` — key `['audit-verify']` |

| Interaction | API call | Method + path |
|---|---|---|
| Click an audit table row (expand) | `AuditApi.byHash(entry.hash)` | `GET /audit/{hash}` — key `['audit-entry', hash]`, `enabled: open`. Re-collapsing/expanding uses the cache. |
| "Open evidence-pack builder →" | — | navigation to `/audit/packs/new` |

---

## `/audit/packs/new` — `PackBuilder.tsx`

Pack generation has no endpoint on the mock (`/audit/packs/*` → 404); the scope
and export controls are `disabled`.

| Trigger | API call | Method + path |
|---|---|---|
| On load | `AuditApi.verify()` | `GET /audit/verify` — the only live call |
| Date range / Action types / Systems selects, "Generate signed evidence pack" | — | disabled, no request |

---

## `/corpus` — `Corpus.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `CorpusApi.metrics()` | `GET /corpus/metrics` — key `['corpus-metrics']` |
| On load | `CorpusApi.resolutions()` | `GET /resolutions` — key `['resolutions']` |
| On load | `SourcesApi.list()` | `GET /sources` — key `['sources']`; drives "Ingestion coverage" |

| Interaction | API call |
|---|---|
| "Resolutions" / "Sources" tabs, resolution row / ID link, "Inspect source →" | — navigation only |

No write actions on this screen.

---

## `/corpus/:id` — `ResolutionDetail.tsx`

| Trigger | API call | Method + path |
|---|---|---|
| On load | `CorpusApi.resolution(id)` | `GET /resolutions/{id}` — key `['resolution', id]` |
| Once the resolution has a `signatureId` | `CorpusApi.signature(sigId)` | `GET /signatures/{id}` — key `['signature', sigId]`, `enabled: !!sigId` |
| Once the resolution has a `signatureId` | `CorpusApi.signatureOccurrences(sigId)` | `GET /signatures/{id}/occurrences` — key `['signature-occurrences', sigId]`, `enabled: !!sigId` |

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

| Trigger | API call | Method + path |
|---|---|---|
| On load | `SourcesApi.detail(id)` | `GET /sources/{id}` — key `['source-detail', id]` |
| On load | `SourcesApi.list(q)`, `SourcesApi.citations()` | `GET /sources`, `GET /citations` — the hooks always mount; the fan-out `useEffect` returns early when `:id` is set |

---

## `/db-console` — `DbConsole.tsx`

| Trigger | API call |
|---|---|
| On load | **none** — the mock exposes no `/db/*` endpoint; the screen says so |
| Interactions | none |

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
| `ActionsApi.runbook(resolutionId)` | `GET /runbooks/{id}` | Returns `not_found` for the seed's resolution ids; `/incidents/{id}/recall` already returns the same `steps` array |
| `SourcesApi.citation(citationId)` | `GET /citations/{id}` | The `/citations` list already carries full rows |
