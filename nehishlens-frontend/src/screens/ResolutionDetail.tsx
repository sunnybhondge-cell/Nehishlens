import { Link, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CorpusApi } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { SignatureSheet } from '../components/SignatureSheet';
import { Trace, PanelHead, Conf, CiteRow, QueryState, CheckIcon } from '../components/ui';
import { useAccess } from '../hooks/useAccess';
import type { ApiError } from '../api/client';

/** Route /corpus/:id — the full resolution record + reuse action. */
export function ResolutionDetail() {
  const { id = '' } = useParams<{ id: string }>();
  const { readOnly } = useAccess('/corpus');
  const qc = useQueryClient();
  const resolution = useHydrated(['resolution', id], () => CorpusApi.resolution(id));

  const sigId = resolution.data?.signatureId;

  const reuse = useMutation<unknown, ApiError>({
    mutationFn: () => CorpusApi.reuse(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['resolution', id] });
      qc.invalidateQueries({ queryKey: ['corpus-metrics'] });
    },
  });

  return (
    <div className="stack">
      <ScreenHeader
        title={resolution.data?.title ?? id}
        crumb={<Link to="/corpus">← Corpus</Link>}
        subtitle={resolution.data ? `${resolution.data.id} · ${resolution.data.status}` : undefined}
      />
      <Trace>This record is what gets matched next time the same signature shows up.</Trace>

      <QueryState q={resolution} what="this resolution" skeletonLines={4}>
        {(r) => (
          <>
            <div className="panel">
              <PanelHead label="Problem">
                <Conf value={r.confidence} />
              </PanelHead>
              <p className="body-copy">{r.problem}</p>
            </div>
            <div className="panel">
              <PanelHead label="Cause" />
              <p className="body-copy">{r.cause}</p>
            </div>
            <div className="panel">
              <PanelHead label="Fix" />
              <p className="body-copy">{r.fix}</p>
            </div>
            <div className="panel">
              <PanelHead label="Verification" />
              <p className="body-copy">{r.verification}</p>
              <CiteRow citations={r.citations} />
            </div>

            <div className="panel">
              <PanelHead label="Provenance" />
              <div className="kv">
                <div className="k">Approved by</div>
                <div className="v">{r.approvedBy}</div>
              </div>
              <div className="kv">
                <div className="k">Approved on</div>
                <div className="v">{r.approvedOn}</div>
              </div>
              <div className="kv">
                <div className="k">Reuse count</div>
                <div className="v">{r.reuseCount}×</div>
              </div>
              <div className="kv">
                <div className="k">Last reused</div>
                <div className="v">{r.lastReused}</div>
              </div>
              {readOnly ? (
                <p className="t-cap" style={{ marginTop: 12 }}>
                  Read-only for this lens.
                </p>
              ) : (
                <div style={{ marginTop: 12 }}>
                  <button
                    className="btn btn-p btn-s"
                    disabled={reuse.isPending}
                    onClick={() => reuse.mutate()}
                  >
                    {reuse.isSuccess ? <>Reuse recorded <CheckIcon /></> : 'Record a reuse'}
                  </button>
                </div>
              )}
              {reuse.error && <ApiErrorBanner error={reuse.error} what="the reuse record" />}
            </div>

            {r.relatedIncidents && r.relatedIncidents.length > 0 && (
              <div className="panel">
                <PanelHead label="Related incidents" />
                <div className="crow">
                  {r.relatedIncidents.map((inc) => (
                    <Link key={inc} className="cite" to={`/incidents/${inc}`}>
                      {inc}
                    </Link>
                  ))}
                </div>
              </div>
            )}

            {sigId && <SignatureSheet signatureId={sigId} />}
          </>
        )}
      </QueryState>
    </div>
  );
}
