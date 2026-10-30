# Pending items — after Open Queries v1.1

What is still open after Nehish's answers in `Open-Queries-v1.1-answered.docx`
(30 Oct 2026) and the frontend work that followed it. Four groups: what we owe
Nehish, what Nehish owes us, frontend work, and where the mock does not yet do
what the document says.

Status as of 30 Oct 2026. Strike an item through or delete it when it closes.

## Already done (for reference)

| Query | What changed | Where |
|---|---|---|
| D1 Authentication | Real sign-in (`POST /auth/login`); lens comes from the server, never chosen in the UI; bearer token on every call, **no `X-Lens` sent**; single-use refresh shared across concurrent 401s; sign-out calls `/auth/logout`; tokens in memory only | `src/api/client.ts`, `src/context/AuthContext.tsx`, `src/screens/Login.tsx`, `src/components/Topbar.tsx` |
| A1 Evidence-pack builder | Four steps wired to `/packs/preview`, `POST /packs`, `GET /packs/{id}` (polled while `building`), `GET /packs`; each gap must be acknowledged; confirmation links to the `pack.exported` audit row; entry point stays visible for every lens with the rule in writing | `src/screens/PackBuilder.tsx`, `src/screens/Audit.tsx` |
| A2 Audit rows clickable | Detail panel deep-linkable at `#/audit/{hash}`; previous-hash link; copy link | `src/screens/Audit.tsx` |
| A3 Not filtered per user | No per-user filter; AI rows not filtered out | — |
| A5 Audit search | `q`, `actor`, `kind`, `from`, `to`, `cursor`; filters in the URL; "no match" ≠ "empty trail"; note that a filtered slice is not chain-verifiable | `src/screens/Audit.tsx` |
| C1 No write to bank | No execute path exists; nothing to change | — |
| C2 Observe incident | Behind `VITE_DEV_TOOLS` (on under `npm run dev`, off in builds) | `src/screens/Incidents.tsx`, `src/api/config.ts` |
| DB console | Schema search, object view (masked columns, `notConfirmed`), audited read-only query runner, signed investigation | `src/screens/DbConsole.tsx` |
| Approver | Removed the silent fallback to the first approver candidate | `src/screens/IncidentDetail.tsx` |

## 1. Replies we owe Nehish

| # | Item | Suggested answer |
|---|---|---|
| 1.1 | **A4 pivot view** — send a sketch, or confirm filtering is enough | Confirm that filtering by actor, kind and date (now built) is sufficient. |
| 1.2 | **C2** — confirm Observe-incident sits behind a dev flag | Confirm: it is behind `VITE_DEV_TOOLS`, off in production builds. |
| 1.3 | **Token storage** — their recommendation: refresh token in an `httpOnly; Secure; SameSite=Strict` cookie, access token in memory | Needs a decision on our side first (see 3.1). A browser-only app cannot set an httpOnly cookie — either their auth service sets it on `/auth/login` + `/auth/refresh`, or we add a small server (BFF) in front. Raise before the security review, as they asked. |
| 1.4 | **Mock deviations** (section 4) | Send the list so they can fix the mock or correct the document. |

## 2. Waiting on Nehish

| # | Item | Blocks |
|---|---|---|
| 2.1 | Session lifetime and idle timeout | Idle sign-out / "session ending" UX (3.3) |
| 2.2 | Whether concurrent sessions per user are allowed | Behaviour when the same user signs in twice |
| 2.3 | Pack scope **Systems** — the allowed values (schema just says string, default `all`) | Systems selector, currently fixed to "All systems" |
| 2.4 | Pack scope **range = `custom`** — the schema allows it but has no date fields | Custom date range in the pack builder |
| 2.5 | Fixes for the mock deviations in section 4 | Pack download, audit paging, etc. |

## 3. Frontend work still to do

| # | Item | Notes |
|---|---|---|
| 3.1 | **Token storage model** | Today both tokens are in memory only, so a page reload signs the user out. Implement whatever 1.3 settles (cookie set by their service, or a BFF). |
| 3.2 | **Maker-checker under real sign-in** | Incident detail still proposes *and* approves from one session, sending the dropdown's approver id. With tokens the checker should sign in as themselves (e.g. `vishal.d` proposes, `r.edwards` approves). Rework the approve step to act as the signed-in user, and render `422 maker_is_checker` / `403` from the server rather than pre-filtering. Show the receipt for a failed outcome and the regression to *understood*. |
| 3.3 | Idle timeout / session-ending message | After 2.1. Refresh already happens ahead of expiry and on 401. |
| 3.4 | **Use `permissions[]` from the token** | The rail and read-only rules (`src/nav.ts`) are still lens-based. The token now carries grants (`action:propose`, `action:approve`, `pack:create`, `db:investigate`…); drive write controls from those. Only the pack-builder entry point does so today. |
| 3.5 | **EOD stage rows (B1)** | Stage rows are still clickable to open a focus panel. Nehish asked for name, expected, actual, deviation and state rendered inline instead. Summary tiles (B2) are not clickable — no change. |
| 3.6 | Update `scripts/check-api.mjs` and `scripts/check-endpoints.mjs` | Both still call with `X-Lens` only and don't cover auth, packs or DB. Switch them to sign in and send a bearer token; add the new groups. Nehish's own `check-api.sh` covers them too. |
| 3.7 | Browser walk-through of the new screens | Sign in as each seeded user; audit search + deep link; build a pack end to end; DB console query → investigation. Type-check, lint and build pass, and the auth/refresh logic was tested against the live mock, but the screens have not been clicked through yet. |
| 3.8 | Commit the changes | Not committed yet. |

## 4. Mock deviations to report to Nehish

Observed on `mock-api-nehishlens.aminobots.com`, 30 Oct 2026.

| # | Document says | Mock does |
|---|---|---|
| 4.1 | An expired or invalid token is always a 401 | Older endpoints (`/incidents`, `/priorities`, `/audit/verify`, …) return 200 with a bogus token. Only the new groups (`/packs`, `/db/*`, `/auth/me`) return 401. |
| 4.2 | With a bearer token, the lens comes from the token and `X-Lens` is ignored | On older endpoints `X-Lens` **overrides** the token's lens (e.g. `vishal.d` + `X-Lens: eng` can read the Engineering-only sanctions source). The frontend no longer sends `X-Lens`, so it is not affected. |
| 4.3 | Export a ready pack | `downloadUrl` (`/api/v1/packs/{id}/download`) returns 404 and is not in the OpenAPI spec. |
| 4.4 | `GET /audit` supports `cursor` paging | `cursor` is always `null`, even when `total` exceeds `limit`. |
| 4.5 | `POST /db/query` runs the statement | Returns the same canned rows for any SELECT; `maskedColumns` names a column not in the result. |
| 4.6 | Investigation is attached to a change record | `POST /db/investigations` accepts an empty `changeRecord` and an empty query list. |
| 4.7 | — | `STTM_CUST_ACCOUNT` is listed by `/db/schema` but `/db/objects/STTM_CUST_ACCOUNT` returns `404 not_indexed`. |

Test data we left on the shared mock while probing: pack `pack-0001`, investigation
`inv-0002` (empty change record), plus `auth.login` and `db.query` audit rows.
`POST /_reset` clears them, but resets everyone's data.
