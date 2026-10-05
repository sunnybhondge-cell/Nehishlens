import { ScreenHeader } from '../components/ScreenHeader';
import { Trace } from '../components/ui';

/**
 * Screen 6 · DB Console. The NehishLens mock exposes no `/db/*` endpoint, so
 * there is nothing to wire and — per this build's live-data-only rule —
 * nothing is invented. This screen states that plainly.
 */
export function DbConsole() {
  return (
    <div className="stack">
      <ScreenHeader title="DB Console" crumb="Engineering" subtitle="read-only replica" />
      <Trace>Run is an action-with-receipt; power does not exempt anyone from the audit trail.</Trace>

      <div className="panel">
        <div className="empty">
          <b>Not exposed by the mock API</b>
          The schema search, audited query runner and change-record attachment from the prototype have
          no endpoint on this mock. When a `/db/*` surface exists, this screen wires up the same way as
          the others — one `useHydrated` call per fragment.
        </div>
      </div>
    </div>
  );
}
