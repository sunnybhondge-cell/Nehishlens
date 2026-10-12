# API request — incident sorting fields

**For:** NehishLens API / backend team
**From:** Frontend (Incidents screen, `GET /api/v1/incidents`)
**Status:** frontend sorting is live using workarounds; these changes make it exact.

## Context

The Incidents screen now sorts by **Priority**, **SLA due** and **Date opened**.
`GET /incidents` has no sort parameter, so the frontend sorts the list itself. That
works today, but two of the three keys are parsed from display strings:

| Field today | Example values | Problem |
|---|---|---|
| `slaAt` | `"13:14"`, `"BOD 06:00"`, `"—"` | Time of day only, no date. The frontend guesses the deadline is the first occurrence of that time after `openedAt`. Wrong for any SLA more than 24h out, and the format mixes labels (`BOD`) with times. |
| `openedAt` | `"28 Jul 2026 · 09:14:02"` | Display text, no timezone. The frontend parses this exact format; any wording change breaks the sort silently. |
| `severity` | `"crit"`, `"warn"`, `"info"` | Used as priority. Fine if severity *is* priority. If not, there is no priority field. |

## Requested changes

Keep the existing display fields as they are. Add the following to each item in
`GET /incidents` (and `GET /incidents/{id}`, and the `incident` in the `POST /incidents` response).

### 1. `slaDueAt` — required for correct SLA sorting

```json
"slaDueAt": "2026-07-28T13:14:00+05:30"
```

- ISO 8601 with offset; the absolute deadline instant.
- `null` when the incident has no SLA (today's `"—"`).
- `slaAt` stays as the display label (`"BOD 06:00"` etc.).

### 2. `openedAtIso` — required for reliable date sorting

```json
"openedAtIso": "2026-07-28T09:14:02+05:30"
```

- ISO 8601 with offset. `openedAt` stays as the display string.
- (If you'd rather change `openedAt` itself to ISO, tell us — the frontend formats it.)

### 3. `priority` — only if priority ≠ severity

```json
"priority": 1
```

- Integer, **1 = most urgent**. Omit the field entirely if severity is the priority.
- Please confirm either way: *is severity the business priority?*

### 4. `sort` query parameter — needed once the list paginates

```
GET /incidents?sort=sla           ascending by slaDueAt
GET /incidents?sort=-opened       newest first
GET /incidents?sort=priority,sla  priority, then SLA as tie-break
```

- Keys: `priority`, `sla`, `opened`; `-` prefix = descending; comma = tie-breaks.
- Rows with `slaDueAt: null` sort last regardless of direction.
- Unknown key → `422` with the allowed keys named in `message` (same style as `illegal_transition`).
- Must combine with the existing `stage` filter and `cursor` pagination.

Today the list returns everything in one page (`cursor: null`), so frontend sorting is
exact. Once `cursor` is non-null, the frontend can only sort the loaded page — at that
point (4) is required, not optional.

## Example item after the change

```json
{
  "id": "INC-2261",
  "severity": "crit",
  "slaAt": "13:14",
  "slaDueAt": "2026-07-28T13:14:00+05:30",
  "openedAt": "28 Jul 2026 · 09:14:02",
  "openedAtIso": "2026-07-28T09:14:02+05:30",
  "stage": "acted"
}
```

## Frontend impact

None needed when these ship — `src/lib/incidentSort.ts` already reads `slaDueAt`,
`openedAtIso` and `priority` when present and falls back to parsing otherwise. The
"SLA order is inferred" notice on the Incidents screen disappears once `slaDueAt` is sent.

## Priority order

1. `slaDueAt` — SLA order can be wrong today.
2. `openedAtIso` — works today, but fragile.
3. Answer on priority vs severity.
4. `sort` param — before pagination is turned on.
