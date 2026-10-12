import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { type Lens } from '../api/config';
import { getLens, setLens } from '../api/client';
import { queryClient } from '../lib/queryClient';

interface LensContextValue {
  lens: Lens;
  setActiveLens: (lens: Lens) => void;
}

const LensContext = createContext<LensContextValue | null>(null);

export function LensProvider({ children }: { children: ReactNode }) {
  // AuthProvider has already applied the stored user's lens to the client.
  const [lens, setLensState] = useState<Lens>(getLens);
  const lensRef = useRef(lens);

  // Activates the `html[data-lens="…"]` accent rules already in legacy.css.
  useEffect(() => {
    document.documentElement.dataset.lens = lens;
  }, [lens]);

  const setActiveLens = useCallback((next: Lens) => {
    setLensState(next);
    setLens(next); // updates the X-Lens header used by every subsequent request
    if (next !== lensRef.current) {
      lensRef.current = next;
      // Responses are lens-scoped (/priorities differs per lens, /sources/{id} can 403) and
      // query keys don't carry the lens, so drop everything fetched under the old lens and
      // refetch what's on screen — the prototype re-fetches in applyRoleChrome() for the same reason.
      void queryClient.resetQueries();
    }
  }, []);

  return <LensContext.Provider value={{ lens, setActiveLens }}>{children}</LensContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- colocated context hook
export function useLens() {
  const ctx = useContext(LensContext);
  if (!ctx) throw new Error('useLens must be used within LensProvider');
  return ctx;
}
