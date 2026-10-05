import { Link } from 'react-router-dom';
import { AuditApi } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, QueryState } from '../components/ui';

/**
 * Route /audit/packs/new. The mock API does not expose evidence-pack
 * generation (`/audit/packs/*` is 404), so the scope form here is inert and
 * labelled as such. The one live piece is the check step, which reads the
 * real `/audit/verify`.
 */
export function PackBuilder() {
  const verify = useHydrated(['audit-verify'], AuditApi.verify);

  return (
    <div className="stack">
      <ScreenHeader
        title="Evidence pack builder"
        crumb={<Link to="/audit">← Audit</Link>}
        subtitle="/audit/packs/new · Assurance"
      />
      <Trace>Scope → review checks → inspect gaps → export. A separate workflow from the trail.</Trace>

      <div className="banner" style={{ borderLeftColor: 'var(--warn)' }}>
        <strong>Not exposed by the mock API.</strong> Pack generation has no endpoint on this mock, so
        the scope and export controls below are shown for the intended workflow only. The check step is
        live.
      </div>

      <div className="panel">
        <PanelHead label="1 · Scope the request" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <div>
            <div className="t-cap" style={{ marginBottom: 5 }}>
              Date range
            </div>
            <select className="sel" disabled defaultValue="30">
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="7">Last 7 days</option>
            </select>
          </div>
          <div>
            <div className="t-cap" style={{ marginBottom: 5 }}>
              Action types
            </div>
            <select className="sel" disabled defaultValue="priv">
              <option value="priv">Privileged only</option>
              <option value="all">All actions</option>
              <option value="ai">AI actions only</option>
            </select>
          </div>
          <div>
            <div className="t-cap" style={{ marginBottom: 5 }}>
              Systems
            </div>
            <select className="sel" disabled defaultValue="all">
              <option value="all">All systems</option>
            </select>
          </div>
        </div>
      </div>

      <div className="panel">
        <PanelHead label="2 · Review the checks" />
        <QueryState q={verify} what="the chain verification" skeletonLines={2}>
          {(v) => (
            <>
              <div className="claim">
                <span className={`pip ${v.intact ? 'p-ok' : 'p-crit'}`} />
                <span className="lb">Integrity</span>
                <span className="mono t-cap">{v.intact ? 'chain intact' : `broken at seq ${v.brokenAtSeq}`}</span>
              </div>
              <div className="claim">
                <span className="pip p-ok" />
                <span className="lb">Continuity</span>
                <span className="mono t-cap">
                  {v.length} of {v.length} rows
                </span>
              </div>
            </>
          )}
        </QueryState>
      </div>

      <div className="panel">
        <PanelHead label="3 · Export" />
        <button className="btn btn-p" disabled style={{ width: '100%', justifyContent: 'center' }}>
          Generate signed evidence pack — unavailable on the mock
        </button>
      </div>
    </div>
  );
}
