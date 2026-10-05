import { apiConfig } from '../api/config';

/**
 * "A silent fallback is exactly the failure this product spends seven
 * screens arguing against." (wiring guide, rule 2) Mount this wherever the
 * top bar lives; pass `online` from useConnectionProbe() at the app root.
 */
export function ConnectionBanner({ online }: { online: boolean | null }) {
  if (online === null) {
    return <div className="connection-chip connection-chip--checking">Checking connection…</div>;
  }
  if (online) {
    return <div className="connection-chip connection-chip--online">Live · {apiConfig.baseUrl}</div>;
  }
  return (
    <div className="connection-chip connection-chip--offline" role="status">
      API at {apiConfig.baseUrl} is unreachable — no saved values are being substituted
    </div>
  );
}
