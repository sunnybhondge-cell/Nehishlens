import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IncidentsApi, STAGES, STAGE_LABEL, type ObserveIncidentResponse } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, Conf, CiteRow, QueryState } from '../components/ui';
import type { ApiError } from '../api/client';
import { useAccess } from '../hooks/useAccess';
import {
  DEFAULT_DIR,
  SORT_LABEL,
  slaIsInferred,
  sortIncidents,
  type SortDir,
  type SortKey,
} from '../lib/incidentSort';

const SORT_STORAGE_KEY = 'nl.incidents.sort';

/** Per-viewer convenience only — falls back to the default if storage is unavailable. */
function readSort(): { key: SortKey; dir: SortDir } {
  try {
    const v = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? 'null');
    if (v && v.key in SORT_LABEL && (v.dir === 'asc' || v.dir === 'desc')) return v;
  } catch {
    /* ignore */
  }
  return { key: 'priority', dir: DEFAULT_DIR.priority };
}

/** Screen 2 · Incidents — one object, one queue, filtered by loop state. */
export function IncidentsList() {
  const { readOnly } = useAccess('/incidents');
  const incidents = useHydrated(['incidents'], () => IncidentsApi.list());
  const [stage, setStage] = useState<string | null>(null);
  const [sort, setSortState] = useState(readSort);
  const setSort = (next: { key: SortKey; dir: SortDir }) => {
    setSortState(next);
    try {
      localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of incidents.data ?? []) c[i.stage] = (c[i.stage] ?? 0) + 1;
    return c;
  }, [incidents.data]);

  const rows = sortIncidents(
    (incidents.data ?? []).filter((i) => !stage || i.stage === stage),
    sort.key,
    sort.dir,
  );

  return (
    <div className="stack">
      <ScreenHeader
        title="Incidents"
        subtitle={`${incidents.data?.length ?? 0} in queue`}
        crumb="Operations"
        actions={readOnly ? <span className="chip">read-only</span> : <ObserveIncident onDone={() => incidents.refetch()} />}
      />
      <Trace>
        Opening, reviewing and recording are three distinct steps — this list opens; the detail page
        reviews and records.
      </Trace>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <button
          className={`btn btn-s ${stage === null ? 'btn-p' : ''}`}
          onClick={() => setStage(null)}
        >
          All · {incidents.data?.length ?? 0}
        </button>
        {STAGES.map((s) => (
          <button
            key={s}
            className={`btn btn-s ${stage === s ? 'btn-p' : ''}`}
            onClick={() => setStage(s)}
          >
            {STAGE_LABEL[s]} · {counts[s] ?? 0}
          </button>
        ))}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginLeft: 'auto' }}>
          <label className="t-cap" htmlFor="inc-sort" style={{ whiteSpace: 'nowrap' }}>
            Sort by
          </label>
          <select
            id="inc-sort"
            className="sel"
            style={{ width: 'auto', height: 27, padding: '0 8px', fontSize: 12 }}
            value={sort.key}
            onChange={(e) => {
              const key = e.target.value as SortKey;
              setSort({ key, dir: DEFAULT_DIR[key] });
            }}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
          <button
            className="btn btn-s"
            aria-label={`Sort ${sort.dir === 'asc' ? 'ascending' : 'descending'} — click to reverse`}
            title="Reverse order"
            onClick={() => setSort({ key: sort.key, dir: sort.dir === 'asc' ? 'desc' : 'asc' })}
          >
            {sort.dir === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>
      {sort.key === 'sla' && slaIsInferred(rows) && (
        <p className="t-cap" style={{ margin: 0 }}>
          SLA order is inferred: the API sends a time of day only, read as the first occurrence after
          the incident opened. Incidents with no SLA are listed last.
        </p>
      )}

      <QueryState q={incidents} what="the incident list" skeletonLines={4}>
        {() =>
          rows.length === 0 ? (
            <div className="empty">
              <b>No incidents in this view</b>
              {stage ? `Nothing is at the "${STAGE_LABEL[stage]}" stage right now.` : 'The queue is clear.'}
            </div>
          ) : (
            <div>
              {rows.map((inc) => (
                <article className="inc" data-s={inc.severity} key={inc.id} tabIndex={0}>
                  <div className="inc-t">
                    <div className="inc-ti">
                      <Link to={`/incidents/${inc.id}`}>{inc.title}</Link>
                    </div>
                    <div className="loop">
                      {STAGES.map((s, si) => (
                        <i
                          key={s}
                          className={
                            si < STAGES.indexOf(inc.stage)
                              ? 'd'
                              : si === STAGES.indexOf(inc.stage)
                                ? 'a'
                                : ''
                          }
                        />
                      ))}
                    </div>
                  </div>
                  <div className="inc-c">
                    {[inc.id, inc.system, inc.branch && `branch ${inc.branch}`, inc.owner, inc.slaAt && `SLA ${inc.slaAt}`, inc.openedAt && `opened ${inc.openedAt}`]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  {inc.diagnosis && (
                    <div className="inc-d">
                      {inc.diagnosis.text}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 8, marginTop: 11, alignItems: 'center', flexWrap: 'wrap' }}>
                    {inc.diagnosis && (
                      <Conf value={inc.diagnosis.confidence} pct={inc.diagnosis.confidencePct} />
                    )}
                    <Link className="btn btn-p btn-s" to={`/incidents/${inc.id}`}>
                      Review proposed action →
                    </Link>
                  </div>
                  {inc.diagnosis?.citations && <CiteRow citations={inc.diagnosis.citations} />}
                </article>
              ))}
            </div>
          )
        }
      </QueryState>
    </div>
  );
}

/**
 * POST /incidents — observe a new incident. Dev harness for the loop: the response's
 * `recognised` flag and `note` are the point (same fingerprint at another branch →
 * opens at understood with the past fix attached), so show them rather than navigating away.
 */
function ObserveIncident({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('warn');
  const [module, setModule] = useState('');
  const [stageName, setStageName] = useState('');
  const [branch, setBranch] = useState('');
  const qc = useQueryClient();

  const create = useMutation<ObserveIncidentResponse, ApiError>({
    mutationFn: () =>
      IncidentsApi.create({
        title,
        message,
        severity,
        module: module || undefined,
        stageName: stageName || undefined,
        branch: branch || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      qc.invalidateQueries({ queryKey: ['audit'] });
      qc.invalidateQueries({ queryKey: ['audit-verify'] });
      onDone();
    },
  });
  const res = create.data;

  if (!open)
    return (
      <button className="btn btn-s btn-p" onClick={() => setOpen(true)}>
        + Observe incident
      </button>
    );

  return (
    <div className="panel" style={{ minWidth: 320 }}>
      <div className="t-label" style={{ marginBottom: 8 }}>
        Observe incident
      </div>
      <input
        className="cin"
        style={{ width: '100%', marginBottom: 6 }}
        placeholder="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="cin"
        style={{ width: '100%', marginBottom: 6 }}
        placeholder="Message (what was seen)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
      />
      <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
        <input className="cin" style={{ flex: 1, minWidth: 0 }} placeholder="Module" value={module} onChange={(e) => setModule(e.target.value)} />
        <input className="cin" style={{ flex: 1, minWidth: 0 }} placeholder="Stage name" value={stageName} onChange={(e) => setStageName(e.target.value)} />
        <input className="cin" style={{ flex: 1, minWidth: 0 }} placeholder="Branch" value={branch} onChange={(e) => setBranch(e.target.value)} />
      </div>
      <select
        className="sel"
        style={{ width: '100%', marginBottom: 8 }}
        value={severity}
        onChange={(e) => setSeverity(e.target.value)}
      >
        <option value="crit">crit</option>
        <option value="warn">warn</option>
        <option value="info">info</option>
      </select>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-s btn-p"
          disabled={!title || !message || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? 'Observing…' : 'Observe'}
        </button>
        <button className="btn btn-s btn-q" onClick={() => { setOpen(false); create.reset(); }}>
          {res ? 'Close' : 'Cancel'}
        </button>
      </div>
      {res && (
        <div className={res.recognised ? 'receipt' : 'note'} style={{ marginTop: 10 }}>
          <b>
            {res.recognised ? 'Recognised' : 'Not recognised'} · {res.incident.id} opened at{' '}
            {STAGE_LABEL[res.incident.stage] ?? res.incident.stage}
          </b>
          {res.incident.pastFix && (
            <div className="t-cap">
              Past fix {res.incident.pastFix.id} attached at {res.incident.pastFix.match}%
            </div>
          )}
          {res.note && <div className="t-cap">{res.note}</div>}
          <Link className="btn btn-s" style={{ marginTop: 6 }} to={`/incidents/${res.incident.id}`}>
            Open {res.incident.id} →
          </Link>
        </div>
      )}
      {create.error && <ApiErrorBanner error={create.error} what="the new incident" />}
    </div>
  );
}
