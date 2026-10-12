import { useQuery } from '@tanstack/react-query';
import { SourcesApi, type Citation } from '../api/endpoints';

/**
 * `GET /citations` once (Shell prefetches it at boot), keyed by label —
 * cheaper than a call per chip. Chips then resolve locally. Shares the
 * ['citations'] cache entry with the Sources screen's citations index.
 */
export function useCitationIndex(): Map<string, Citation> | undefined {
  const q = useQuery({
    queryKey: ['citations'],
    queryFn: () => SourcesApi.citations(),
    staleTime: Infinity,
  });
  if (!q.data) return undefined;
  return new Map(q.data.map((c) => [c.label, c]));
}
