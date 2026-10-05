import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CortexApi, type CortexAnswer } from '../api/endpoints';
import { useLens } from '../context/LensContext';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, PanelHead, Conf, CiteRow } from '../components/ui';
import type { ApiError } from '../api/client';

const SCREENS = ['today', 'incidents', 'incident-detail', 'eod', 'audit', 'corpus', 'resolution-detail'];

/**
 * Cortex, as its own screen. `/cortex/context` supplies the per-screen
 * context line and suggestion chips; `POST /cortex/ask` answers a question
 * and returns a confidence, citations, and whether the refusal threshold was
 * applied — all rendered here verbatim.
 *
 * Defaults to the incident-detail context because that's where the mock holds
 * the most grounded material; `today` mostly refuses, which is Cortex working
 * as designed, not an error.
 */
export function Cortex() {
  const { lens } = useLens();
  const [screen, setScreen] = useState('incident-detail');
  const [objectId, setObjectId] = useState('INC-2261');
  const [question, setQuestion] = useState('');

  const context = useQuery({
    queryKey: ['cortex-context', screen, lens, objectId],
    queryFn: () => CortexApi.context(screen, lens, objectId || undefined),
  });

  const ask = useMutation<CortexAnswer, ApiError, string>({
    mutationFn: (q: string) =>
      CortexApi.ask({ question: q, context: { screen, lens, objectId: objectId || null } }),
  });

  const submit = (q: string) => {
    const t = q.trim();
    if (!t) return;
    setQuestion(t);
    ask.mutate(t);
  };

  const refused = ask.data?.confidence === 'refused';

  return (
    <div className="stack">
      <ScreenHeader title="Cortex" crumb="All lenses" subtitle="fast path · grounded or it refuses" />
      <Trace>Ask about what a screen is showing. An answer you cannot check is worse than none.</Trace>

      <div className="panel">
        <PanelHead label="Context" chip={`lens: ${lens}`} />
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
          <select
            className="sel"
            style={{ width: 'auto' }}
            value={screen}
            onChange={(e) => setScreen(e.target.value)}
          >
            {SCREENS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <input
            className="cin"
            style={{ width: 'auto', flex: 1, minWidth: 180 }}
            placeholder="object id (optional) — e.g. INC-2261"
            value={objectId}
            onChange={(e) => setObjectId(e.target.value)}
          />
        </div>
        {context.error && <ApiErrorBanner error={context.error as ApiError} what="the Cortex context" />}
        {context.isLoading && <p className="muted">Loading context…</p>}
        {context.data && (
          <>
            <div className="cop-c">{context.data.context}</div>
            <div className="mb" style={{ marginTop: 10 }}>
              {context.data.message}
            </div>
            <div className="t-cap" style={{ margin: '10px 0 4px' }}>
              Suggested questions — click to ask:
            </div>
            <div className="crow">
              {context.data.suggestions.map((s) => (
                <button key={s} className="cite" onClick={() => submit(s)} disabled={ask.isPending}>
                  {s}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="panel">
        <PanelHead label="Ask" />
        <form
          style={{ display: 'flex', gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            submit(question);
          }}
        >
          <input
            className="cin"
            style={{ flex: 1 }}
            placeholder="Ask about what you're looking at…"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          <button className="btn btn-p" type="submit" disabled={ask.isPending || !question.trim()}>
            {ask.isPending ? 'Asking…' : 'Ask'}
          </button>
        </form>

        {ask.error && <ApiErrorBanner error={ask.error} what="the Cortex answer" />}

        {ask.data && (
          <div
            style={{
              marginTop: 12,
              borderLeft: `2px solid ${refused ? 'var(--text-low)' : 'var(--ok)'}`,
              paddingLeft: 12,
            }}
          >
            <PanelHead label={`Answer · ${ask.data.answerId}`}>
              <Conf value={ask.data.confidence} pct={ask.data.confidencePct} />
            </PanelHead>
            <p className="body-copy">{ask.data.answer}</p>
            <CiteRow citations={ask.data.citations} />
            {ask.data.notVerified.length > 0 && (
              <div className="regress">Not verified: {ask.data.notVerified.join('; ')}</div>
            )}
            {ask.data.threshold && (
              <div className="t-cap mono" style={{ marginTop: 8 }}>
                refuseBelowConfidence {ask.data.threshold.refuseBelowConfidence}% ·{' '}
                {ask.data.threshold.applied ? 'threshold applied' : 'not triggered'}
              </div>
            )}
            {refused && (
              <div className="note" style={{ marginTop: 8 }}>
                A refusal is the expected response when Cortex has no grounded material for a
                question — it is working, not failing. Try a question tied to the current context,
                e.g. <em>"What evidence supports this diagnosis?"</em> or <em>"Has this happened
                before?"</em> on an incident.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
