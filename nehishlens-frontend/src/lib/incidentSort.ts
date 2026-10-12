import type { IncidentSummary } from '../api/endpoints';

/**
 * Client-side ordering for the Incidents list. `GET /incidents` has no sort
 * parameter and returns the whole queue in one page, so sorting here is exact
 * today. Two of the three keys are parsed from display strings — see the
 * "Incident sorting" entry in docs/API_WIRING.md for the fields requested from
 * the backend. When those fields arrive, the `?? parse…` fallbacks below stop
 * being used and nothing else changes.
 */

export type SortKey = 'priority' | 'sla' | 'opened';
export type SortDir = 'asc' | 'desc';

export const SORT_LABEL: Record<SortKey, string> = {
  priority: 'Priority',
  sla: 'SLA due',
  opened: 'Date opened',
};

/** Natural direction per key: most urgent / soonest / newest first. */
export const DEFAULT_DIR: Record<SortKey, SortDir> = {
  priority: 'asc',
  sla: 'asc',
  opened: 'desc',
};

/** Fields requested from the backend; optional until the API ships them. */
type WithRequestedFields = IncidentSummary & {
  priority?: number;
  slaDueAt?: string | null;
  openedAtIso?: string;
};

const SEVERITY_RANK: Record<string, number> = { crit: 0, warn: 1, info: 2, ok: 3 };
const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/** Lower = more urgent. Uses `priority` if the API sends one, else severity. */
export function priorityRank(i: IncidentSummary): number {
  const p = (i as WithRequestedFields).priority;
  if (typeof p === 'number') return p;
  return SEVERITY_RANK[i.severity] ?? 9;
}

/** `"28 Jul 2026 · 09:14:02"` → epoch ms (local time). NaN if the format changes. */
export function openedAtMs(i: IncidentSummary): number {
  const iso = (i as WithRequestedFields).openedAtIso;
  if (iso) return Date.parse(iso);
  const m = /^(\d{1,2}) (\w{3}) (\d{4}) · (\d{2}):(\d{2})(?::(\d{2}))?$/.exec(i.openedAt ?? '');
  if (!m || MONTHS[m[2]] === undefined) return NaN;
  return new Date(+m[3], MONTHS[m[2]], +m[1], +m[4], +m[5], +(m[6] ?? 0)).getTime();
}

/**
 * SLA deadline as epoch ms. `slaAt` carries only a time of day (`"13:14"`,
 * `"BOD 06:00"`, `"—"`), so the deadline is taken as the first occurrence of
 * that time at or after the incident was opened — opened 01:08 with BOD 06:00
 * is the same morning; opened 23:00 with 03:00 is the next day. No SLA → NaN.
 */
export function slaDueMs(i: IncidentSummary): number {
  const due = (i as WithRequestedFields).slaDueAt;
  if (due) return Date.parse(due);
  const m = /(\d{1,2}):(\d{2})/.exec(i.slaAt ?? '');
  if (!m) return NaN;
  const opened = openedAtMs(i);
  if (Number.isNaN(opened)) return NaN; // no anchor date → can't place it; sinks with the no-SLA rows
  const d = new Date(opened);
  d.setHours(+m[1], +m[2], 0, 0);
  if (d.getTime() < opened) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** True when SLA order is inferred from a time-of-day string rather than a real timestamp. */
export function slaIsInferred(rows: IncidentSummary[]): boolean {
  return rows.some((i) => !(i as WithRequestedFields).slaDueAt && i.slaAt);
}

const KEY_FN: Record<SortKey, (i: IncidentSummary) => number> = {
  priority: priorityRank,
  sla: slaDueMs,
  opened: openedAtMs,
};
/** Tie-breaks: priority → SLA; SLA → priority; opened → priority. */
const TIE: Record<SortKey, SortKey> = { priority: 'sla', sla: 'priority', opened: 'priority' };

function cmp(a: number, b: number, dir: SortDir): number {
  // Missing values (no SLA, unparseable date) always sink to the bottom, whatever the direction.
  const an = Number.isNaN(a);
  const bn = Number.isNaN(b);
  if (an || bn) return an === bn ? 0 : an ? 1 : -1;
  return dir === 'asc' ? a - b : b - a;
}

export function sortIncidents<T extends IncidentSummary>(rows: T[], key: SortKey, dir: SortDir): T[] {
  const tie = TIE[key];
  return [...rows].sort(
    (a, b) =>
      cmp(KEY_FN[key](a), KEY_FN[key](b), dir) ||
      cmp(KEY_FN[tie](a), KEY_FN[tie](b), DEFAULT_DIR[tie]) ||
      a.id.localeCompare(b.id),
  );
}
