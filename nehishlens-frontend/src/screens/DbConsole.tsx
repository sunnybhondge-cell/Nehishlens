import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { DbApi, type DbInvestigation, type DbObject, type DbObjectSummary, type DbQueryResult } from '../api/endpoints';
import type { ApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, PanelHead, QueryState } from '../components/ui';

/**
 * Courtesy only — the server is the control (422 not_read_only). This never
 * blocks a run; it just warns before the server refuses.
 */
function looksReadOnly(sql: string): boolean {
  const stripped = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  return /^(select|with)\b/i.test(stripped);
}

interface RunRecord {
  sql: string;
  result: DbQueryResult;
}

/**
 * Screen 6 · DB Console. Schema search → object view → audited read-only
 * query → a signed investigation attached to a change record. The journey
 * ends with the investigation, not with the query.
 */
export function DbConsole() {
  const [selected, setSelected] = useState<string | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);

  return (
    <div className="stack">
      <ScreenHeader title="DB Console" crumb="Engineering" subtitle="read-only replica" />
      <Trace>Run is an action-with-receipt; power does not exempt anyone from the audit trail.</Trace>

      <div className="g21">
        <SchemaSearch selected={selected} onSelect={setSelected} />
        {selected ? (
          <ObjectView name={selected} />
        ) : (
          <div className="panel">
            <PanelHead label="Object" />
            <p className="muted">Pick an object to see its columns, keys and what depends on it.</p>
          </div>
        )}
      </div>

      <QueryRunner onRun={(r) => setRuns((prev) => [...prev, r])} />
      <Investigation runs={runs} />
    </div>
  );
}

function SchemaSearch({ selected, onSelect }: { selected: string | null; onSelect: (name: string) => void }) {
  const [draft, setDraft] = useState('');
  const [q, setQ] = useState('');
  const schema = useQuery<DbObjectSummary[], ApiError>({ queryKey: ['db-schema', q], queryFn: () => DbApi.schema(q) });

  return (
    <div className="panel">
      <PanelHead label="Indexed schema" />
      <form
        role="search"
        style={{ display: 'flex', gap: 8, marginBottom: 10 }}
        onSubmit={(e) => {
          e.preventDefault();
          setQ(draft.trim());
        }}
      >
        <input className="cin" type="search" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Search tables, e.g. GL" />
        <button type="submit" className="btn btn-s btn-p">Search</button>
      </form>
      <QueryState q={{ data: schema.data, isLoading: schema.isLoading, error: schema.error }} what="the schema" skeletonLines={4}>
        {(items) =>
          items.length === 0 ? (
            <p className="muted">
              {q ? `Nothing in the indexed schema matches “${q}”. Not indexed is not the same as not existing.` : 'The schema index is empty.'}
            </p>
          ) : (
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Object</th>
                    <th>Module</th>
                    <th>Rows</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((o) => (
                    <tr
                      key={o.name}
                      className="linkrow"
                      tabIndex={0}
                      aria-current={selected === o.name || undefined}
                      style={selected === o.name ? { background: 'var(--raised)' } : undefined}
                      onClick={() => onSelect(o.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onSelect(o.name);
                        }
                      }}
                    >
                      <td>
                        <b className="mono">{o.name}</b>
                        {o.note && <div className="t-cap">{o.note}</div>}
                      </td>
                      <td className="mono">{o.module}</td>
                      <td className="mono">{o.rows.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

function ObjectView({ name }: { name: string }) {
  const obj = useQuery<DbObject, ApiError>({ queryKey: ['db-object', name], queryFn: () => DbApi.object(name) });

  return (
    <div className="panel">
      <PanelHead label={name} />
      <QueryState q={{ data: obj.data, isLoading: obj.isLoading, error: obj.error }} what={`the object ${name}`} skeletonLines={5}>
        {(o) => (
          <>
            <div className="t-cap mono" style={{ marginBottom: 8 }}>
              {o.kind} · {o.module} · {o.rows.toLocaleString()} rows
            </div>
            <div className="tbl">
              <table>
                <thead>
                  <tr>
                    <th>Column</th>
                    <th>Type</th>
                    <th>Null</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {o.columns.map((c) => (
                    <tr key={c.name}>
                      <td className="mono">{c.name}</td>
                      <td className="mono">{c.type}</td>
                      <td className="mono">{c.nullable ? 'yes' : 'no'}</td>
                      <td>
                        {c.pk && <span className="chip">PK</span>} {c.masked && <span className="chip">masked by policy</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {o.foreignKeys.length > 0 && (
              <>
                <div className="t-cap" style={{ margin: '12px 0 4px' }}>Foreign keys</div>
                {o.foreignKeys.map((f) => (
                  <div className="kv" key={f.column}>
                    <div className="k mono">{f.column}</div>
                    <div className="v mono">→ {f.references}</div>
                  </div>
                ))}
              </>
            )}

            <div className="t-cap" style={{ margin: '12px 0 4px' }}>What depends on it</div>
            {o.dependents.length === 0 ? (
              <p className="muted">No dependents found in the indexed schema.</p>
            ) : (
              o.dependents.map((d) => (
                <div className="kv" key={`${d.object}-${d.via}`}>
                  <div className="k mono">{d.object}</div>
                  <div className="v mono">{d.via}</div>
                </div>
              ))
            )}
            {o.eodBatches && o.eodBatches.length > 0 && (
              <div className="kv">
                <div className="k">EOD batches</div>
                <div className="v mono">{o.eodBatches.join(' · ')}</div>
              </div>
            )}

            {o.notConfirmed && o.notConfirmed.length > 0 && (
              <div className="denied" style={{ marginTop: 12, borderStyle: 'dashed' }}>
                <div className="t-label" style={{ color: 'var(--warn)' }}>Not confirmed</div>
                {o.notConfirmed.map((n, i) => (
                  <div className="msg" key={i}>{n}</div>
                ))}
              </div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

function QueryRunner({ onRun }: { onRun: (r: RunRecord) => void }) {
  const [sql, setSql] = useState('SELECT * FROM GL_HANDOFF_STG_AUDIT');
  const [last, setLast] = useState<RunRecord | null>(null);
  const run = useMutation<DbQueryResult, ApiError, string>({
    mutationFn: (statement) => DbApi.query(statement),
    onSuccess: (result, statement) => {
      const rec = { sql: statement, result };
      setLast(rec);
      onRun(rec);
    },
  });
  const warn = sql.trim() !== '' && !looksReadOnly(sql);

  return (
    <div className="panel">
      <PanelHead label="Read-only query" />
      <textarea
        className="cin mono"
        rows={4}
        value={sql}
        onChange={(e) => setSql(e.target.value)}
        aria-label="SQL statement"
        style={{ resize: 'vertical' }}
      />
      {warn && (
        <p className="t-cap" style={{ marginTop: 6 }}>
          This does not look like a SELECT. The console runs read-only statements only; the server will refuse it.
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button className="btn btn-p" disabled={!sql.trim() || run.isPending} onClick={() => run.mutate(sql)}>
          {run.isPending ? 'Running…' : 'Run (audited)'}
        </button>
        <span className="t-cap">Every run is written to the audit trail.</span>
      </div>
      {run.error && <ApiErrorBanner error={run.error} what="the query" />}

      {last && !run.error && (
        <div style={{ marginTop: 12 }}>
          {last.result.maskedColumns.length > 0 && (
            <div className="claim" style={{ borderColor: 'rgba(245,184,61,.35)' }}>
              <span className="pip p-warn" />
              <span className="lb">Masked by policy</span>
              <span className="mono t-cap">{last.result.maskedColumns.join(', ')}</span>
            </div>
          )}
          <div className="tbl" style={{ marginTop: 8 }}>
            <table>
              <thead>
                <tr>
                  {last.result.columns.map((c) => (
                    <th key={c}>
                      {c}
                      {last.result.maskedColumns.includes(c) && ' (masked)'}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {last.result.rows.length === 0 ? (
                  <tr>
                    <td colSpan={last.result.columns.length || 1} className="muted">The query returned no rows.</td>
                  </tr>
                ) : (
                  last.result.rows.map((row, i) => (
                    <tr key={i}>
                      {row.map((cell, j) => (
                        <td key={j} className="mono">{cell === null ? 'NULL' : String(cell)}</td>
                      ))}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="t-cap mono" style={{ marginTop: 6 }}>
            {last.result.rows.length} rows · {last.result.durationMs} ms · output {last.result.outputHash} ·{' '}
            <Link to={`/audit/${last.result.auditRef.slice(0, 8)}`}>audit entry {last.result.auditRef.slice(0, 8)}</Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Investigation({ runs }: { runs: RunRecord[] }) {
  const { user } = useAuth();
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [changeRecord, setChangeRecord] = useState('');
  const sign = useMutation<DbInvestigation, ApiError>({
    mutationFn: () => DbApi.investigate([...included], changeRecord.trim(), user?.id ?? ''),
  });

  return (
    <div className="panel">
      <PanelHead label="Sign the investigation" />
      {runs.length === 0 ? (
        <p className="muted">Run at least one query. An investigation attaches the queries you ran to a change record.</p>
      ) : (
        <>
          <div className="t-cap" style={{ marginBottom: 4 }}>Queries to include</div>
          {runs.map((r) => (
            <label key={r.result.auditRef} className="claim" style={{ cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={included.has(r.result.auditRef)}
                disabled={sign.isSuccess}
                onChange={(e) =>
                  setIncluded((s) => {
                    const next = new Set(s);
                    if (e.target.checked) next.add(r.result.auditRef);
                    else next.delete(r.result.auditRef);
                    return next;
                  })
                }
              />
              <span className="mono t-cap wrap-anywhere">
                {r.result.auditRef.slice(0, 8)} · {r.sql}
              </span>
            </label>
          ))}
          <label style={{ display: 'block', marginTop: 10 }}>
            <span className="t-cap">Change record</span>
            <input
              className="cin"
              value={changeRecord}
              disabled={sign.isSuccess}
              onChange={(e) => setChangeRecord(e.target.value)}
              placeholder="e.g. CHG-104422"
            />
          </label>
          {!sign.data ? (
            <button
              className="btn btn-p"
              style={{ marginTop: 10 }}
              disabled={included.size === 0 || !changeRecord.trim() || sign.isPending}
              onClick={() => sign.mutate()}
            >
              {sign.isPending ? 'Signing…' : `Sign as ${user?.id} and attach`}
            </button>
          ) : (
            <div style={{ marginTop: 10 }}>
              <div className="claim">
                <span className="pip p-ok" />
                <span className="lb">Signed</span>
                <span className="mono t-cap">
                  {sign.data.id} → {sign.data.attachedTo} · {sign.data.signedBy} · {new Date(sign.data.signedAt).toLocaleString()}
                </span>
              </div>
              <Link className="btn btn-s" to={`/audit/${sign.data.hash.slice(0, 8)}`}>
                View the audit entry →
              </Link>
            </div>
          )}
          {sign.error && <ApiErrorBanner error={sign.error} what="the investigation" />}
        </>
      )}
    </div>
  );
}
