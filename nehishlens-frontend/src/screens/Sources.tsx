import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { SourcesApi, type SourceDetail } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { fetchAllSettled } from '../api/client';
import { useLens } from '../context/LensContext';
import { LENS_LABEL } from '../nav';
import type { Lens } from '../api/config';
import { ScreenHeader } from '../components/ScreenHeader';
import { CorpusTabs } from '../components/CorpusTabs';
import { CheckIcon, PanelHead, QueryState, TableRowsState } from '../components/ui';

/**
 * Screen 5 · Corpus · Sources (CR-02 Knowledge Explorer) — what the system was
 * permitted to read, as opposed to what it concluded. Laid out as the v12
 * catalogue: one table row per source, coverage as a bar, every gap stated
 * with its reason. Read-only for every lens — ingestion is a backend operation.
 *
 * Fans out per-source detail with Promise.allSettled — a single 403 (a
 * lens-denied source such as src-sanctions-ref) is kept in the list and
 * flagged, rather than taking the whole screen down (wiring guide rule 5).
 */

const lensName = (l: string) => LENS_LABEL[l as Lens] ?? l;

function isStale(s: SourceDetail) {
  return s.ingestedDays != null && s.staleAfter != null && s.ingestedDays > s.staleAfter;
}

function coveragePct(s: SourceDetail) {
  if (!s.coverage || !s.coverage.total) return null;
  return Math.round((s.coverage.indexed / s.coverage.total) * 100);
}

function StatusTag({ s, denied }: { s: SourceDetail; denied?: boolean }) {
  if (denied) return <span className="src-tag denied">Restricted</span>;
  if (isStale(s) || s.status === 'stale') return <span className="src-tag stale">Stale</span>;
  if (s.status === 'partial') return <span className="src-tag partial">Partial</span>;
  return (
    <span className="src-tag ok">
      <CheckIcon /> Complete
    </span>
  );
}

function CoverageBar({ pct, large }: { pct: number; large?: boolean }) {
  return (
    <div className={`cov${large ? ' cov-lg' : ''}`}>
      <span className="cov-bar">
        <span style={{ width: `${pct}%` }} />
      </span>
      <span className="mono cov-pct">{pct}%</span>
    </div>
  );
}

/** ops and eng have full read; assure and exec are view only (§6.3 Corpus row). */
function modeFor(lens: Lens) {
  return lens === 'ops' || lens === 'eng' ? 'full' : 'view';
}

export function Sources() {
  const { id } = useParams<{ id: string }>();
  return id ? <SourceDetailView id={id} /> : <SourceList />;
}

function SourceList() {
  const { lens } = useLens();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const q = search.get('q') ?? '';
  // v12 keeps `?state=loading|empty|error` in the URL so those states stay deep-linkable.
  const state = search.get('state') ?? undefined;
  const list = useHydrated(['sources', q, state], () => SourcesApi.list(q || undefined, state));
  const citations = useHydrated(['citations'], () => SourcesApi.citations());
  const [details, setDetails] = useState<Record<string, SourceDetail>>({});

  useEffect(() => {
    if (!list.data || list.data.length === 0) return;
    let cancelled = false;
    fetchAllSettled(list.data.map((s) => SourcesApi.detail(s.id))).then((results) => {
      if (cancelled) return;
      const byId: Record<string, SourceDetail> = {};
      results.forEach((res, i) => {
        const source = list.data![i];
        byId[source.id] =
          res.status === 'fulfilled'
            ? res.value
            : { ...source, denied: true, deniedReason: res.reason.message };
      });
      setDetails(byId);
    });
    return () => {
      cancelled = true;
    };
  }, [list.data]);

  const mode = modeFor(lens);
  const open = (sid: string) => navigate(`/sources/${encodeURIComponent(sid)}`);

  return (
    <div className="stack">
      <ScreenHeader
        title="Corpus"
        crumb={
          <>
            <Link to="/corpus">Corpus</Link> / Sources
          </>
        }
        subtitle="sources · what the system was permitted to read"
      />
      <CorpusTabs active="sources" />

      <div className="note src-mode">
        <b style={{ color: 'var(--text-hi)' }}>
          {LENS_LABEL[lens]} lens · {mode === 'full' ? 'full read' : 'view only'}.
        </b>{' '}
        {mode === 'full'
          ? 'You can open every source listed that your lens is granted.'
          : 'You can read this catalogue but take no action in it.'}{' '}
        No lens uploads, edits or deletes a source — ingestion is a backend operation, so there is
        no action here for any role.
      </div>

      <div className="panel">
        <div className="ph">
          <span className="t-label">Ingested sources</span>
          <span className="t-cap">
            what the AI is permitted to read{list.data ? ` · ${list.data.length} sources` : ''}
          </span>
          <span className="sp" style={{ flex: 1 }} />
          <form
            className="src-find"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              const value = new FormData(e.currentTarget).get('q')?.toString().trim() ?? '';
              setSearch(value ? { q: value } : {});
            }}
          >
            <label>
              <span className="vis-hidden">Filter sources</span>
              <input
                className="cin"
                name="q"
                type="search"
                key={q}
                defaultValue={q}
                placeholder="Filter by title, system or owner"
              />
            </label>
          </form>
        </div>

        <QueryState q={list} what="the source catalogue" skeletonLines={4}>
          {(rows) => {
            if (rows.length === 0 && q)
              return (
                <div className="empty">
                  <b>No source matches “{q}”</b>
                  Nothing in the catalogue matches that text. The catalogue itself is intact — none
                  of the ingested sources match this filter.
                  <div style={{ marginTop: 10 }}>
                    <button type="button" className="btn btn-s" onClick={() => setSearch({})}>
                      Clear the filter
                    </button>
                  </div>
                </div>
              );
            if (rows.length === 0)
              return (
                <div className="empty">
                  <b>No sources ingested yet</b>
                  Nothing has been ingested for this tenant. Until a manual, a schema snapshot or a
                  run-log range is loaded, every diagnosis is ungrounded by definition and will say
                  so rather than answering from nothing.
                </div>
              );
            const partial = rows.filter((s) => s.status === 'partial').length;
            const stale = rows.filter((s) => isStale(s) || s.status === 'stale').length;
            return (
              <>
                <div className="src-gapline">
                  <b>
                    {partial} of {rows.length} sources are partially indexed and {stale}{' '}
                    {stale === 1 ? 'is' : 'are'} stale.
                  </b>{' '}
                  Every gap below states what was skipped and why. A source that is partly readable
                  is listed as partly readable — it is never rounded up to complete.
                </div>
                <div
                  className="tbl src-tbl"
                  tabIndex={0}
                  role="region"
                  aria-label="Ingested sources table, scrolls horizontally"
                >
                  <table>
                    <thead>
                      <tr>
                        <th>Source</th>
                        <th>Type</th>
                        <th>Version / range</th>
                        <th>Size</th>
                        <th>Last ingested</th>
                        <th>Coverage</th>
                        <th>Cited by</th>
                        <th>State</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((s) => {
                        const d = details[s.id];
                        const denied = d?.denied ?? (s.lenses ? !s.lenses.includes(lens) : false);
                        const pct = coveragePct(s);
                        const st = isStale(s);
                        return (
                          <tr key={s.id} className="linkrow" onClick={() => open(s.id)}>
                            <td>
                              <Link
                                className="src-open"
                                to={`/sources/${encodeURIComponent(s.id)}`}
                                onClick={(e) => e.stopPropagation()}
                              >
                                {s.title}
                              </Link>
                              <div className="src-sub">
                                {[s.owner, s.system].filter(Boolean).join(' · ')}
                              </div>
                            </td>
                            <td>
                              <span className="src-type">{s.type}</span>
                            </td>
                            <td className="mono">
                              {s.version}
                              {s.dated && <div className="src-sub mono">{s.dated}</div>}
                            </td>
                            <td className="mono">{s.size ?? '—'}</td>
                            <td className="mono">
                              {s.ingested?.split(' · ')[0] ?? '—'}
                              {s.ingestedDays != null && (
                                <div className={`src-sub${st ? ' warn' : ''}`}>
                                  {s.ingestedDays}d ago{st ? ' · stale' : ''}
                                </div>
                              )}
                            </td>
                            <td>
                              {pct != null && <CoverageBar pct={pct} />}
                              {s.coverage && (
                                <div className="src-sub">
                                  {s.coverage.indexed.toLocaleString()} of{' '}
                                  {s.coverage.total.toLocaleString()} {s.coverage.unit}
                                  {s.coverage.skipped?.length ? ' · gap declared' : ''}
                                </div>
                              )}
                            </td>
                            <td className="mono">{s.citedBy?.toLocaleString() ?? '—'}</td>
                            <td>
                              <StatusTag s={s} denied={denied} />
                              {denied && <div className="src-sub">not granted to this lens</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          }}
        </QueryState>
      </div>

      <div className="panel">
        <PanelHead label="Citations index" chip={`${citations.data?.length ?? 0}`} />
        <div className="t-cap" style={{ marginBottom: 8 }}>
          Every citation the corpus can resolve, and the source unit it points at.
        </div>
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Source</th>
                <th>Unit</th>
                <th>Resolvable</th>
              </tr>
            </thead>
            <tbody>
              <TableRowsState q={citations} what="the citations index" cols={4}>
                {(rows) =>
                  rows.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="muted">
                        No citations.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {rows.map((c) => (
                        <tr key={c.id ?? c.label}>
                          <td>{c.label}</td>
                          <td>
                            {c.sourceId ? (
                              <Link to={`/sources/${encodeURIComponent(c.sourceId)}`}>
                                {c.sourceTitle ?? c.sourceId}
                              </Link>
                            ) : (
                              '—'
                            )}
                          </td>
                          <td className="mono">
                            {c.unitRef ? `${c.unitRef} ${c.unitTitle ?? ''}`.trim() : '—'}
                          </td>
                          <td>
                            <span
                              className={`conf ${c.resolvable ? 'c-g' : 'c-u'}`}
                              style={{ padding: '2px 8px' }}
                            >
                              {c.resolvable ? 'yes' : 'no'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </>
                  )
                }
              </TableRowsState>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function SourceDetailView({ id }: { id: string }) {
  const { lens } = useLens();
  const detail = useHydrated(['source-detail', id], () => SourcesApi.detail(id));
  const mode = modeFor(lens);

  return (
    <div className="stack">
      <ScreenHeader
        title={detail.data?.title ?? id}
        crumb={
          <>
            <Link to="/corpus">Corpus</Link> / <Link to="/sources">Sources</Link> / {id}
          </>
        }
        subtitle="ingested source · coverage and citable units"
      />
      <CorpusTabs active="sources" />
      {/* A 403 not_granted renders as "Restricted for your role" with the server's reason. */}
      <QueryState q={detail} what="this source" skeletonLines={4}>
        {(s) => {
          const st = isStale(s);
          const pct = coveragePct(s);
          const lenses = s.lenses ?? [];
          const freshness =
            s.ingestedDays != null && s.staleAfter != null
              ? st
                ? `Stale — last ingested ${s.ingestedDays} days ago, past the ${s.staleAfter}-day refresh expectation for a ${s.type}.`
                : `Current — within the ${s.staleAfter}-day refresh expectation for a ${s.type}.`
              : null;
          const fields: Array<[string, string | undefined, boolean?]> = [
            ['Version', s.version, true],
            ['Dated / range', s.dated, true],
            ['Size', s.size, true],
            ['Owner', s.owner],
            ['System', s.system],
            ['Last ingested', s.ingested, true],
            ['Cited by', s.citedBy != null ? `${s.citedBy.toLocaleString()} answers` : undefined, true],
            ['Readable by', lenses.length ? lenses.map(lensName).join(', ') : undefined],
          ];
          return (
            <>
              <div className="panel">
                <div className="ph">
                  <span className="t-label">{s.type}</span>
                  <StatusTag s={s} />
                  <span className="sp" style={{ flex: 1 }} />
                  <span className="t-cap">
                    {mode === 'full' ? 'full read' : 'view only'} · read-only for every lens
                  </span>
                </div>
                <div className="src-title">{s.title}</div>
                {s.note && <div className="src-note">{s.note}</div>}
                <div className="kvs" style={{ marginTop: 14 }}>
                  {fields
                    .filter(([, v]) => v)
                    .map(([k, v, mono]) => (
                      <div className="kv" key={k}>
                        <div className="k">{k}</div>
                        <div className={`v${mono ? ' mono' : ''}`}>{v}</div>
                      </div>
                    ))}
                </div>
                {freshness &&
                  (st ? (
                    <div className="denied" style={{ marginTop: 12 }}>
                      <div className="t-label">Stale source</div>
                      <div className="msg">{freshness}</div>
                    </div>
                  ) : (
                    <div className="note" style={{ marginTop: 12 }}>
                      {freshness}
                    </div>
                  ))}
              </div>

              {s.coverage && (
                <div className="panel">
                  <PanelHead label="Coverage">
                    <span className="t-cap">what is indexed, and what is not</span>
                  </PanelHead>
                  {pct != null && <CoverageBar pct={pct} large />}
                  <div className="src-sub" style={{ marginTop: 6 }}>
                    {s.coverage.indexed.toLocaleString()} of {s.coverage.total.toLocaleString()}{' '}
                    {s.coverage.unit} indexed
                  </div>
                  {s.coverage.skipped?.length ? (
                    <div className="src-gaps">
                      <div className="t-label" style={{ marginBottom: 8 }}>
                        Declared gaps · {s.coverage.skipped.length}
                      </div>
                      {s.coverage.skipped.map((gap) => (
                        <div className="src-gap" key={gap.what}>
                          <div className="src-gap-what">{gap.what}</div>
                          <div className="src-gap-why">{gap.why}</div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="receipt-row">
                      <span className="receipt">
                        <CheckIcon /> Fully indexed · no gaps declared · manifest verified at ingestion
                      </span>
                    </div>
                  )}
                </div>
              )}

              {s.units && s.units.length > 0 && (
                <div className="panel">
                  <PanelHead label="Citable units">
                    <span className="t-cap">what an answer can point at inside this source</span>
                  </PanelHead>
                  <div className="tbl">
                    <table>
                      <thead>
                        <tr>
                          <th>Reference</th>
                          <th>Unit</th>
                          <th>Cited by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {s.units.map((u) => (
                          <tr key={u.ref}>
                            <td className="mono">
                              <b>{u.ref}</b>
                            </td>
                            <td>{u.title}</td>
                            <td className="mono">{u.cited.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <div className="note" style={{ marginTop: 11 }}>
                    A citation chip elsewhere in the product resolves to one of these units. Anything
                    outside this list is not citable from this source — including the skipped ranges
                    above.
                  </div>
                </div>
              )}
            </>
          );
        }}
      </QueryState>
    </div>
  );
}
