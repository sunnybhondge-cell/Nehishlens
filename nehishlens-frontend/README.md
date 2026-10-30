# NehishLens — frontend

React + TypeScript + Vite port of the provided prototype (`reference/nehishlens-v8.html`),
wired against the NehishLens mock API described in
`reference/NehishLensAPIWiringGuide.docx`. Every screen is built to the
prototype's layout and driven only by live mock data — there is no bundled
placeholder content.

- Mock API docs (Swagger, try-it-out): https://mock-api-nehishlens.aminobots.com/docs
- Endpoint browser by screen: https://mock-api-nehishlens.aminobots.com/api-console
- Postman collection: https://mock-api-nehishlens.aminobots.com/collection.json

## Quick start

```bash
npm install
cp .env.example .env.development   # working defaults are already provided — edit if your API URL differs
npm run dev
```

Open http://localhost:5173. The app boots by probing `/health` once
(`src/hooks/useConnection.ts`), then shows a **sign-in screen**. Sign in with a
username and password (`POST /auth/login`). The **lens comes from the server**
for that user — there is no lens picker — and you land on that lens's home
screen. Every request then carries the bearer token; the app never sends
`X-Lens`. Tokens live in memory only, so a reload asks you to sign in again;
the account menu (top-right) signs out.

On the mock, any password works except `wrong` (which drives the 401). Seeded
users (also listed on the sign-in screen in dev builds):

| Username | Lens |
|---|---|
| `vishal.d` | Operations (proposer) |
| `r.edwards` | Operations (approver) |
| `a.menon` | Engineering |
| `compliance.head` | Assurance |
| `s.iyer` | Executive |

There's a **light/dark toggle** in the top bar (also on the sign-in screen);
the choice persists.

## Where things live

| Concern | File |
|---|---|
| API base URL / all environment config | `.env.example`, `src/api/config.ts` — **the only place API details are read from** |
| HTTP client (errors, lens header, connection state, list-envelope unwrap) | `src/api/client.ts` |
| Typed calls for every endpoint | `src/api/endpoints.ts` |
| Fragment state (skeleton / error / data) | `QueryState` & `TableRowsState` in `src/components/ui.tsx` |
| Sign-in, tokens, lens from the server | `src/context/AuthContext.tsx`, `src/screens/Login.tsx`, `src/api/client.ts` |
| Light/dark theme | `src/context/ThemeContext.tsx`, `src/styles/theme-dark.css` |
| Ported design system (verbatim from the prototype) | `src/styles/legacy.css` |
| Shell (icon rail, top bar, screen header) | `src/components/Rail.tsx`, `Topbar.tsx`, `ScreenHeader.tsx` |
| Citation chips resolved against `GET /citations` (loaded once at boot) | `src/hooks/useCitations.ts`, `Cite` in `src/components/ui.tsx` |
| Corpus tabs, problem fingerprint sheet | `src/components/CorpusTabs.tsx`, `src/components/SignatureSheet.tsx` |
| Routing (hash-based) | `src/App.tsx` |

Per-screen route and endpoint map: **[docs/SCREENS.md](docs/SCREENS.md)**.
Full guide → implementation mapping: **[docs/API_WIRING.md](docs/API_WIRING.md)**.

## Documentation

- **[docs/CODE_WALKTHROUGH.md](docs/CODE_WALKTHROUGH.md)** — start here if you're new to this codebase (or to React/TypeScript/Vite). Folder structure, a request traced end-to-end, and how to add a new wired fragment.
- **[docs/SCREENS.md](docs/SCREENS.md)** — every screen: its route, the endpoints it calls, and the prototype section it maps to.
- **[docs/SCREEN_API_CALLS.md](docs/SCREEN_API_CALLS.md)** — per screen, what fires on load and which API call each click / submit / select triggers.
- **[docs/ENVIRONMENT.md](docs/ENVIRONMENT.md)** — every env var, pointing the app at a different API, forcing a mock state for testing.
- **[docs/API_WIRING.md](docs/API_WIRING.md)** — what's wired live vs. what the mock can't back yet, per screen.
- **[docs/API_LOGGING.md](docs/API_LOGGING.md)** — the dev-only `logs/api/` request/response capture: why it exists, how it works, why it's absent from a client build.
- **[docs/VSCODE_SETUP.md](docs/VSCODE_SETUP.md)** — opening, running, and debugging in VS Code.
- **[docs/PENDING.md](docs/PENDING.md)** — open items after the client's Open Queries v1.1 answers: replies owed, decisions awaited, remaining frontend work, mock deviations.

## Scripts

```bash
npm run dev          # start the Vite dev server
npm run build         # typecheck (tsc -b) + production build to dist/
npm run preview       # preview the production build locally
npm run check-api     # verifies the live mock (see docs/API_WIRING.md) — 15/15 when healthy
npm run lint          # oxlint
```

## Verifying the API is actually wired (not just the UI rendering)

Per the wiring guide: "the check that matters is whether changing the API
changes the screen." Create an incident via `POST /incidents` (Swagger
try-it-out, or `npm run check-api`) and confirm the Incidents count moves;
sign in as `vishal.d`, open `INC-2261`, pick an approver, *Propose action* then *Approve & apply* and
confirm the Audit trail gains rows; `POST /_reset` and confirm both revert.

## What's wired

| Screen | Status |
|---|---|
| Today, Executive, Incidents (+ detail), EOD, Audit, Corpus (+ resolution detail), Sources, Settings, Cortex | fully API-driven |
| Incident write path — recall, approvers, `POST /actions`, approve, loop advance | wired and exercised |
| Sign-in (`/auth/login`, `/refresh`, `/logout`) | wired; lens from the token |
| Audit search + deep-linkable entries (`#/audit/{hash}`) | wired |
| Evidence-pack builder (`/audit/packs/new`, Assurance) | wired — preview, gap acknowledgement, build, poll, audit link |
| DB Console (Engineering) | wired — schema, object, read-only query, signed investigation |
| Observe incident | dev builds only (`VITE_DEV_TOOLS`) |

What is still open — replies owed to the client, decisions awaited, remaining
work and mock deviations — is tracked in [docs/PENDING.md](docs/PENDING.md).
