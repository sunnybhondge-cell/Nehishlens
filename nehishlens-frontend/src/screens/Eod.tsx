import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EodApi, type RunStage } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { Trace, PanelHead, QueryState } from '../components/ui';

/** Screen 3 · EOD & Batch — run timeline (`/runs/{id}`) + feed health. */
const DEFAULT_RUN = '2026-07-28';

export function Eod() {
  const { runId = DEFAULT_RUN } = useParams<{ runId: string }>();
  const run = useHydrated(['run', runId], () => EodApi.run(runId));
  const feeds = useHydrated(['feeds-health'], EodApi.feedHealth);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="stack">
      <ScreenHeader
        title={`EOD run — ${runId}`}
        crumb="Operations"
        subtitle={
          run.data
            ? `cutoff ${run.data.cutoff} → BOD ${run.data.bodDeadline} · ${
                run.data.gap ? 'partial run data' : `completed ${run.data.completedAt}`
              }`
            : undefined
        }
      />
      <Trace>Select a stage to inspect its cause, deviation and downstream impact.</Trace>

      <QueryState q={run} what="the run timeline" skeletonLines={4}>
        {(r) => {
          const maxMin = Math.max(...r.stages.map((s) => Math.max(s.expectedMin, s.actualMin)), 1);
          const sel = r.stages.find((s) => s.name === selected) ?? null;
          // A gap means the stage list is truncated: the server makes no completion claim,
          // so neither do we — completion, BOD and stage counts are withheld, not inferred.
          const partial = !!r.gap;
          const gapText = !r.gap
            ? null
            : typeof r.gap === 'string'
              ? r.gap
              : r.gap.message ?? `Missing: ${(r.gap.missing ?? []).join(', ')}`;
          return (
            <>
              {partial ? (
                <div className="regress" role="status">
                  <b>Partial run data — {r.stages.length} stages returned.</b> {gapText}
                </div>
              ) : (
                <div className="banner">
                  <strong>Overnight run.</strong> Completed {r.completedAt},{' '}
                  {r.deviationMinutes >= 0 ? `${r.deviationMinutes} minutes over expectation` : 'ahead of expectation'}
                  {r.bodBreached ? ' — BOD deadline breached.' : ', BOD deadline held.'}
                </div>
              )}

              <div className="run-summary">
                <div className={`run-kpi ${partial ? '' : r.bodBreached ? 'crit' : 'warn'}`}>
                  <div className="rk">Run completion</div>
                  <div className="rv">{partial ? 'Not claimed' : r.completedAt}</div>
                  <div className="rc">{partial ? 'stage data incomplete' : `+${r.deviationMinutes}m vs expected`}</div>
                </div>
                <div className="run-kpi warn">
                  <div className="rk">Primary deviation</div>
                  <div className="rv">
                    +
                    {Math.max(
                      ...r.stages.map((s) => s.actualMin - s.expectedMin),
                      0,
                    )}
                    m
                  </div>
                  <div className="rc">
                    {r.stages.length === 0
                      ? '—'
                      : r.stages.reduce((a, b) =>
                          b.actualMin - b.expectedMin > a.actualMin - a.expectedMin ? b : a,
                        ).name}
                  </div>
                </div>
                <div className={`run-kpi ${partial ? '' : r.bodBreached ? 'crit' : 'ok'}`}>
                  <div className="rk">BOD</div>
                  <div className="rv">{partial ? 'Not claimed' : r.bodBreached ? 'Breached' : 'Held'}</div>
                  <div className="rc">deadline {r.bodDeadline}</div>
                </div>
                <div className="run-kpi">
                  <div className="rk">Affected stages</div>
                  <div className="rv">{r.stages.filter((s) => s.state !== 'ok').length}</div>
                  <div className="rc">
                    of {r.stages.length}
                    {partial ? ' returned' : ''}
                  </div>
                </div>
              </div>

              <div className="ops-timeline">
                <PanelHead
                  label="Operational run timeline"
                  chip={partial ? `partial · ${r.stages.length} stages` : `completed ${r.completedAt}`}
                />
                <div style={{ fontSize: 11.5, color: 'var(--text-mid)', margin: '4px 0 10px' }}>
                  Expected duration is the light track; actual execution is the accent track. Amber marks
                  deviation, red a critical stall.
                </div>
                {r.stages.map((s) => (
                  <button
                    key={s.name}
                    className={`stage-row gantt-row ${selected === s.name ? 'sel' : ''}`}
                    onClick={() => setSelected(s.name === selected ? null : s.name)}
                  >
                    <div className="gantt-label">
                      <span
                        className={`stage-dot ${s.state === 'crit' ? 'crit' : s.state === 'warn' ? 'warn' : 'ok'}`}
                      />
                      <span className="mono">{s.name}</span>
                    </div>
                    <div className="gantt-track" style={{ height: 30 }}>
                      <span
                        className="gantt-bar expected"
                        style={{ width: `${(s.expectedMin / maxMin) * 100}%` }}
                      />
                      <span
                        className={`gantt-bar actual ${s.state === 'crit' ? 'crit' : s.state === 'warn' ? 'warn' : ''}`}
                        style={{ width: `${(s.actualMin / maxMin) * 100}%` }}
                      />
                    </div>
                  </button>
                ))}

                {partial && (
                  <div className="muted" style={{ fontSize: 11.5, padding: '8px 0' }}>
                    ⋯ remaining stages not returned — {gapText}
                  </div>
                )}

                {sel && <StageFocus stage={sel} />}
              </div>

            </>
          );
        }}
      </QueryState>

      <div className="panel">
        <PanelHead label="Feed coverage — last 24h" />
        <QueryState q={feeds} what="feed health" skeletonLines={3}>
          {(items) => (
            <>
              {items.map((f) => (
                <div className="claim" key={f.sourceId}>
                  <span className={`pip ${f.state === 'ok' ? 'p-ok' : 'p-warn'}`} />
                  <span className="lb">{f.name}</span>
                  <span className="mono t-cap">
                    {f.state === 'ok'
                      ? `covered · heartbeat ${f.lastHeartbeat ? new Date(f.lastHeartbeat).toLocaleString() : '—'}`
                      : `${f.state}${f.lastHeartbeat ? ` · last heartbeat ${new Date(f.lastHeartbeat).toLocaleString()}` : ' · no heartbeat on record'}${f.note ? ` — ${f.note}` : ''}`}
                  </span>
                </div>
              ))}
              <div className="note" style={{ marginTop: 10 }}>
                A source with no heartbeat cannot prove it was quiet rather than broken — that
                distinction is why an evidence pack can make a completeness claim at all.
              </div>
            </>
          )}
        </QueryState>
      </div>
    </div>
  );
}

function StageFocus({ stage }: { stage: RunStage }) {
  const dev = stage.actualMin - stage.expectedMin;
  return (
    <div className="stage-focus">
      <div>
        <div className="sf-title">{stage.name}</div>
        <div className="sf-sub">Selected stage · intervention point</div>
        <div className="sf-grid">
          <div>
            <div className="sf-k">Expected</div>
            <div className="sf-v">{stage.expectedMin}m</div>
          </div>
          <div>
            <div className="sf-k">Actual</div>
            <div className="sf-v" style={{ color: stage.state === 'crit' ? 'var(--crit)' : undefined }}>
              {stage.actualMin}m
            </div>
          </div>
          <div>
            <div className="sf-k">Deviation</div>
            <div className="sf-v" style={{ color: dev > 0 ? 'var(--warn)' : undefined }}>
              {dev >= 0 ? '+' : ''}
              {dev}m
            </div>
          </div>
          <div>
            <div className="sf-k">State</div>
            <div className="sf-v">{stage.state}</div>
          </div>
        </div>
      </div>
      <div>
        <div className="sf-title">Cause &amp; impact</div>
        <div className="sf-sub">{stage.note ?? 'No note recorded for this stage.'}</div>
        {stage.incidentId && (
          <div className="dependency">
            <Link className="btn btn-s" to={`/incidents/${stage.incidentId}`}>
              Open {stage.incidentId} →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
