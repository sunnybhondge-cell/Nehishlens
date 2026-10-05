import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { SourcesApi, type SourceDetail } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { fetchAllSettled } from '../api/client';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, QueryState, TableRowsState } from '../components/ui';

/**
 * Screen 5 · Corpus · Sources. Fans out per-source detail with
 * Promise.allSettled — a single 403 (a lens-denied source such as
 * src-sanctions-ref) is kept in the list, flagged with the server's own
 * reason, rather than taking the whole screen down (wiring guide rule 5).
 */
export function Sources() {
  const { id } = useParams<{ id: string }>();
  const [search, setSearch] = useSearchParams();
  const q = search.get('q') ?? '';
  const list = useHydrated(['sources', q], () => SourcesApi.list(q || undefined));
  const citations = useHydrated(['citations'], () => SourcesApi.citations());
  const detail = useHydrated(['source-detail', id], () => id ? SourcesApi.detail(id) : Promise.resolve({} as SourceDetail));
  const [details, setDetails] = useState<Record<string, SourceDetail>>({});

  useEffect(() => {
    if (id) return;
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
  }, [id, list.data]);

  if (id) {
    return (
      <div className="stack">
        <ScreenHeader title={detail.data?.title ?? id} crumb={<Link to="/sources">← Sources</Link>} subtitle={detail.data?.type} />
        <Trace>One source, its declared coverage, readable units and explicit gaps.</Trace>
        <QueryState q={detail} what="this source" skeletonLines={4}>
          {(d) => (
            <>
              <div className="panel">
                <PanelHead label="Source record" chip={d.status} />
                {[['Version', d.version], ['Dated', d.dated], ['Owner', d.owner], ['System', d.system], ['Ingested', d.ingested]].map(([k, v]) => v && <div className="kv" key={k}><div className="k">{k}</div><div className="v">{v}</div></div>)}
              </div>
              {d.coverage && <div className="panel"><PanelHead label="Coverage" chip={`${d.coverage.indexed} / ${d.coverage.total} ${d.coverage.unit}`} />
                {d.coverage.skipped?.length ? d.coverage.skipped.map((gap) => <div className="regress" key={gap.what}><b>{gap.what}</b><br />{gap.why}</div>) : <div className="receipt">Fully indexed; no gaps declared</div>}
              </div>}
              {d.units && <div className="panel"><PanelHead label="Readable units" />{d.units.map((u) => <div className="claim" key={u.ref}><span className="lb">{u.ref} · {u.title}</span><span className="t-cap">cited {u.cited}</span></div>)}</div>}
            </>
          )}
        </QueryState>
      </div>
    );
  }

  return (
    <div className="stack">
      <ScreenHeader title="Corpus · Sources" crumb="Corpus" subtitle="what the corpus is grounded in" />
      <Trace>A refusal is data, not a failure — denied sources stay listed and flagged.</Trace>

      <div className="panel">
        <PanelHead label="Search sources" />
        <form onSubmit={(e) => { e.preventDefault(); const value = new FormData(e.currentTarget).get('q')?.toString().trim() ?? ''; setSearch(value ? { q: value } : {}); }} style={{ display: 'flex', gap: 8 }}>
          <input className="cin" name="q" defaultValue={q} placeholder="Search title, owner or system" style={{ flex: 1 }} />
          <button className="btn btn-p btn-s" type="submit">Search</button>
          {q && <button className="btn btn-q btn-s" type="button" onClick={() => setSearch({})}>Clear</button>}
        </form>
      </div>

      <QueryState q={list} what="the source list" skeletonLines={4}>
        {(rows) =>
          rows.length === 0 ? <div className="empty"><b>No sources match “{q}”</b>Try a broader search; zero results is not an API failure.</div> : rows.map((s) => {
            const d = details[s.id] ?? s;
            return (
              <div className="panel" key={s.id}>
                <PanelHead label={s.title} chip={s.type}>
                  {d.denied && <span className="sev crit">denied</span>}
                </PanelHead>
                <Link className="btn btn-s btn-q" to={`/sources/${encodeURIComponent(s.id)}`}>Open source detail →</Link>
                <div className="t-cap mono">
                  {[s.version, s.dated, s.size, s.owner, s.system].filter(Boolean).join(' · ')}
                </div>
                {d.denied ? (
                  <div className="denied" style={{ marginTop: 8 }}>
                    <div className="msg">{d.deniedReason}</div>
                  </div>
                ) : (
                  <>
                    {d.coverage && (
                      <div className="t-cap" style={{ marginTop: 8 }}>
                        Coverage: {d.coverage.indexed} of {d.coverage.total} {d.coverage.unit}
                        {d.coverage.skipped?.length
                          ? ` · skipped: ${d.coverage.skipped.map((x) => x.what).join('; ')}`
                          : ''}
                      </div>
                    )}
                    {d.units && d.units.length > 0 && (
                      <div className="crow" style={{ marginTop: 8 }}>
                        {d.units.map((u) => (
                          <span className="cite" key={u.ref}>
                            {u.ref} {u.title} · cited {u.cited}
                          </span>
                        ))}
                      </div>
                    )}
                    {d.lenses && (
                      <div className="t-cap" style={{ marginTop: 8 }}>
                        Granted to: {d.lenses.join(', ')}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })
        }
      </QueryState>

      <div className="panel">
        <PanelHead label="Citations index" chip={`${citations.data?.length ?? 0}`} />
        <div className="t-cap" style={{ marginBottom: 8 }}>
          Every citation the corpus can resolve, and the source unit it points at
          (<span className="mono">GET /citations</span>).
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
                          <td>{c.sourceTitle ?? c.sourceId ?? '—'}</td>
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
