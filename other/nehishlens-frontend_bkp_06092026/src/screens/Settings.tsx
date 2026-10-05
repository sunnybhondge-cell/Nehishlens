import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { SettingsApi, MockControlApi, type ThresholdEntry } from '../api/endpoints';
import { useHydrated } from '../hooks/useHydrated';
import { ScreenHeader } from '../components/ScreenHeader';
import { ApiErrorBanner } from '../components/ApiErrorBanner';
import { Trace, PanelHead, TableRowsState } from '../components/ui';
import type { ApiError } from '../api/client';

const LABEL: Record<string, string> = {
  recallMinMatch: 'Recall — minimum match',
  refuseBelowConfidence: 'Confidence — refuse below',
  staleSourceDays: 'Source — stale after',
};

const EFFECT: Record<string, string> = {
  recallMinMatch: 'Below this a past fix is not offered at all.',
  refuseBelowConfidence: 'Below this Cortex refuses rather than answers.',
  staleSourceDays: 'Refresh expectation before a source is treated as stale.',
};

/**
 * Screen 7 · Settings. Renders exactly the thresholds `/config/thresholds`
 * exposes (3 today) — no more, no less. Nobody has Edit in phase 1; PATCH is
 * not implemented on the mock, so this screen is read-only.
 */
export function Settings() {
  const thresholds = useHydrated(['thresholds'], SettingsApi.thresholds);

  return (
    <div className="stack">
      <ScreenHeader title="Settings" crumb="All lenses" subtitle="tenant Sunflex · changes are audited" />
      <Trace>
        Thresholds that decide what a 2 a.m. engineer sees are product parameters, not constants
        buried in code.
      </Trace>

      <div className="panel">
        <PanelHead label="Recall & confidence thresholds" chip="read-only" />
        <div className="tbl">
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Value</th>
                <th>Tuned</th>
                <th>Effect</th>
              </tr>
            </thead>
            <tbody>
              <TableRowsState q={thresholds} what="the thresholds" cols={4}>
                {(t) => (
                  <>
                    {(Object.entries(t) as [string, ThresholdEntry][]).map(([key, entry]) => (
                      <tr key={key}>
                        <td>{LABEL[key] ?? key}</td>
                        <td className="mono">
                          <b>
                            {entry.value}
                            {entry.unit}
                          </b>
                        </td>
                        <td>
                          <span className={`conf ${entry.tuned ? 'c-g' : 'c-u'}`} style={{ padding: '2px 8px' }}>
                            {entry.tuned ? 'tuned' : 'not tuned'}
                          </span>
                        </td>
                        <td>{entry.note ?? EFFECT[key] ?? ''}</td>
                      </tr>
                    ))}
                  </>
                )}
              </TableRowsState>
            </tbody>
          </table>
        </div>
        <div className="note" style={{ marginTop: 12 }}>
          The values are visible because a bank's compliance team will ask what number decides whether
          an engineer is shown a fix — and "it's in the code" is not an answer.
        </div>
      </div>

      {import.meta.env.DEV && <MockControls />}
    </div>
  );
}

/** Dev-only. Exposes the mock's own control endpoints for testing. */
function MockControls() {
  const qc = useQueryClient();
  const states = useQuery({ queryKey: ['mock-states'], queryFn: MockControlApi.states });
  const reset = useMutation<unknown, ApiError>({
    mutationFn: MockControlApi.reset,
    onSuccess: () => qc.invalidateQueries(),
  });

  return (
    <div className="panel" style={{ borderLeftColor: 'var(--warn)', borderLeft: '3px solid var(--warn)' }}>
      <PanelHead label="Mock controls" chip="dev only" />
      <p className="t-cap" style={{ marginBottom: 8 }}>
        These hit the mock's own endpoints (<span className="mono">POST /_reset</span>,{' '}
        <span className="mono">GET /_states</span>). Not shown in a production build.
      </p>
      <button className="btn btn-s btn-warn" disabled={reset.isPending} onClick={() => reset.mutate()}>
        {reset.isSuccess ? 'Store reset ✓' : reset.isPending ? 'Resetting…' : 'Reset mock store'}
      </button>
      {reset.error && <ApiErrorBanner error={reset.error} what="the mock reset" />}
      {states.data && (
        <div className="t-cap mono" style={{ marginTop: 10 }}>
          states: {states.data.states.join(' · ')}
          <div style={{ marginTop: 4 }}>{states.data.howToUse}</div>
        </div>
      )}
    </div>
  );
}
