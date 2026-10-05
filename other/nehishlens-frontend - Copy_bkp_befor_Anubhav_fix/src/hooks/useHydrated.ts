import { useQuery } from '@tanstack/react-query';
import { apiConfig } from '../api/config';
import { ApiError } from '../api/client';

export interface HydratedResult<T> {
  data: T | undefined;
  isLoading: boolean;
  /** Kept for API compatibility; always false — this build ships no fixtures. */
  isFixture: boolean;
  error: ApiError | null;
  refetch: () => void;
}

/**
 * Thin wrapper over React Query's `useQuery`: give it a cache key and a
 * fetcher, get back `{ data, isLoading, error }`. Render it through
 * `<QueryState>` / `<TableRowsState>` (src/components/ui.tsx), which turn
 * those three fields into skeleton / ApiErrorBanner / rendered data.
 *
 * This build is live-data-only: there is no fixture fallback. The optional
 * `fixture` arg is retained so the signature doesn't churn, but if a call
 * fails the screen shows the server's own error, never placeholder data.
 * For writes, use React Query's `useMutation` directly (see IncidentDetail).
 */
export function useHydrated<T>(
  queryKey: unknown[],
  fetcher: () => Promise<T>,
  fixture?: T | undefined,
): HydratedResult<T> {
  const query = useQuery<T, ApiError>({
    queryKey,
    queryFn: fetcher,
  });

  const useFixture = !!query.isError && apiConfig.allowFixtureFallback && fixture !== undefined;

  return {
    data: useFixture ? fixture : query.data,
    isLoading: query.isLoading,
    isFixture: useFixture,
    error: useFixture ? null : ((query.error as ApiError | null) ?? null),
    refetch: () => query.refetch(),
  };
}
