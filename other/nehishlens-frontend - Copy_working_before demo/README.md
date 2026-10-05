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
(`src/hooks/useConnection.ts`), then shows a **sign-in screen**: enter any
username, pick a lens (Operations / Engineering / Assurance / Executive) and
click *Sign in*. That lens becomes the `X-Lens` header on every request and you
land on that lens's home screen. Sign-in is a mock gate — the API has no auth —
persisted to `localStorage`; the account menu (top-right) signs out.

There's a **light/dark toggle** in the top bar (also on the sign-in screen);
the choice persists.

## Where things live

| Concern | File |
|---|---|
| API base URL / all environment config | `.env.example`, `src/api/config.ts` — **the only place API details are read from** |
| HTTP client (errors, lens header, connection state, list-envelope unwrap) | `src/api/client.ts` |
| Typed calls for every endpoint | `src/api/endpoints.ts` |
| Fragment state (skeleton / error / data) | `QueryState` & `TableRowsState` in `src/components/ui.tsx` |
| Sign-in + lens | `src/context/AuthContext.tsx`, `src/screens/Login.tsx` |
| Light/dark theme | `src/context/ThemeContext.tsx`, `src/styles/theme-dark.css` |
| Ported design system (verbatim from the prototype) | `src/styles/legacy.css` |
| Shell (icon rail, top bar, screen header) | `src/components/Rail.tsx`, `Topbar.tsx`, `ScreenHeader.tsx` |
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
open `INC-2261`, pick an approver, *Propose action* then *Approve & apply* and
confirm the Audit trail gains rows; `POST /_reset` and confirm both revert.

## What's wired

| Screen | Status |
|---|---|
| Today, Executive, Incidents (+ detail), EOD, Audit, Corpus (+ resolution detail), Sources, Settings, Cortex | fully API-driven |
| Incident write path — recall, approvers, `POST /actions`, approve, loop advance | wired and exercised |
| DB Console | no `/db/*` endpoint on the mock — screen says so, shows nothing invented |
| Evidence-pack **generation** (`/audit/packs/new`) | `/audit/packs/*` is 404 — scope/export inert; the check step (`/audit/verify`) is live |

Both gaps are the mock's, not the app's — when an endpoint appears, each wires
up with the same `useHydrated` / `QueryState` pattern as everything else.
