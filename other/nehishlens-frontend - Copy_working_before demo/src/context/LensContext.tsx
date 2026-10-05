import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';
import { apiConfig, type Lens } from '../api/config';
import { setLens } from '../api/client';

interface LensContextValue {
  lens: Lens;
  setActiveLens: (lens: Lens) => void;
}

const LensContext = createContext<LensContextValue | null>(null);

export function LensProvider({ children }: { children: ReactNode }) {
  const [lens, setLensState] = useState<Lens>(apiConfig.defaultLens);

  // Activates the `html[data-lens="…"]` accent rules already in legacy.css.
  useEffect(() => {
    document.documentElement.dataset.lens = lens;
  }, [lens]);

  const setActiveLens = useCallback((next: Lens) => {
    setLensState(next);
    setLens(next); // updates the X-Lens header used by every subsequent request
  }, []);

  return <LensContext.Provider value={{ lens, setActiveLens }}>{children}</LensContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- colocated context hook
export function useLens() {
  const ctx = useContext(LensContext);
  if (!ctx) throw new Error('useLens must be used within LensProvider');
  return ctx;
}
