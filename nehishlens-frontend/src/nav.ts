import type { Lens } from './api/config';

/**
 * Per-lens menu visibility.
 * `none` = hidden from the rail and route-guarded (deep link → lens landing).
 * `view` = shown, but screens suppress write controls (see `useAccess`).
 * `full` = shown with all actions.
 *
 * Rules (per the latest requirement):
 * - ops / eng / assure: see Cortex and Settings; exec does not.
 * - exec: sees only Today and Corpus (Corpus read-only).
 * - DB Console: engineering only.
 *
 * Rail size per v12 (§6.1 caps it at seven): ops 6, eng 7, assure 6, exec 2.
 * Exec's "Today" renders the Executive preview (see screens/Today.tsx), so
 * `/executive` is a route but not a rail item (CR-05: two destinations).
 */
export const LENS_LABEL: Record<Lens, string> = {
  ops: 'Operations',
  eng: 'Engineering',
  assure: 'Assurance',
  exec: 'Executive',
};

export type Access = 'full' | 'view' | 'none';

export interface NavItem {
  to: string;
  label: string;
  section: 'top' | 'bottom';
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/today', label: 'Today', section: 'top' },
  { to: '/incidents', label: 'Incidents', section: 'top' },
  { to: '/eod', label: 'EOD & Batch', section: 'top' },
  { to: '/audit', label: 'Audit & Evidence', section: 'top' },
  { to: '/corpus', label: 'Corpus', section: 'top' },
  { to: '/db-console', label: 'DB Console', section: 'top' },
  { to: '/settings', label: 'Settings', section: 'bottom' },
];

const ACCESS: Record<string, Record<Lens, Access>> = {
  '/today': { ops: 'full', eng: 'full', assure: 'full', exec: 'full' },
  '/executive': { ops: 'none', eng: 'none', assure: 'none', exec: 'full' },
  '/incidents': { ops: 'full', eng: 'full', assure: 'view', exec: 'none' },
  '/eod': { ops: 'full', eng: 'full', assure: 'view', exec: 'none' },
  '/audit': { ops: 'view', eng: 'view', assure: 'full', exec: 'none' },
  '/corpus': { ops: 'full', eng: 'full', assure: 'view', exec: 'view' },
  '/sources': { ops: 'full', eng: 'full', assure: 'view', exec: 'none' },
  '/db-console': { ops: 'none', eng: 'full', assure: 'none', exec: 'none' },
  '/cortex': { ops: 'full', eng: 'full', assure: 'full', exec: 'none' },
  '/settings': { ops: 'view', eng: 'view', assure: 'view', exec: 'none' },
};

/** The rail section a `to` belongs to (`/incidents/INC-1` → `/incidents`). */
function baseOf(pathname: string): string {
  const seg = '/' + (pathname.replace(/^\/+/, '').split('/')[0] ?? '');
  return seg;
}

export function accessFor(lens: Lens, to: string): Access {
  return ACCESS[baseOf(to)]?.[lens] ?? 'full';
}

export function visibleNavItems(lens: Lens): NavItem[] {
  return NAV_ITEMS.filter((n) => accessFor(lens, n.to) !== 'none');
}

/** Route guard: unknown paths are allowed; known destinations follow the matrix. */
export function isRouteAllowed(lens: Lens, pathname: string): boolean {
  const base = baseOf(pathname);
  if (!(base in ACCESS)) return true;
  return ACCESS[base][lens] !== 'none';
}
