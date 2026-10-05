import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { IncidentsApi, STAGES, STAGE_LABEL, type IncidentDetailResponse } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, Conf, CiteRow, QueryState } from '../components/ui';
import type { ApiError } from '../api/client';
import { useAccess } from '../hooks/useAccess';

/** Screen 2 · Incidents — one object, one queue, filtered by loop state. */
export function IncidentsList() {
  const { readOnly } = useAccess('/incidents');
  const incidents = useHydrated(['incidents'], () => IncidentsApi.list());
  const [stage, setStage] = useState<string | null>(null);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const i of incidents.data ?? []) c[i.stage] = (c[i.stage] ?? 0) + 1;
    return c;
  }, [incidents.data]);

  const rows = (incidents.data ?? []).filter((i) => !stage || i.stage === stage);

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
      </div>

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

/** POST /incidents — observe a new incident and jump to its detail page. */
function ObserveIncident({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState('warn');
  const navigate = useNavigate();
  const qc = useQueryClient();

  const create = useMutation<IncidentDetailResponse, ApiError>({
    mutationFn: () => IncidentsApi.create({ title, message, severity }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ['incidents'] });
      onDone();
      setOpen(false);
      const newId = (res as { incident?: { id?: string }; id?: string }).incident?.id ?? res.id;
      if (newId) navigate(`/incidents/${newId}`);
    },
  });

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
        <button className="btn btn-s btn-q" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
      {create.error && <ApiErrorBanner error={create.error} what="the new incident" />}
    </div>
  );
}
