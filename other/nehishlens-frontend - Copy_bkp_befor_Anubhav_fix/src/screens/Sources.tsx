import { useEffect, useState } from 'react';
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
  const list = useHydrated(['sources'], () => SourcesApi.list());
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

  return (
    <div className="stack">
      <ScreenHeader title="Corpus · Sources" crumb="Corpus" subtitle="what the corpus is grounded in" />
      <Trace>A refusal is data, not a failure — denied sources stay listed and flagged.</Trace>

      <QueryState q={list} what="the source list" skeletonLines={4}>
        {(rows) =>
          rows.map((s) => {
            const d = details[s.id] ?? s;
            return (
              <div className="panel" key={s.id}>
                <PanelHead label={s.title} chip={s.type}>
                  {d.denied && <span className="sev crit">denied</span>}
                </PanelHead>
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
