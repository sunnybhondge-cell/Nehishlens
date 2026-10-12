# logs/

Local, generated output. **Git-ignored** (`.gitignore` → `logs`, with a single
exception for this file), so nothing here is committed or shipped.

## What lands here

### `logs/api/` — API request/response capture

Written only while `npm run dev` runs **and** `VITE_API_LOG` is truthy
(`1` | `true` | `yes`).

| File | Purpose |
|---|---|
| `session-<timestamp>.ndjson` | one JSON object per line, one line per API call — `tail -f` / `grep` / `jq` this |
| `<timestamp>__<METHOD>__<path>.json` | the same record pretty-printed, one file per call — easy to read or attach to a bug |

Each record carries: `ts, method, path, url, lens, status, ok, durationMs,
requestBody, responseBody, error`.

## Full documentation

**[../docs/API_LOGGING.md](../docs/API_LOGGING.md)** — why the folder and each
file exist, how the data flows from the browser to disk, the record schema, why
it is inert in a client build, how to enable/disable, how to read the logs, and
troubleshooting.

## Quick reference

```bash
# enable: .env.development.local
VITE_API_LOG=true            # then fully restart `npm run dev`, hard-refresh the browser

# read
tail -f logs/api/session-*.ndjson

# clear
rm logs/api/*
```

Turning it off: set `VITE_API_LOG=false` (or remove the line) and restart. A
production build (`npm run build`) ignores the flag entirely — the capture code
is compiled out and the receiving endpoint does not exist. See the full doc.
