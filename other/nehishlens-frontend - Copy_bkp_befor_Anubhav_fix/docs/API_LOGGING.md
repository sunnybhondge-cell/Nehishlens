# API request/response logging (`logs/api/`)

A dev-only facility that mirrors **every** call the app makes to the NehishLens
API — method, URL, lens, status, duration, request body, response body — to
files on disk under `logs/api/`, so you can inspect and diff exactly what went
over the wire after the fact.

It is **off by default**, gated by one environment flag, and built so that it
**cannot run — or even exist — in a build you hand to a client**. This document
explains what every piece is for and why it was built the way it was.

---

## 1. Why this exists

The app already has `VITE_DEBUG_API_LOGGING`, which prints a one-line summary per
call to the browser console:

```
[api] GET /metrics/summary -> 200 (142ms) lens=ops
```

That is fine for a quick glance, but it has real limits:

| Console logging | File logging (`logs/api/`) |
|---|---|
| Scrolls away; capped ring buffer in DevTools | Permanent until you delete it |
| Bodies collapsed / truncated by DevTools | Full request and response body, verbatim |
| Can't `grep`, `jq`, or diff two runs | Plain files — every Unix tool works |
| Gone when you close the tab | Survives reloads, crashes, restarts |
| Hard to attach to a bug report | Attach the `.json` file directly |

Concrete situations this was built for:

- **"The screen shows the wrong number."** Open the matching `*.json` file and
  see whether the API returned the wrong number or the UI mangled a correct one.
- **"It's slow."** Every record has `durationMs`. Sort the NDJSON by it.
- **"It worked yesterday."** Keep yesterday's `session-*.ndjson`, diff against
  today's.
- **Regression capture.** Record a known-good session, keep it in the bug ticket.

### Why not just write files directly from the app?

The app runs in a **browser**. Browser JavaScript cannot write to the
filesystem. So the browser side can only *send* each record somewhere, and
something running in **Node** has to receive it and write the file. The only
Node process in a normal dev workflow is the **Vite dev server** — so that is
what receives and writes. This is also what makes the feature intrinsically
dev-only: no dev server, nothing to write to.

---

## 2. Design constraints

1. **Zero footprint in a client build.** A production bundle must contain none
   of this — no beacon code, no endpoint, no file I/O — regardless of how the
   environment is configured. (See §6.)
2. **Never change app behaviour.** Logging is fire-and-forget. It must not
   block a request, must not throw into React, must not alter what a screen
   renders, even if the log sink is missing or erroring.
3. **One switch.** A single env flag turns the whole thing on or off. Default
   off.
4. **Readable two ways.** A machine-friendly stream for `grep`/`jq`, and a
   human-friendly file per call for eyeballing.

---

## 3. The moving parts — every file and why it's there

```
nehishlens-frontend/
├─ vite.config.ts            ← Node side: receives records, writes the files (dev server only)
├─ src/api/
│  ├─ config.ts              ← reads the VITE_API_LOG flag into apiConfig.apiLog
│  ├─ apiLog.ts              ← browser side: sends one record per call, or does nothing
│  └─ client.ts              ← the single fetch() wrapper — calls apiLog after every request
├─ .env.example              ← documents VITE_API_LOG (=false)
├─ .env.development          ← VITE_API_LOG for `npm run dev`
├─ .env.production           ← VITE_API_LOG=false for `npm run build` (belt-and-braces)
└─ logs/                     ← output goes here; git-ignored
   ├─ README.md              ← short pointer to this document (the one file in logs/ that IS committed)
   └─ api/                   ← created on first write
      ├─ session-<timestamp>.ndjson
      └─ <timestamp>__<METHOD>__<path>.json   (one per call)
```

### `logs/` — the folder

- **Why a dedicated top-level folder:** output that is generated, machine-local,
  and potentially large should never sit among source files. A single well-known
  location is easy to find, easy to clear, and easy to ignore in one line.
- **Why git-ignored:** these files are a local byproduct of *your* session. They
  can be large, they change every run, and a response body may contain data you
  would not want in version control. `.gitignore` already had `logs`; we added
  `!logs/README.md` so the explanation travels with the repo but nothing else in
  the folder does.

### `logs/README.md` — the one committed file

A short orientation note for anyone who opens the folder, pointing here. It is
the exception in `.gitignore` so the folder's purpose is discoverable from a
fresh clone even though the folder is otherwise empty.

### `logs/api/` — the subfolder

Namespaced under `api/` so that if we ever add other local capture (e.g.
`logs/render/`, `logs/perf/`) they don't collide. Created lazily by the dev
middleware the first time a record arrives (`mkdirSync(..., { recursive: true })`).

### `logs/api/session-<timestamp>.ndjson` — the stream

- **One file per dev-server run.** The timestamp in the name is the moment the
  server started. Restart `npm run dev`, get a new file. This keeps each run's
  traffic together and makes "before vs after" a plain file diff.
- **NDJSON** (newline-delimited JSON — one complete JSON object per line, no
  enclosing array). Chosen because:
  - It is **append-only**. Each call does one `appendFileSync` of one line. No
    read-modify-write, no risk of corrupting earlier entries, no growing
    in-memory array.
  - It **streams**. `tail -f logs/api/session-*.ndjson` shows calls live as you
    click around the app.
  - Every line-oriented tool works: `grep`, `wc -l` (call count), `jq -c`,
    `sort`.
- **Example — the five slowest calls this session:**
  ```bash
  jq -s 'sort_by(-.durationMs) | .[:5] | .[] | {path, durationMs, status}' \
    logs/api/session-*.ndjson
  ```

### `logs/api/<timestamp>__<METHOD>__<path>.json` — one pretty file per call

- **Why also individual files:** the NDJSON is for scanning; a single call's full
  request+response is far easier to read pretty-printed, and a single file is
  trivial to attach to a bug report or share.
- **Name format:** `<ISO timestamp with : and . replaced by ->`__`<METHOD>`__`<slugified path>.json`
  - Timestamp first → files sort chronologically in any file browser.
  - `:` and `.` are not filename-safe on Windows, so they become `-`.
  - The path is slugified (`[^\w.-]` → `_`, trimmed, capped at 80 chars) so
    `/policy/approvers?lens=ops&incidentId=INC-2261` becomes
    `policy_approvers_lens_ops_incidentId_INC-2261`.
  - A call to the root becomes `..._root.json`.
- These accumulate. Delete them freely (`rm logs/api/*`); nothing depends on
  their presence.

### `src/api/config.ts` — the flag

Adds one line to the central `apiConfig` object:

```ts
apiLog: readBool(import.meta.env.VITE_API_LOG as string | undefined, false),
```

`config.ts` is already the **single** place the app reads `import.meta.env`.
Keeping this flag there (not scattered in `apiLog.ts`) means every env-driven
switch is in one table, and `readBool` gives it the same `"true"`/`"false"`
parsing and `false` default as the others.

### `src/api/apiLog.ts` — the browser-side sender

Exports `recordApiCall(record)`. Its entire job is to hand one record to the dev
server without ever getting in the app's way.

```ts
export function recordApiCall(rec: ApiLogRecord): void {
  // 1. Dead in production, off by default.
  if (!import.meta.env.DEV || !apiConfig.apiLog) return;
  try {
    const payload = JSON.stringify(rec);
    // 2. sendBeacon: fire-and-forget, survives page unload, never blocks.
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/__apilog', new Blob([payload], { type: 'application/json' }));
    } else if (typeof fetch === 'function') {
      // 3. Fallback for environments without sendBeacon.
      void fetch('/__apilog', { method: 'POST', /* … */ keepalive: true }).catch(() => {});
    }
  } catch {
    // 4. Logging must never break the app.
  }
}
```

Why each choice:

1. **`import.meta.env.DEV` guard first.** Vite replaces `import.meta.env.DEV`
   with the literal `true` (dev) or `false` (build) *at transform time*. In a
   production build the condition becomes `if (!false || …) return;` → the
   function body is unreachable and the minifier deletes it, along with the
   `'/__apilog'` string. This is what makes the client bundle genuinely clean
   rather than merely inactive. `apiConfig.apiLog` is the runtime on/off switch
   for dev.
2. **`navigator.sendBeacon`** is designed exactly for telemetry: the browser
   queues the POST and sends it in the background, it does not return a promise,
   it does not delay anything, and it still goes out if the page is navigating
   away. A response body large enough to exceed the beacon size cap (~64 KB in
   most browsers) is simply dropped — acceptable for a debug aid.
3. **`fetch(..., { keepalive: true })`** is the fallback if `sendBeacon` is
   unavailable. `keepalive` gives it the same "survives unload" property.
4. **`try/catch` around everything, `.catch(() => {})` on the fetch.** A failed
   or missing log sink must be invisible to the user.

The `/__apilog` URL is **relative**, so it always targets the origin the app is
served from — the Vite dev server in dev. In any other context that path 404s
and the beacon result is ignored.

### `src/api/client.ts` — the call site

`client.ts` contains the app's **only** `fetch()` for the API. Every endpoint
function in `src/api/endpoints.ts` goes through its `request()`. That makes it
the one place to instrument. Inside `request()`:

```ts
const startedAt = performance.now();
const durationMs = () => Math.round(performance.now() - startedAt);
const log = (status, ok, responseBody, error?) =>
  recordApiCall({ ts: new Date().toISOString(), method, path, url,
                  lens: currentLens, status, ok, durationMs: durationMs(),
                  requestBody: opts.body, responseBody, error });
```

`log(...)` is then called at each of the four ways a request can end:

| Outcome | `status` | `responseBody` | `error` |
|---|---|---|---|
| 2xx with JSON | real | parsed response JSON | — |
| 204 No Content | 204 | `undefined` | — |
| non-2xx (server said no) | real | parsed error body `{code,message,retryable}` | `body.message` |
| network fail / timeout / abort | 0 | `null` | the reason string |

So the log reflects the truth of the exchange even when the call failed — which
is usually when you need it most.

### `vite.config.ts` — the Node-side writer

A small Vite plugin, `apiLogPlugin`:

```ts
function apiLogPlugin(flag: string | undefined): Plugin {
  const enabled = /^(1|true|yes)$/i.test((flag ?? '').trim());
  return {
    name: 'nehishlens-api-log',
    apply: 'serve',                 // ← dev server only; never part of `vite build`
    configureServer(server) {
      if (!enabled) return;         // ← flag off: no endpoint, no folder, nothing
      // … mkdir logs/api, open the session NDJSON …
      server.middlewares.use('/__apilog', (req, res) => {
        // POST only; read the body; append one NDJSON line; write one pretty .json; 204
      });
    },
  };
}
```

Why it is shaped this way:

- **`apply: 'serve'`** tells Vite to load this plugin **only for the dev
  server**, not for `vite build`. The production build pipeline never sees it, so
  there is no `/__apilog` route and no `fs` code anywhere in `dist/`.
- **`if (!enabled) return;`** inside `configureServer` means that even in dev,
  with the flag off, the middleware is never registered. `POST /__apilog` then
  returns a plain 404. (This is the quick way to tell whether the flag reached
  Vite — see §8.)
- **The flag is read via `loadEnv` / `process.env` in the config**, not
  `import.meta.env` — `vite.config.ts` runs in Node before any bundling, where
  `import.meta.env` does not exist.
- **`appendFileSync` + `writeFileSync`** (synchronous) — request volume in dev is
  tiny (tens of calls), and synchronous writes keep the middleware trivial and
  ordering exact. There is a 5 MB guard on the incoming body to shrug off a
  runaway payload.

### `.env.example` / `.env.development` / `.env.production`

- **`.env.example`** documents the variable with the full explanation and
  `VITE_API_LOG=false`. It is the reference copy; Vite never loads it.
- **`.env.development`** is what `npm run dev` loads. Set `VITE_API_LOG=true`
  here (or, better, in `.env.development.local`, which is git-ignored) when you
  want a trace.
- **`.env.production`** is what `npm run build` loads. It carries an explicit
  `VITE_API_LOG=false`. This is redundant — the `import.meta.env.DEV` guard and
  `apply: 'serve'` already guarantee inertness — but an explicit `false` in the
  file removes all doubt for anyone auditing the config.

---

## 4. End-to-end: what happens on one API call

With `VITE_API_LOG=true` and `npm run dev` running:

1. A screen calls, say, `IncidentsApi.detail('INC-2261')`.
2. That reaches `request()` in `client.ts`, which records `startedAt` and does
   the real `fetch` to `https://mock-api-nehishlens.aminobots.com/api/v1/incidents/INC-2261`.
3. The response arrives (200). `request()` parses the JSON, then calls
   `log(200, true, data)`.
4. `log` builds the record and calls `recordApiCall(record)` in `apiLog.ts`.
5. `recordApiCall` passes both guards (`DEV` is true, `apiConfig.apiLog` is
   true), serialises the record, and `navigator.sendBeacon('/__apilog', …)`.
6. The browser POSTs that JSON to the Vite dev server in the background. The
   screen has already rendered; nothing waited.
7. `apiLogPlugin`'s `/__apilog` middleware reads the body, appends one line to
   `logs/api/session-<ts>.ndjson`, and writes
   `logs/api/2026-08-31T14-09-06-138Z__GET__incidents_INC-2261.json`.
8. Responds `204`. The browser discards the beacon result.

If step 5's guard fails (flag off, or production build), the sequence stops
there and nothing is sent. If step 7 has no middleware (flag never reached
Vite), the POST 404s and the browser ignores it.

---

## 5. The record schema

Every line in the NDJSON and every `.json` file is one of these:

| Field | Type | Meaning |
|---|---|---|
| `ts` | string | ISO-8601 timestamp when the response was handled (client clock). |
| `method` | string | `GET` \| `POST` \| `PATCH`. |
| `path` | string | Path as passed to `api.*`, e.g. `/incidents/INC-2261?stage=acting`. |
| `url` | string | The full absolute URL actually fetched (`apiConfig.baseUrl` + `path`). |
| `lens` | string | The `X-Lens` header sent with the call (`ops` \| `eng` \| `assure` \| `exec`). |
| `status` | number | HTTP status. `0` = the request never got a response (network fail / timeout / abort). |
| `ok` | boolean | `true` for 2xx, `false` otherwise. |
| `durationMs` | number | Wall-clock ms from just before `fetch` to the response being handled. |
| `requestBody` | any \| `undefined` | The body object passed to `api.post`/`api.patch` **before** `JSON.stringify`. `undefined` (key omitted) for GETs. |
| `responseBody` | any \| `null` | Parsed response JSON on success; parsed `{code,message,retryable}` on an HTTP error; `undefined` for 204; `null` for a network failure. |
| `error` | string \| absent | Present only on failure — the server's `message`, or the network/timeout reason. |

---

## 6. Why this is safe to ship to a client — three independent layers

Any **one** of these is enough on its own. All three hold at once.

| # | Mechanism | Guarantees |
|---|---|---|
| 1 | **`VITE_API_LOG` defaults to `false`** (and is `false` in `.env.production`). | Nothing captures unless someone explicitly opts in. |
| 2 | **`import.meta.env.DEV` guard in `apiLog.ts`.** Vite substitutes `false` at build time; the minifier then removes the whole function body and the `'/__apilog'` string. | A production bundle contains **no logging code at all** — verified: the string `__apilog` does not appear in `dist/assets/*.js`, and the bundle is smaller with the guard than without. |
| 3 | **`apply: 'serve'` on the Vite plugin.** | The writer is attached to the **dev server only**. `vite build` never loads the plugin, so a deployed app has no `/__apilog` route and no filesystem code. Even hitting that path manually on a deployed host returns 404. |

Net: to a client deployment this feature is not "disabled", it is **absent**.

---

## 7. Turning it on (development)

```dotenv
# .env.development.local   (preferred — git-ignored, personal)
#   ...or edit .env.development directly
VITE_API_LOG=true
```

Then **fully restart** the dev server (stop with Ctrl+C, then `npm run dev` —
saving the file alone is not always enough), and **hard-refresh** the browser
(Ctrl+Shift+R) so the tab drops the cached modules.

Confirmation the flag reached Vite — the startup banner gains a line:

```
  ➜  API log:  logs/api/session-2026-08-31T14-07-48-659Z.ndjson
  ➜  Local:   http://localhost:5173/
```

Accepted truthy values: `1`, `true`, `yes` (case-insensitive). Anything else is
off.

---

## 8. Turning it off

- Set `VITE_API_LOG=false` (or delete the line) and restart `npm run dev`.
- For a client / production build: nothing to do — see §6. Leaving the flag
  `true` in `.env.development` has no effect on `npm run build`, which loads
  `.env.production`.
- To clear captured data: `rm logs/api/*` or delete the `logs/api/` folder.

---

## 9. Reading the logs

```bash
# live tail while you click around
tail -f logs/api/session-*.ndjson

# every non-2xx call this session
grep -E '"ok":false' logs/api/session-*.ndjson | jq -c '{path, status, error}'

# call count and total time
jq -s '{calls: length, totalMs: (map(.durationMs) | add)}' logs/api/session-*.ndjson

# the full request+response for one call — just open the file
code logs/api/2026-08-31T14-09-06-138Z__GET__incidents_INC-2261.json

# diff two runs (keep the earlier session file under a new name first)
diff <(jq -S . good.ndjson) <(jq -S . logs/api/session-*.ndjson)
```

---

## 10. Limitations and gotchas

- **Dev only, by design.** There is no production traffic capture here. If you
  need that, it belongs server-side, behind auth, with retention rules — a
  different tool.
- **`sendBeacon` size cap.** A response body over ~64 KB may be dropped by the
  browser (the beacon returns `false`, silently). Rare with this API; the
  `.ndjson` will simply be missing that one line. The `fetch` fallback path is
  not size-limited.
- **Headers are not captured** beyond `lens` — no `Authorization`, no cookies.
  That is deliberate: fewer secrets on disk. (This API uses no auth anyway.)
- **Response bodies are stored verbatim.** If you point the app at a backend
  whose responses contain sensitive data, treat `logs/api/` accordingly — it is
  git-ignored, but it is plaintext on your disk. Clear it when done.
- **Clock is the browser's**, so `ts` and `durationMs` are as accurate as
  `performance.now()` in the tab — fine for relative comparisons, not a
  benchmark harness.
- **One session file per server start.** If you `npm run dev` many times you
  accumulate `session-*.ndjson` files; clear them periodically.

---

## 11. Troubleshooting — "I enabled it but no files appear"

Work down this list:

1. **Restart the dev server fully.** Ctrl+C, then `npm run dev`. A file save
   does not always re-trigger the plugin.
2. **Check the startup banner** for the `➜  API log:  logs/api/session-….ndjson`
   line. If it is missing, the flag did not reach Vite:
   - You are running from the wrong directory. It must be
     `D:\Nehishlens\nehishlens-frontend`, not `D:\Nehishlens`.
   - The value is not truthy (`1` / `true` / `yes`).
3. **Hard-refresh the browser** (Ctrl+Shift+R). The tab caches
   `apiLog.ts` / `config.ts`; a soft refresh keeps the old (disabled) copy.
4. **Probe the middleware directly** (dev server running):
   ```bash
   curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:5173/__apilog \
     -H 'Content-Type: application/json' \
     -d '{"ts":"x","method":"GET","path":"/probe","status":200,"ok":true,"durationMs":1}'
   ```
   - `204` and a new `logs/api/x__GET__probe.json` → the writer is fine; your
     problem is the browser bundle (redo step 3).
   - `404` → the plugin is not enabled; the flag did not reach Vite (redo
     steps 1–2).
5. **Look in the right folder:** `nehishlens-frontend/logs/api/`, not any
   `logs/` higher up the tree.
6. **You are on a screen that makes no calls** (e.g. the login screen). Navigate
   to Today or Incidents and watch the NDJSON.
