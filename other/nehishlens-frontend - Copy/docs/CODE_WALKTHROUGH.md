# Code walkthrough — for a new developer on this project

This assumes you know basic JavaScript but nothing about React, Vite, or
this codebase specifically. It's meant to be read once, top to bottom,
before you touch any code. Everything else in `docs/` assumes you've read
this.

## 1. The three technologies, in one paragraph each

**React** — a library for building UIs out of small, reusable pieces
called **components**. A component is just a function that returns some
markup (written in a JSX syntax that looks like HTML but is actually
JavaScript). React re-runs a component's function and updates the real DOM
whenever the component's **state** changes. You'll see two hooks
constantly: `useState` (a variable that, when changed, triggers a
re-render) and `useEffect` (run some code when the component mounts, or
when specific values change).

**TypeScript** — JavaScript with type annotations. `function add(a: number, b: number): number` means the compiler will yell at you if you pass a string. Every `.ts`/`.tsx` file here is TypeScript. It doesn't change how the app runs — it catches mistakes before you run it. Run `npm run build` (which runs `tsc -b` first) to see every type error in the project at once.

**Vite** — the tool that runs the dev server (`npm run dev`) and bundles everything into static files for deployment (`npm run build`). You don't need to configure it; `vite.config.ts` is already set up. The one Vite-specific thing to know: env variables must start with `VITE_` to be readable in the browser (see `docs/ENVIRONMENT.md`).

## 2. Folder structure, and what belongs where

```
src/
  api/           - talking to the backend. Nothing else in the app calls fetch() directly.
    config.ts       - reads .env values. The ONLY file that touches import.meta.env.
    client.ts        - the fetch wrapper: headers, error parsing, online/offline,
                       and api.list()/api.page() which unwrap the {items,total,cursor}
                       envelope every list endpoint returns.
    endpoints.ts     - one small function per API endpoint, e.g. TodayApi.metricsSummary().
                       Response types are tightened against the live mock.

  hooks/
    useHydrated.ts   - thin wrapper over React Query's useQuery: gives you
                       {data, isLoading, error}. (It has an optional fixture arg
                       left over from an earlier design; no screen uses it.)
    useConnection.ts - "check once, on startup, whether the API is reachable."

  context/        - state shared across components without prop-drilling.
    AuthContext.tsx  - mock sign-in: {name, lens}, persisted to localStorage.
    ThemeContext.tsx - light/dark, sets html[data-theme], persisted.
    LensContext.tsx  - active lens -> X-Lens header + html[data-lens].

  screens/        - one file per route (Today.tsx, IncidentDetail.tsx, ...).
                    Login.tsx is the sign-in gate. See docs/SCREENS.md.

  components/
    Rail.tsx, Topbar.tsx, ScreenHeader.tsx - the prototype shell.
    ui.tsx           - shared building blocks. Most important: <QueryState> and
                       <TableRowsState> (skeleton -> error banner -> data), plus
                       <Conf>, <Sev>, <Cite>, <PanelHead>, <Trace>.
    ApiErrorBanner.tsx, ConnectionBanner.tsx - API-layer status UI.

  assets/nehish-logo.png - the NEHISH mark, decoded from the prototype.

  styles/legacy.css   - CSS extracted verbatim from the prototype (.panel, .tile,
                        .chip, .inc, .tbl, .stepper, .ops-timeline, ...).
  styles/theme-dark.css - html[data-theme="dark"] overrides, ported verbatim
                        from reference/nehishlens-v7-light-dark-toggle.html.
  index.css           - the handful of styles not in the prototype: API banners,
                        account menu, login card, a few timeline helpers.

  App.tsx         - the auth gate + the shell layout (rail + top bar + routed
                    content) + the route table.
  main.tsx        - entry point. Nests ThemeProvider > AuthProvider > LensProvider
                    > QueryClientProvider around <App/>.
```

## 3. How a screen actually gets its data — traced end to end

This is the single most important thing to understand. Every wired screen
follows exactly this path. We'll trace the KPI tiles on the Today screen.

**Step 1 — the screen asks a hook for data.**
`src/screens/Today.tsx`:
```tsx
const kpis = useHydrated(['metrics-summary'], TodayApi.metricsSummary);
```
Two arguments: a unique cache key and the function to call to get the data.

**Step 2 — the hook calls the endpoint function.**
`src/hooks/useHydrated.ts` uses React Query's `useQuery` to call
`TodayApi.metricsSummary` for you (caching, loading state, re-fetching — you
don't write any of that by hand).

**Step 3 — the endpoint function calls the shared client.**
`src/api/endpoints.ts`:
```ts
export const TodayApi = {
  metricsSummary: () => api.get<KpiTilesResponse>('/metrics/summary'),
  priorities:     () => api.list<PriorityItem>('/priorities'),   // list -> api.list
  ...
};
```
`api.get` / `api.list` come from `src/api/client.ts` — the one file that
calls `fetch()`. `api.list` also strips the `{items,total,cursor}` envelope.

**Step 4 — the client builds the real request.**
`src/api/client.ts` reads `apiConfig.baseUrl` (from `.env`, via
`src/api/config.ts`), builds the full URL, adds the `X-Lens` header, and
either returns the parsed JSON or throws an `ApiError` carrying the server's
own `{code, message, retryable}`.

**Step 5 — the result flows back up.**
On success `kpis.data` holds `{tiles: [...]}`, `kpis.error` is `null`.
On failure `kpis.data` is `undefined` and `kpis.error` is the `ApiError`.
There is no fixture fallback — a failure is an error state.

**Step 6 — the screen renders it through `<QueryState>`.**
```tsx
<QueryState q={kpis} what="the KPI tiles">
  {(data) => data.tiles.map((t) => <div className="tile" key={t.key}>…</div>)}
</QueryState>
```
`QueryState` (`src/components/ui.tsx`) shows a skeleton while loading, an
`ApiErrorBanner` with the server's message on error, and calls your render
function once data is present. Inside a `<tbody>` use `<TableRowsState>`
instead — same behaviour, but its loading/error fallback is a `<tr>`.

### Diagram

```
Today.tsx
   │  useHydrated(['metrics-summary'], TodayApi.metricsSummary)
   ▼
useHydrated.ts ──uses──▶ React Query (caching, loading state, retries)
   │  calls
   ▼
endpoints.ts:  TodayApi.metricsSummary() = api.get('/metrics/summary')
   │  calls
   ▼
client.ts:  api.get()  ──▶  fetch(`${VITE_API_BASE_URL}/metrics/summary`, { headers: { 'X-Lens': ... } })
   │
   ▼
Mock API (https://mock-api-nehishlens.aminobots.com)
   │
   ▼  response flows back up through the same chain
Today.tsx renders <QueryState q={kpis}> → skeleton | ApiErrorBanner | tiles
```

## 4. How routing works

`src/App.tsx` uses `react-router-dom`'s `HashRouter` — that's why URLs
look like `http://localhost:5173/#/incidents` rather than
`http://localhost:5173/incidents`. This matches the original prototype's
URL scheme (see the wiring guide) and needs no server configuration.

```tsx
<Routes>
  <Route path="/today" element={<Today />} />
  <Route path="/incidents" element={<IncidentsList />} />
  <Route path="/incidents/:id" element={<IncidentDetail />} />
  ...
</Routes>
```

`:id` is a URL parameter — inside `IncidentDetail`, `useParams<{ id: string }>()` reads it back out. Try it: click an incident on the Incidents screen and watch the URL change to `#/incidents/INC-2261`.

`App.tsx` also gates on auth: `useAuth()` returns `null` until you sign in, and
while it's `null` the whole app renders `<Login>` instead of the shell. After
sign-in, `LensSync` pushes the chosen lens into `LensContext` (which sets the
`X-Lens` header), and `LandingRedirect` sends you to that lens's home screen
(`LENS_LANDING` in `AuthContext.tsx`). The full route table is in `docs/SCREENS.md`.

## 5. A worked example: adding a brand new wired fragment

Say you're asked to wire "feed health" on the EOD screen (currently a
TODO — see `docs/API_WIRING.md`). Here's the exact recipe, following the
Today screen as the template:

1. **Check the response shape.** Open https://mock-api-nehishlens.aminobots.com/docs, find the endpoint, "Try it out", look at the JSON. If it's a collection it'll be `{ items: [...], total, cursor }`.

2. **Add/adjust the type and the call** in `src/api/endpoints.ts`:
   ```ts
   export interface FeedHealth { sourceId: string; name: string; lastHeartbeat: string | null; state: 'ok' | 'silent'; note?: string }

   export const EodApi = {
     ...
     feedHealth: () => api.list<FeedHealth>('/feeds/health'),   // api.list for a collection; api.get for an object
   };
   ```

3. **Call `useHydrated` in the screen**, `src/screens/Eod.tsx`:
   ```tsx
   const feeds = useHydrated(['feeds-health'], EodApi.feedHealth);
   ```

4. **Render it through `<QueryState>`** — no manual loading/error handling:
   ```tsx
   <QueryState q={feeds} what="feed health">
     {(items) => items.map((f) => (
       <div className="claim" key={f.sourceId}>
         <span className={`pip ${f.state === 'ok' ? 'p-ok' : 'p-warn'}`} />
         <span className="lb">{f.name}</span>
         <span className="mono t-cap">{f.state === 'ok' ? 'covered' : (f.note ?? 'silent')}</span>
       </div>
     ))}
   </QueryState>
   ```
   For a write, use React Query's `useMutation` directly (see `src/screens/IncidentDetail.tsx`).

5. **Run it.** `npm run dev`, open the screen, check the Network tab for the real request. Set `VITE_DEBUG_API_LOGGING=true` to also log `[api] GET /feeds/health -> 200 …` to the console.

6. **Update `docs/API_WIRING.md` and `docs/SCREENS.md`** in the same change.

Every screen already follows this recipe — read `src/screens/Today.tsx` for the
fullest example, `src/screens/Sources.tsx` for the `fetchAllSettled` fan-out,
`src/screens/IncidentDetail.tsx` for the write path.

## 6. Glossary — terms you'll hit in this codebase

| Term | Meaning here |
|---|---|
| **Hook** | A function starting with `use` that can call other hooks. `useHydrated`, `useState`, `useQuery` are all hooks. |
| **Component** | A function that returns JSX. `Today`, `Topbar`, `ApiErrorBanner` are all components. |
| **Props** | Arguments passed into a component, e.g. `<ApiErrorBanner error={...} what="..." />`. |
| **State** | Data that, when changed, causes a re-render. Managed with `useState` or (here) React Query. |
| **React Query** | The library (`@tanstack/react-query`) that handles fetching, caching, and re-fetching for us. `useHydrated` is built on top of its `useQuery`; writes use `useMutation`. |
| **`QueryState` / `TableRowsState`** | The wrappers in `src/components/ui.tsx` that turn `{data, isLoading, error}` into skeleton / error banner / rendered data. |
| **Lens** | The role/permission context sent as `X-Lens` on every request (`ops`, `eng`, `assure`, `exec`) — server decides what each lens can see. Chosen at sign-in, switchable in the top bar. |
| **`.env` file** | Where all environment-specific config (API URLs, etc.) lives — see `docs/ENVIRONMENT.md`. |

## 7. Where to go next

- `docs/SCREENS.md` — every screen's route, endpoints, and prototype mapping.
- `docs/API_WIRING.md` — what's wired vs. what the mock can't back yet.
- `docs/ENVIRONMENT.md` — every configurable value and how to change it.
- `docs/VSCODE_SETUP.md` — running, debugging, and testing this in VS Code.
- `reference/NehishLensAPIWiringGuide.docx` — the client's original guide this whole app is built against. Worth reading once; this codebase follows its five rules and its screen-by-screen structure deliberately.
