import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActionsApi,
  CorpusApi,
  IncidentsApi,
  STAGES,
  STAGE_LABEL,
  type ApproveActionResponse,
  type ActionRecord,
} from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { useLens } from '../context/LensContext';
import { useAuth } from '../context/AuthContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, PanelHead, Conf, CiteRow, QueryState } from '../components/ui';
import type { ApiError } from '../api/client';

/**
 * Screen 2 · Incident detail — the full loop, wired end to end:
 * diagnosis + evidence (`/incidents/{id}`), recall match (`/incidents/{id}/recall`),
 * the action surface gated on `/policy/approvers`, then
 * propose (`POST /actions`) → approve (`POST /actions/{id}/approve`) → receipt,
 * and loop advance (`PATCH /incidents/{id}/loop`).
 */
export function IncidentDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { lens } = useLens();
  const { user } = useAuth();
  const qc = useQueryClient();

  const incident = useHydrated(['incident', id], () => IncidentsApi.detail(id));
  const recall = useHydrated(['incident-recall', id], () => IncidentsApi.recall(id));
  const approvers = useQuery({
    queryKey: ['approvers', lens, id],
    queryFn: () => ActionsApi.approvers(lens, id),
  });

  const [approverId, setApproverId] = useState('');
  const [proposed, setProposed] = useState<ActionRecord | null>(null);
  const [approval, setApproval] = useState<ApproveActionResponse | null>(null);

  const proposerId = user?.name ?? 'operator';

  const propose = useMutation<ActionRecord, ApiError>({
    mutationFn: () =>
      ActionsApi.propose({
        incidentId: id,
        steps: incident.data?.actionSteps ?? [],
        proposerId,
        requiredApproverId: approverId || approvers.data?.candidates[0]?.id || '',
        resolutionId: incident.data?.pastFix?.id,
      }),
    onSuccess: (rec) => setProposed(rec),
  });

  const approve = useMutation<ApproveActionResponse, ApiError>({
    mutationFn: () =>
      ActionsApi.approve(proposed!.id, {
        approverId: approverId || (proposed!.requiredApproverId as string),
        outcome: 'applied',
      }),
    onSuccess: (res) => {
      setApproval(res);
      qc.invalidateQueries({ queryKey: ['incident', id] });
      qc.invalidateQueries({ queryKey: ['audit'] });
    },
  });

  // Re-fetch the receipt as its own record once the action is approved.
  const receipt = useQuery({
    queryKey: ['action-receipt', proposed?.id],
    queryFn: () => ActionsApi.receipt(proposed!.id),
    enabled: !!approval && !!proposed,
  });

  const advance = useMutation<unknown, ApiError, string>({
    mutationFn: (toStage: string) => IncidentsApi.advanceLoop(id, toStage, proposerId, 'loop advanced from detail screen'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident', id] }),
  });

  const rejectRecall = useMutation<unknown, ApiError>({
    mutationFn: () => IncidentsApi.rejectRecall(id, proposerId, 'not the same signature'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['incident-recall', id] }),
  });

  return (
    <div className="stack">
      <ScreenHeader
        title={incident.data?.title ?? id}
        crumb={<Link to="/incidents">← Incidents</Link>}
        subtitle={
          incident.data
            ? [incident.data.id, incident.data.system, incident.data.branch && `branch ${incident.data.branch}`, incident.data.slaAt && `SLA ${incident.data.slaAt}`]
                .filter(Boolean)
                .join(' · ')
            : undefined
        }
      />
      <Trace>Reviewing and recording happen here — opening happened on the list.</Trace>

      <QueryState q={incident} what="this incident" skeletonLines={4}>
        {(inc) => (
          <>
            <div className="panel">
              <PanelHead label="Impact" />
              <p className="body-copy">{inc.impact}</p>
            </div>

            <div className="panel">
              <PanelHead label="Diagnosis">
                {inc.diagnosis && (
                  <Conf value={inc.diagnosis.confidence} pct={inc.diagnosis.confidencePct} />
                )}
              </PanelHead>
              <p className="body-copy">{inc.diagnosis?.text}</p>
              <CiteRow citations={inc.diagnosis?.citations} />
              {inc.diagnosis?.notVerified && inc.diagnosis.notVerified.length > 0 && (
                <div className="regress">
                  Not verified: {inc.diagnosis.notVerified.join('; ')}
                </div>
              )}
            </div>

            <div className="panel">
              <PanelHead label="Loop" chip={STAGE_LABEL[inc.stage] ?? inc.stage} />
              <div className="stepper">
                {STAGES.map((s, si) => {
                  const cur = STAGES.indexOf(inc.stage);
                  return (
                    <div
                      key={s}
                      className={`step ${si < cur ? 'done' : si === cur ? 'active' : ''}`}
                    >
                      <div className="ln" />
                      <div className="dot">{si + 1}</div>
                      <div className="lbl">{STAGE_LABEL[s]}</div>
                    </div>
                  );
                })}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                {STAGES.slice(STAGES.indexOf(inc.stage) + 1, STAGES.indexOf(inc.stage) + 2).map((s) => (
                  <button
                    key={s}
                    className="btn btn-s"
                    disabled={advance.isPending}
                    onClick={() => advance.mutate(s)}
                  >
                    Advance to {STAGE_LABEL[s]}
                  </button>
                ))}
              </div>
              {advance.error && <ApiErrorBanner error={advance.error} what="the loop advance" />}
            </div>

            {/* Past fix / recall */}
            <div className="panel">
              <PanelHead label="Recall — past fix" />
              <QueryState q={recall} what="the recall match" skeletonLines={2}>
                {(r) =>
                  r.match ? (
                    <>
                      <div className="inc-d">
                        <b>
                          {r.match.title} — {r.match.matchPct}% match, {r.match.resolutionId}
                        </b>
                        , applied {r.match.appliedDate}, reused {r.match.reuseCount}×. Threshold{' '}
                        {r.thresholdPct}%{r.thresholdTuned ? '' : ' (not tuned)'}.
                      </div>
                      <ol>
                        {r.match.steps.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ol>
                      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                        <Link className="btn btn-s" to={`/corpus/${encodeURIComponent(r.match.resolutionId)}`}>
                          Open {r.match.resolutionId} →
                        </Link>
                        <button
                          className="btn btn-s btn-q"
                          disabled={rejectRecall.isPending}
                          onClick={() => rejectRecall.mutate()}
                        >
                          Not the same thing
                        </button>
                      </div>
                      {rejectRecall.error && (
                        <ApiErrorBanner error={rejectRecall.error} what="the recall rejection" />
                      )}
                      {rejectRecall.isSuccess && (
                        <p className="fixture-note">Recall rejected — logged.</p>
                      )}
                    </>
                  ) : (
                    <p className="muted">{r.note ?? 'No past fix above the match threshold.'}</p>
                  )
                }
              </QueryState>
            </div>

            {/* Action surface — gated on /policy/approvers resolving first */}
            <div className="panel">
              <PanelHead label="Action — maker / checker" />
              {approvers.isLoading && <p className="muted">Resolving approver policy…</p>}
              {approvers.error && (
                <ApiErrorBanner error={approvers.error as ApiError} what="the approver policy" />
              )}
              {approvers.data && (
                <>
                  {inc.actionSteps.length > 0 ? (
                    <ol>
                      {inc.actionSteps.map((s, i) => (
                        <li key={i}>{s}</li>
                      ))}
                    </ol>
                  ) : (
                    <p className="muted">No action steps proposed for this incident yet.</p>
                  )}
                  <div className="kv">
                    <div className="k">Proposer</div>
                    <div className="v">{proposerId}</div>
                  </div>
                  <div className="kv">
                    <div className="k">Required approvers</div>
                    <div className="v">{approvers.data.required}</div>
                  </div>
                  <label className="t-cap" style={{ display: 'block', margin: '10px 0 4px' }}>
                    Approver
                  </label>
                  <select
                    className="sel"
                    value={approverId}
                    onChange={(e) => setApproverId(e.target.value)}
                  >
                    <option value="">Select a checker…</option>
                    {approvers.data.candidates.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} · {a.role}
                      </option>
                    ))}
                  </select>

                  <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-p"
                      disabled={
                        !approverId ||
                        inc.actionSteps.length === 0 ||
                        propose.isPending ||
                        !!proposed
                      }
                      onClick={() => propose.mutate()}
                    >
                      {proposed ? 'Proposed ✓' : 'Propose action'}
                    </button>
                    <button
                      className="btn btn-ok"
                      disabled={!proposed || approve.isPending || !!approval}
                      onClick={() => approve.mutate()}
                    >
                      {approval ? 'Approved ✓' : 'Approve & apply'}
                    </button>
                  </div>

                  {propose.error && <ApiErrorBanner error={propose.error} what="the proposal" />}
                  {approve.error && <ApiErrorBanner error={approve.error} what="the approval" />}

                  {approval && (
                    <div className="receipt" style={{ marginTop: 12 }}>
                      ✓ {approval.action.status} · stage {approval.incidentStage} · receipt{' '}
                      {approval.receipt.hash ?? approval.receipt.id ?? approval.receipt.actionId}
                    </div>
                  )}
                  {receipt.data && (
                    <div className="mono t-cap wrap-anywhere" style={{ marginTop: 8 }}>
                      GET /actions/{proposed?.id}/receipt →{' '}
                      {JSON.stringify(receipt.data).slice(0, 400)}
                    </div>
                  )}
                </>
              )}
            </div>

            <CaptureResolutionPanel
              incidentId={id}
              stage={inc.stage}
              approvedBy={approverId || approvers.data?.candidates[0]?.id || proposerId}
              draftedBy={proposerId}
              onCaptured={() => qc.invalidateQueries({ queryKey: ['corpus-metrics'] })}
            />

            {inc.externalInstructions && (
              <div className="note">{inc.externalInstructions}</div>
            )}
          </>
        )}
      </QueryState>
    </div>
  );
}

/**
 * Capture this incident's resolution into the corpus (`POST /resolutions`) —
 * the "loop leaking" fix from Corpus. Only meaningful once the incident has
 * been acted on, so it's collapsed until then.
 */
function CaptureResolutionPanel({
  incidentId,
  stage,
  approvedBy,
  draftedBy,
  onCaptured,
}: {
  incidentId: string;
  stage: string;
  approvedBy: string;
  draftedBy: string;
  onCaptured: () => void;
}) {
  const [form, setForm] = useState({
    title: '',
    problem: '',
    cause: '',
    fix: '',
    verification: '',
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const capture = useMutation<unknown, ApiError>({
    mutationFn: () =>
      CorpusApi.capture({ incidentId, ...form, approvedBy, draftedBy }),
    onSuccess: onCaptured,
  });

  const ready = form.title && form.problem && form.cause && form.fix && form.verification;
  const acted = stage === 'acted' || stage === 'remembered';

  return (
    <details className="panel" open={acted}>
      <summary className="ph" style={{ cursor: 'pointer', listStyle: 'none' }}>
        <span className="t-label">Capture resolution to corpus</span>
        <span className="chip">POST /resolutions</span>
      </summary>
      <p className="t-cap" style={{ margin: '8px 0' }}>
        Writes this fix into institutional memory so the next occurrence starts from a match, not
        from zero. Approved by <b>{approvedBy}</b>.
      </p>
      {(['title', 'problem', 'cause', 'fix', 'verification'] as const).map((k) => (
        <div key={k} style={{ marginBottom: 8 }}>
          <label className="t-cap" style={{ display: 'block', marginBottom: 3, textTransform: 'capitalize' }}>
            {k}
          </label>
          <input className="cin" style={{ width: '100%' }} value={form[k]} onChange={set(k)} />
        </div>
      ))}
      <button
        className="btn btn-p btn-s"
        disabled={!ready || capture.isPending || capture.isSuccess}
        onClick={() => capture.mutate()}
      >
        {capture.isSuccess ? 'Captured ✓' : 'Capture resolution'}
      </button>
      {capture.error && <ApiErrorBanner error={capture.error} what="the resolution capture" />}
    </details>
  );
}
