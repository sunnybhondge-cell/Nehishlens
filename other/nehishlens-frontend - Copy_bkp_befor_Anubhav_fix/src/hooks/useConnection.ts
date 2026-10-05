import { useEffect, useState } from 'react';
import { api, connectionState } from '../api/client';

/**
 * Wiring guide: "Nothing probed the connection before the first paint, so
 * the first render raced an unknown online state. v12 adds a boot() that
 * probes once, then renders." This hook is that probe, ported to React —
 * mount it once at the app root (see src/App.tsx).
 */
export function useConnectionProbe() {
  const [online, setOnline] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.probe().then((ok) => {
      if (!cancelled) setOnline(ok);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { online, lastCheckedAt: connectionState.lastCheckedAt };
}
