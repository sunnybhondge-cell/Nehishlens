# Building and testing this in VS Code

## 1. Open the project

Open the `nehishlens-frontend` folder directly in VS Code (File → Open
Folder), not the parent — the `.vscode/` config, `.env` files and
`tsconfig` are all relative to this folder.

On first open, VS Code will prompt to install the recommended extensions
(`.vscode/extensions.json`):

- **ESLint** — flags issues as you type
- **Prettier** — formats on save (already wired via `.vscode/settings.json`)
- **REST Client** (`humao.rest-client`) — lets you fire requests at the mock API from a `.http` file inside the editor, no Postman needed
- **ES7+ React/Redux snippets**
- **GitLens**

Accept the prompt, or install manually from the Extensions panel.

## 2. Install dependencies and run

```bash
npm install
cp .env.example .env.development   # skip if already present — it ships with working defaults
npm run dev
```

Or from VS Code: **Terminal → Run Task… → dev-server** (defined in
`.vscode/tasks.json`), which starts the same `npm run dev` in a dedicated
terminal panel and marks itself ready once Vite prints its "ready in" line.

Open http://localhost:5173, or use the **Run and Debug** panel (Ctrl/Cmd+Shift+D)
and pick **"Launch app in Chrome (Vite dev server)"** — this starts the dev
server via the `preLaunchTask` and opens Chrome with breakpoint support, so
you can set breakpoints directly in your `.tsx`/`.ts` source in VS Code.

## 3. Typecheck / build

**Terminal → Run Task… → typecheck**, or:

```bash
npm run build
```

This runs `tsc -b` first — TypeScript errors surface as VS Code Problems
(bound via `"problemMatcher": ["$tsc"]` in `tasks.json`), then `vite build`
to `dist/`.

## 4. Testing against the mock API

**Option A — the check script** (Node port of `check-api.sh` from the
wiring guide): Terminal → Run Task… → **check-api (deployed mock)**, or:

```bash
npm run check-api                      # uses VITE_API_ROOT from your .env
npm run check-api -- http://localhost:8099   # or point at a local instance
```

This runs the same 5 checks in the same order as the original shell
script — routes, Today's four endpoints, maker-checker enforcement, the
live-store check, and `_reset` — and exits non-zero on any failure, so it
also drops into CI unchanged. **Do not run it against the shared deployed
mock during a demo** — step 4 creates a visible incident until step 5
removes it, same caveat as the original script.

**Option B — REST Client, endpoint by endpoint.** Create
`requests.http` (already gitignored if you keep it local, or check it in
for the team) and hit any endpoint directly from the editor:

```http
@baseUrl = https://mock-api-nehishlens.aminobots.com/api/v1

### KPI tiles
GET {{baseUrl}}/metrics/summary
X-Lens: ops

### Force an error state
GET {{baseUrl}}/derivations/hours-saved?_state=error
X-Lens: ops

### Propose an action
POST {{baseUrl}}/actions
Content-Type: application/json
X-Lens: ops

{
  "incidentId": "INC-2261",
  "steps": ["restart batch job"],
  "proposerId": "alice",
  "requiredApproverId": "bob"
}
```

With the REST Client extension installed, a **"Send Request"** link appears
above each `###` block — click it to fire the request and see the response
in a split pane, no terminal or Postman needed.

**Option C — Swagger, in the browser.** The mock ships its own try-it-out
UI at https://mock-api-nehishlens.aminobots.com/docs — useful for exploring
a response shape before writing the TypeScript type for it in
`src/api/endpoints.ts`.

## 5. Debugging a failed call

1. Set `VITE_DEBUG_API_LOGGING=true` in `.env.development` (on by default) — every request logs `method path -> status (Nms) lens=x` to the console.
2. Open the browser DevTools Network tab alongside; the app never masks the real status code or response body.
3. If a screen shows "Showing saved data" (the fixture-fallback banner), that's `useHydrated().isFixture` — check the Network tab or console log for the actual failure first; the app is telling you the live call failed, not swallowing it.
4. To reproduce a specific failure mode without depending on real data drifting into that state, force it: add `?_state=error` (or `denied`, `empty`, `partial`, …) to the request in `requests.http`, or set `VITE_FORCE_MOCK_STATE` — see `docs/ENVIRONMENT.md`.

## 6. Handing this off / changing the API URL for a client demo

Nothing in the source needs to change. Edit `.env.production` (or create
`.env.production.local` for a one-off, gitignored) with the new
`VITE_API_BASE_URL` / `VITE_API_ROOT`, then:

```bash
npm run build
npm run preview   # sanity-check the production build locally before shipping
```
