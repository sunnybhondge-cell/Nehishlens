import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../api/client';
import type { Citation, Confidence } from '../api/endpoints';
import { ApiErrorBanner } from './ApiErrorBanner';

/** `.trace` editorial strip from the prototype — provenance, not data. */
export function Trace({ children }: { children: ReactNode }) {
  return <div className="trace">{children}</div>;
}

export function PanelHead({
  label,
  chip,
  children,
}: {
  label: ReactNode;
  chip?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="ph">
      <span className="t-label">{label}</span>
      {children}
      {chip != null && <span className="chip">{chip}</span>}
    </div>
  );
}

const CONF_CLASS: Record<string, string> = {
  grounded: 'c-g',
  partial: 'c-p',
  ungrounded: 'c-u',
  refused: 'c-u',
};
const CONF_LABEL: Record<string, string> = {
  grounded: '● Grounded',
  partial: '◐ Partial — verify',
  ungrounded: '○ Ungrounded',
  refused: '○ Refused',
};

export function Conf({ value, pct }: { value: Confidence; pct?: number | null }) {
  const cls = CONF_CLASS[value] ?? 'c-u';
  const label = CONF_LABEL[value] ?? value;
  return (
    <span className={`conf ${cls}`}>
      {label}
      {typeof pct === 'number' ? ` · ${pct}%` : ''}
    </span>
  );
}

export function Sev({ value }: { value: string }) {
  const cls = value === 'crit' ? 'crit' : value === 'warn' ? 'warn' : '';
  return <span className={`sev ${cls}`}>{value}</span>;
}

/** Renders a citation as an internal link when it carries a hash `target`. */
export function Cite({ citation }: { citation: Citation }) {
  if (citation.target) {
    return (
      <Link className="cite" to={`/${citation.target.replace(/^\/+/, '')}`}>
        {citation.label}
      </Link>
    );
  }
  return <span className="cite">{citation.label}</span>;
}

export function CiteRow({ citations }: { citations?: Citation[] }) {
  if (!citations || citations.length === 0) return null;
  return (
    <div className="crow">
      {citations.map((c, i) => (
        <Cite key={c.id ?? c.label ?? i} citation={c} />
      ))}
    </div>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="skel skel-line" style={{ width: `${90 - i * 12}%` }} />
      ))}
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <b>{title}</b>
      {children}
    </div>
  );
}

interface QueryLike<T> {
  data: T | undefined;
  isLoading: boolean;
  error: ApiError | null;
  isFixture?: boolean;
}

/**
 * Standard fragment states: skeleton while loading, server's own message on
 * error (wiring guide rule 1), children once data is present. No fixture text
 * is ever shown — this build is live-data-only.
 */
export function QueryState<T>({
  q,
  what,
  skeletonLines = 3,
  children,
}: {
  q: QueryLike<T>;
  what: string;
  skeletonLines?: number;
  children: (data: T) => ReactNode;
}) {
  if (q.error) return <ApiErrorBanner error={q.error} what={what} />;
  if (q.isLoading || q.data === undefined) return <Skeleton lines={skeletonLines} />;
  return <>{children(q.data)}</>;
}

/** Same as QueryState, but the loading/error fallback is a table row so it can
 *  live directly inside a `<tbody>` without invalid nesting. */
export function TableRowsState<T>({
  q,
  what,
  cols,
  children,
}: {
  q: QueryLike<T>;
  what: string;
  cols: number;
  children: (data: T) => ReactNode;
}) {
  if (q.error)
    return (
      <tr>
        <td colSpan={cols}>
          <ApiErrorBanner error={q.error} what={what} />
        </td>
      </tr>
    );
  if (q.isLoading || q.data === undefined)
    return (
      <tr>
        <td colSpan={cols} className="muted">
          Loading…
        </td>
      </tr>
    );
  return <>{children(q.data)}</>;
}
