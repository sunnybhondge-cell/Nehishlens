import type { ApiError } from '../api/client';

/**
 * "Render the server's message, never your own apology." (wiring guide,
 * rule 1) `error.message` IS the copy to show — do not wrap it in a generic
 * "Something went wrong" or reword it.
 *
 * A 403 is a permission state, not a failure: it renders as the prototype's
 * `.denied` "Restricted for your role" panel (v12 `apiErrorHtml`), still with
 * the server's own message.
 */
export function ApiErrorBanner({ error, what }: { error: ApiError; what: string }) {
  if (error.status === 403) {
    return (
      <div role="alert" className="denied">
        <div className="t-label">Restricted for your role</div>
        <div className="msg">{error.message}</div>
      </div>
    );
  }
  return (
    <div role="alert" className="api-error-banner">
      <strong>Couldn't load {what}.</strong>
      <span> {error.message}</span>
      {error.retryable && <span className="api-error-banner__retryable"> This can be retried.</span>}
    </div>
  );
}
