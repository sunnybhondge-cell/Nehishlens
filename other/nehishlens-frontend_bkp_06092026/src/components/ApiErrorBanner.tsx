import type { ApiError } from '../api/client';

/**
 * "Render the server's message, never your own apology." (wiring guide,
 * rule 1) `error.message` IS the copy to show — do not wrap it in a generic
 * "Something went wrong" or reword it.
 */
export function ApiErrorBanner({ error, what }: { error: ApiError; what: string }) {
  return (
    <div role="alert" className="api-error-banner">
      <strong>Couldn't load {what}.</strong>
      <span> {error.message}</span>
      {error.retryable && <span className="api-error-banner__retryable"> This can be retried.</span>}
    </div>
  );
}
