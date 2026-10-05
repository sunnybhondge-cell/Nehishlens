import { Link } from 'react-router-dom';
import { CorpusApi, SourcesApi } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, Conf, QueryState, TableRowsState } from '../components/ui';

/** Screen 5 · Corpus — the moat, made countable. */
export function Corpus() {
  const metrics = useHydrated(['corpus-metrics'], CorpusApi.metrics);
  const resolutions = useHydrated(['resolutions'], CorpusApi.resolutions);
  const sources = useHydrated(['sources'], () => SourcesApi.list());

  return (
    <div className="stack">
      <ScreenHeader title="Corpus" crumb="Operations · Engineering" subtitle="institutional memory" />
      <Trace>Resolution detail is its own route, /corpus/:id.</Trace>
      <div className="crow">
        <Link className="btn btn-s btn-p" to="/corpus">Resolutions</Link>
        <Link className="btn btn-s" to="/sources">Sources</Link>
      </div>

      <QueryState q={metrics} what="the corpus metrics" skeletonLines={4}>
        {(m) => (
          <div className="tiles">
            <div className="tile">
              <div className="t-label">RESOLUTIONS</div>
              <div className="t-metric">
                {m.resolutions.toLocaleString()}
                <span className="dl d-ok"> +{m.addedToday}</span>
              </div>
              <div className="bc">Total. All human-approved.</div>
            </div>
            <div className="tile">
              <div className="t-label">REUSE EVENTS</div>
              <div className="t-metric">{m.reuseEventsThisWeek}</div>
              <div className="bc">This week — applied and verified.</div>
            </div>
            <div className="tile">
              <div className="t-label">RECALL HIT RATE</div>
              <div className="t-metric">{m.recallHitRatePct}%</div>
              <div className="bc">Incidents matching a past fix at or above threshold.</div>
            </div>
            <div className="tile">
              <div className="t-label">NOT CAPTURED</div>
              <div className="t-metric" style={{ color: 'var(--warn)' }}>
                {m.notCaptured}
              </div>
              <div className="bc">Resolved without a record — the loop leaking.</div>
            </div>
          </div>
        )}
      </QueryState>

      <div className="panel">
        <PanelHead label="Recent resolutions" chip="click a row for the full record" />
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Problem signature</th>
                <th>Reuse</th>
                <th>Last reused</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              <TableRowsState q={resolutions} what="the resolutions" cols={5}>
                {(rows) =>
                  rows.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="muted">
                        No resolutions captured yet.
                      </td>
                    </tr>
                  ) : (
                    <>
                      {rows.map((r) => (
                        <tr key={r.id} className="linkrow">
                          <td className="mono">
                            <Link to={`/corpus/${encodeURIComponent(r.id)}`}>
                              <b>{r.id}</b>
                            </Link>
                          </td>
                          <td>{r.title}</td>
                          <td className="mono">{r.reuseCount}×</td>
                          <td className="mono">{r.lastReused}</td>
                          <td>
                            <Conf value={r.confidence} />
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

      <div className="panel">
        <PanelHead label="Ingestion coverage" />
        <QueryState q={sources} what="the source list" skeletonLines={3}>
          {(rows) => {
            const partial = rows.filter((s) => s.status !== 'ok');
            return partial.length === 0 ? (
              <p className="muted">Every ingested source is fully indexed.</p>
            ) : (
              partial.map((s) => (
                <div className="empty" key={s.id} style={{ marginBottom: 8 }}>
                  <b>
                    {s.title} — {s.status}
                  </b>
                  {s.coverage
                    ? `${s.coverage.indexed} of ${s.coverage.total} ${s.coverage.unit} indexed.`
                    : 'Partial coverage.'}
                  <div style={{ marginTop: 8 }}>
                    <Link className="btn btn-s" to={`/sources/${s.id}`}>
                      Inspect source →
                    </Link>
                  </div>
                </div>
              ))
            );
          }}
        </QueryState>
      </div>
    </div>
  );
}
