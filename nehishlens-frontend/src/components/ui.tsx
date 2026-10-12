import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ApiError } from '../api/client';
import { STAGES, STAGE_LABEL, type Citation, type Confidence, type Stage } from '../api/endpoints';
import { ApiErrorBanner } from './ApiErrorBanner';
import { useCitationIndex } from '../hooks/useCitations';
import { appRoute } from '../lib/appRoute';

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

/**
 * CR-02: a citation chip must resolve to the source it names. A chip with a
 * `target`, or a label the /citations index resolves, is a real link
 * (`.cite-src`); anything else stays flat and says why (`.cite-derived`) —
 * silence would imply a source that isn't there.
 */
export function Cite({ citation }: { citation: Citation }) {
  const index = useCitationIndex();
  if (citation.target) {
    return (
      <Link className="cite cite-src" to={appRoute(citation.target)}>
        {citation.label}
      </Link>
    );
  }
  // Label-only chips (e.g. resolution citations) resolve against the /citations index.
  const resolved = { ...index?.get(citation.label), ...citation };
  if (resolved.resolvable !== false && resolved.sourceId) {
    const where = [resolved.sourceTitle, resolved.unitRef, resolved.unitTitle].filter(Boolean).join(' · ');
    const title = `${where} — open source detail`;
    return (
      <Link
        className="cite cite-src"
        to={`/sources/${encodeURIComponent(resolved.sourceId)}`}
        title={title}
        aria-label={`${citation.label} — ${title}`}
      >
        {citation.label}
      </Link>
    );
  }
  return (
    <span
      className="cite cite-derived"
      title="Derived value, not a separately ingested source — nothing to open."
      aria-label={`${citation.label} — derived value, not an ingested source`}
    >
      {citation.label}
    </span>
  );
}

/** CR-06: line-drawn check icon — the product uses line icons only, no glyphs. */
export function CheckIcon() {
  return (
    <svg className="ico-check" viewBox="0 0 16 16" width="12" height="12" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * CR-01: compact loop indicator for card-size surfaces. Same dot language as
 * the incident stepper, plus a one-word stage caption. Not interactive.
 * `stage == null` means the card is not a loop object (a trend, a metric) —
 * stated in words rather than faked as a stage.
 */
export function LoopIndicator({ stage }: { stage: Stage | null | undefined }) {
  const idx = stage ? STAGES.indexOf(stage) : -1;
  if (idx === -1) {
    return (
      <span className="loop-c is-na" role="img" aria-label="Not a tracked loop item">
        <span className="loop-dots">
          {STAGES.map((s) => <i key={s} />)}
        </span>
        <span className="loop-lbl">Not a loop item</span>
      </span>
    );
  }
  const name = STAGE_LABEL[stage!] ?? stage;
  const label = `Loop stage ${idx + 1} of ${STAGES.length}: ${name}`;
  return (
    <span className="loop-c" role="img" aria-label={label} title={label}>
      <span className="loop-dots">
        {STAGES.map((s, i) => <i key={s} className={i < idx ? 'd' : i === idx ? 'a' : ''} />)}
      </span>
      <span className="loop-lbl">{name}</span>
    </span>
  );
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
