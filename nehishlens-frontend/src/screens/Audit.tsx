import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { AuditApi, type AuditEntry } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, QueryState, TableRowsState } from '../components/ui';

/** Screen 4 · Audit & Evidence — hash-chained trail + the three pack claims. */
export function Audit() {
  const trail = useHydrated(['audit'], () => AuditApi.list(50));
  const verify = useHydrated(['audit-verify'], AuditApi.verify);

  return (
    <div className="stack">
      <ScreenHeader title="Audit & Evidence" crumb="Assurance" subtitle="hash-chained trail" />
      <Trace>Three claims kept separate, never merged into one tick.</Trace>

      <div className="g21">
        <div>
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
                <TableRowsState q={trail} what="the audit trail" cols={6}>
                  {(rows) =>
                    rows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="muted">
                          No audit rows yet.
                        </td>
                      </tr>
                    ) : (
                      <>
                        {rows.map((e) => (
                          <AuditRow key={e.hash} entry={e} />
                        ))}
                      </>
                    )
                  }
                </TableRowsState>
              </tbody>
            </table>
          </div>
          <div className="note" style={{ marginTop: 12 }}>
            Click a row to fetch the full entry (<span className="mono">GET /audit/&#123;hash&#125;</span>) —
            payload and previous-hash link. The trail is append-only and hash-chained; the integrity
            claim on the right is a server fact from <span className="mono">/audit/verify</span>.
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
                  <Link className="btn btn-s btn-p" to="/audit/packs/new">
                    Open evidence-pack builder →
                  </Link>
                </div>
              </>
            )}
          </QueryState>
        </div>
      </div>
    </div>
  );
}

function AuditRow({ entry }: { entry: AuditEntry }) {
  const [open, setOpen] = useState(false);
  const full = useQuery({
    queryKey: ['audit-entry', entry.hash],
    queryFn: () => AuditApi.byHash(entry.hash),
    enabled: open,
  });

  return (
    <>
      <tr className="linkrow" onClick={() => setOpen((o) => !o)}>
        <td className="mono">{new Date(entry.at).toLocaleTimeString()}</td>
        <td>
          <b>{entry.actor}</b>
        </td>
        <td className="mono">{entry.verb}</td>
        <td className="mono">{entry.actorKind}</td>
        <td className="mono">{entry.object}</td>
        <td className="mono" style={{ color: 'var(--ok)' }}>
          {open ? '▾ ' : '▸ '}
          {entry.hash.slice(0, 8)}…
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ background: 'var(--raised)' }}>
            {full.isLoading && <span className="muted">Loading entry…</span>}
            {full.error && <span className="fixture-note">{full.error.message}</span>}
            {full.data && (
              <div className="mono t-cap" style={{ lineHeight: 1.7 }}>
                <div>seq {full.data.seq}</div>
                <div className="wrap-anywhere">hash {full.data.hash}</div>
                <div className="wrap-anywhere">prevHash {full.data.prevHash ?? '—'}</div>
                <div className="wrap-anywhere">
                  payload {JSON.stringify(full.data.payload ?? {})}
                </div>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
