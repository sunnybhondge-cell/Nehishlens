import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { CorpusApi } from '../api/endpoints';
import { ApiErrorBanner } from './ApiErrorBanner';
import { PanelHead } from './ui';
import type { ApiError } from '../api/client';

/**
 * Problem fingerprint sheet — `GET /signatures/{id}` + `/occurrences`.
 * The excluded facets are rendered on purpose: "branch is not part of the
 * fingerprint" is what explains why matching works at all.
 */
export function SignatureSheet({ signatureId }: { signatureId: string }) {
  const signature = useQuery<Awaited<ReturnType<typeof CorpusApi.signature>>, ApiError>({
    queryKey: ['signature', signatureId],
    queryFn: () => CorpusApi.signature(signatureId),
  });
  const occurrences = useQuery({
    queryKey: ['signature-occurrences', signatureId],
    queryFn: () => CorpusApi.signatureOccurrences(signatureId),
  });

  return (
    <div className="panel">
      <PanelHead label="Problem fingerprint" chip={signatureId} />
      {signature.error ? (
        <ApiErrorBanner error={signature.error} what="the problem fingerprint" />
      ) : !signature.data ? (
        <p className="muted">Loading fingerprint…</p>
      ) : (
        <>
          <div className="kv">
            <div className="k">Included</div>
            <div className="v">{signature.data.facetsIncluded.join(', ') || '—'}</div>
          </div>
          <div className="kv">
            <div className="k">Excluded</div>
            <div className="v">{signature.data.facetsExcluded.join(', ') || '—'}</div>
          </div>
          {signature.data.facetsExcluded.length > 0 && (
            <div className="t-cap" style={{ marginTop: 6 }}>
              {signature.data.facetsExcluded.map((f) => `${f} is not part of the fingerprint.`).join(' ')}
            </div>
          )}
          {signature.data.note && (
            <p className="body-copy" style={{ marginTop: 6 }}>
              {signature.data.note}
            </p>
          )}
          <div className="t-cap" style={{ marginTop: 6 }}>
            Seen {signature.data.occurrenceCount}×
          </div>
          {occurrences.data && occurrences.data.length > 0 && (
            <div className="crow" style={{ marginTop: 8 }}>
              {occurrences.data.map((o) => (
                <Link key={o.id} className="cite" to={`/incidents/${encodeURIComponent(o.id)}`}>
                  {o.id} · {o.stage}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
