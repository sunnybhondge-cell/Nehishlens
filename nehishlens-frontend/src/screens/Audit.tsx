import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { AuditApi, type AuditEntry, type AuditFilters } from '../api/endpoints';
import type { ApiError } from '../api/client';
import { useHydrated } from '../hooks/useHydrated';
import { useAuth } from '../context/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, PanelHead, QueryState, TableRowsState } from '../components/ui';

/** Short hash prefix used in links — GET /audit/{entry_hash} accepts a prefix. */
const short = (hash: string) => hash.slice(0, 8);

/** Date inputs give local days; the API wants inclusive ISO timestamps. */
function dayBound(day: string, end: boolean): string | undefined {
  if (!day) return undefined;
  const d = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00'}`);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

/**
 * Screen 4 · Audit & Evidence — hash-chained trail + the three pack claims.
 * The trail is never filtered per user (a filtered chain cannot be verified):
 * search narrows what is shown, the integrity claim always walks the whole chain.
 * Filters live in the query string and the open entry in the path
 * (#/audit/{hash}), so both can be sent to someone as a link.
 */
export function Audit() {
  const { hash } = useParams<{ hash: string }>();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const qs = search.toString() ? `?${search}` : '';

  const kindParam = search.get('kind');
  const filters: AuditFilters = {
    q: search.get('q') ?? undefined,
    actor: search.get('actor') ?? undefined,
    kind: kindParam === 'ai' || kindParam === 'human' ? kindParam : undefined,
    from: dayBound(search.get('from') ?? '', false),
    to: dayBound(search.get('to') ?? '', true),
  };
  const filtered = Object.values(filters).some(Boolean);

  const trail = useInfiniteQuery({
    queryKey: ['audit', filters],
    queryFn: ({ pageParam }) => AuditApi.search(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.cursor ?? undefined,
  });
  const rows = trail.data?.pages.flatMap((p) => p.items);
  const total = trail.data?.pages[0]?.total;
  const verify = useHydrated(['audit-verify'], AuditApi.verify);
  const canBuildPacks = useAuth().user?.permissions.includes('pack:create') ?? false;

  const setFilters = (changes: Record<string, string>) => {
    const next = new URLSearchParams(search);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    setSearch(next, { replace: true });
  };

  return (
    <div className="stack">
      <ScreenHeader title="Audit & Evidence" crumb="Assurance" subtitle="hash-chained trail" />
      <Trace>Three claims kept separate, never merged into one tick.</Trace>

      <div className="g21">
        <div>
          <AuditFilterBar search={search} setFilters={setFilters} clear={() => setSearch({}, { replace: true })} />

          {hash && <AuditEntryPanel hash={hash} qs={qs} onClose={() => navigate(`/audit${qs}`)} />}

          {filtered && (
            <div className="note" style={{ margin: '0 0 12px' }}>
              Showing {total ?? rows?.length ?? '…'} matching {total === 1 ? 'entry' : 'entries'}. A filtered slice is not
              chain-verifiable on its own; the integrity claim on the right always walks the whole chain.
            </div>
          )}

          <div className="tbl">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Actor</th>
                  <th>Action</th>
                  <th>Kind</th>
                  <th>Target</th>
                  <th>Hash</th>
                </tr>
              </thead>
              <tbody>
                <TableRowsState
                  q={{ data: rows, isLoading: trail.isLoading, error: (trail.error as ApiError | null) ?? null }}
                  what="the audit trail"
                  cols={6}
                >
                  {(list) =>
                    list.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          {filtered ? (
                            // A search with no hits is not an empty trail — say which one this is.
                            <>
                              No entries match this search. Nothing was removed from the trail; only what is shown
                              is narrowed.{' '}
                              <button type="button" className="btn btn-s btn-q" onClick={() => setSearch({}, { replace: true })}>
                                Clear filters
                              </button>
                            </>
                          ) : (
                            'The trail is empty — nothing has been recorded yet.'
                          )}
                        </td>
                      </tr>
                    ) : (
                      <>
                        {list.map((e) => (
                          <AuditRow
                            key={e.hash}
                            entry={e}
                            selected={!!hash && e.hash.startsWith(hash)}
                            onOpen={() => navigate(`/audit/${short(e.hash)}${qs}`)}
                          />
                        ))}
                      </>
                    )
                  }
                </TableRowsState>
              </tbody>
            </table>
          </div>
          {trail.hasNextPage && (
            <button
              type="button"
              className="btn btn-s"
              style={{ marginTop: 8 }}
              disabled={trail.isFetchingNextPage}
              onClick={() => void trail.fetchNextPage()}
            >
              {trail.isFetchingNextPage ? 'Loading…' : 'Load more'}
            </button>
          )}
          <div className="note" style={{ marginTop: 12 }}>
            Open a row for the full entry (<span className="mono">GET /audit/&#123;hash&#125;</span>) — its address is a
            link you can send. AI refusals are ordinary rows here (kind <span className="mono">ai</span>). The trail is
            append-only and hash-chained; the integrity claim on the right is a server fact from{' '}
            <span className="mono">/audit/verify</span>.
          </div>
        </div>

        <div className="panel">
          <PanelHead label="Evidence pack — current scope" />
          <QueryState q={verify} what="the chain verification" skeletonLines={3}>
            {(v) => (
              <>
                <div className="claim">
                  <span className={`pip ${v.intact ? 'p-ok' : 'p-crit'}`} />
                  <span className="lb">Integrity</span>
                  <span className="mono t-cap">{v.intact ? 'chain intact' : `broken at seq ${v.brokenAtSeq}`}</span>
                </div>
                <div className="claim">
                  <span className={`pip ${v.intact ? 'p-ok' : 'p-crit'}`} />
                  <span className="lb">Continuity</span>
                  <span className="mono t-cap">
                    {v.intact ? `${v.length} rows, no gaps` : `rows after seq ${v.brokenAtSeq} unverified`}
                  </span>
                </div>
                <div className="claim" style={{ borderColor: 'rgba(245,184,61,.35)' }}>
                  <span className="pip p-warn" />
                  <span className="lb">Coverage</span>
                  <span className="mono t-cap">declared per feed health</span>
                </div>
                <div style={{ marginTop: 12 }}>
                  <Link className={`btn btn-s ${canBuildPacks ? 'btn-p' : ''}`} to="/audit/packs/new">
                    Open evidence-pack builder →
                  </Link>
                  {!canBuildPacks && (
                    // Visible for every lens — permissions are never enforced by hiding.
                    <p className="t-cap" style={{ marginTop: 6 }}>
                      Building a pack is restricted to the Assurance lens (pack:create). Your account can read the trail
                      but not build or export a pack.
                    </p>
                  )}
                </div>
              </>
            )}
          </QueryState>
        </div>
      </div>
    </div>
  );
}

/**
 * Text inputs commit on submit (Enter / Search) rather than per keystroke;
 * kind and dates apply immediately.
 */
function AuditFilterBar({
  search,
  setFilters,
  clear,
}: {
  search: URLSearchParams;
  setFilters: (changes: Record<string, string>) => void;
  clear: () => void;
}) {
  const setFilter = (key: string, value: string) => setFilters({ [key]: value });
  const [q, setQ] = useState(search.get('q') ?? '');
  const [actor, setActor] = useState(search.get('actor') ?? '');
  // Re-seed the drafts when the URL changes underneath (Clear, back/forward, a pasted link).
  const [seen, setSeen] = useState(search.toString());
  if (seen !== search.toString()) {
    setSeen(search.toString());
    setQ(search.get('q') ?? '');
    setActor(search.get('actor') ?? '');
  }

  return (
    <form
      role="search"
      aria-label="Search the audit trail"
      className="audit-filters"
      onSubmit={(e) => {
        e.preventDefault();
        setFilters({ q: q.trim(), actor: actor.trim() });
      }}
    >
      <div className="af-search">
        <label className="af-field">
          <span>Search actor, action, target</span>
          <input
            className="cin"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. pack.exported, INC-2261"
          />
        </label>
        <button type="submit" className="btn btn-p">
          Search
        </button>
        {search.toString() && (
          <button type="button" className="btn btn-q" onClick={clear}>
            Clear
          </button>
        )}
      </div>
      <label className="af-field">
        <span>Actor</span>
        <input className="cin" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="e.g. r.edwards" />
      </label>
      <label className="af-field">
        <span>Kind</span>
        <select className="sel" value={search.get('kind') ?? ''} onChange={(e) => setFilter('kind', e.target.value)}>
          <option value="">All</option>
          <option value="human">Human</option>
          <option value="ai">AI</option>
        </select>
      </label>
      <label className="af-field">
        <span>From</span>
        <input className="cin" type="date" value={search.get('from') ?? ''} onChange={(e) => setFilter('from', e.target.value)} />
      </label>
      <label className="af-field">
        <span>To</span>
        <input className="cin" type="date" value={search.get('to') ?? ''} onChange={(e) => setFilter('to', e.target.value)} />
      </label>
    </form>
  );
}

/** Deep-linkable detail for #/audit/{hash}; the hash may be a prefix. */
function AuditEntryPanel({ hash, qs, onClose }: { hash: string; qs: string; onClose: () => void }) {
  const entry = useQuery<AuditEntry, ApiError>({
    queryKey: ['audit-entry', hash],
    queryFn: () => AuditApi.byHash(hash),
  });
  const [copied, setCopied] = useState(false);

  return (
    <div className="panel" style={{ marginBottom: 12 }}>
      <PanelHead label={`Audit entry · ${hash}`} />
      {entry.isLoading && <span className="muted">Loading entry…</span>}
      {entry.error && <ApiErrorBanner error={entry.error} what="the audit entry" />}
      {entry.data && (
        <>
          {[
            ['Seq', String(entry.data.seq)],
            ['At', entry.data.at],
            ['Actor', entry.data.actor],
            ['Kind', entry.data.actorKind],
            ['Action', entry.data.verb],
            ['Target', entry.data.object],
          ].map(([k, v]) => (
            <div className="kv" key={k}>
              <div className="k">{k}</div>
              <div className="v mono">{v}</div>
            </div>
          ))}
          <div className="kv">
            <div className="k">Previous hash</div>
            <div className="v mono wrap-anywhere">
              {entry.data.prevHash ? <Link to={`/audit/${short(entry.data.prevHash)}${qs}`}>{entry.data.prevHash}</Link> : '— (genesis)'}
            </div>
          </div>
          <div className="kv">
            <div className="k">Hash</div>
            <div className="v mono wrap-anywhere">{entry.data.hash}</div>
          </div>
          <div className="t-cap" style={{ marginTop: 8 }}>Payload</div>
          <pre className="mono t-cap wrap-anywhere" style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>
            {JSON.stringify(entry.data.payload ?? {}, null, 2)}
          </pre>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button
          type="button"
          className="btn btn-s"
          onClick={() => {
            // Link without the filters: the entry stands on its own.
            const url = `${location.origin}${location.pathname}#/audit/${entry.data ? short(entry.data.hash) : hash}`;
            void navigator.clipboard?.writeText(url).then(() => setCopied(true));
          }}
        >
          {copied ? 'Link copied' : 'Copy link'}
        </button>
        <button type="button" className="btn btn-s btn-q" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}

function AuditRow({ entry, selected, onOpen }: { entry: AuditEntry; selected: boolean; onOpen: () => void }) {
  return (
    <tr
      className="linkrow"
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen();
        }
      }}
      tabIndex={0}
      aria-current={selected || undefined}
      style={selected ? { background: 'var(--raised)' } : undefined}
    >
      <td className="mono">{new Date(entry.at).toLocaleString()}</td>
      <td>
        <b>{entry.actor}</b>
      </td>
      <td className="mono">{entry.verb}</td>
      <td className="mono">{entry.actorKind}</td>
      <td className="mono">{entry.object}</td>
      <td className="mono" style={{ color: 'var(--ok)' }}>
        {short(entry.hash)}…
      </td>
    </tr>
  );
}
