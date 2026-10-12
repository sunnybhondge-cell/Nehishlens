import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { apiConfig, type Lens } from '../api/config';
import { setLens } from '../api/client';

/**
 * Mock sign-in. The NehishLens API has no auth — in a real deployment the
 * bank's identity provider supplies the user and their lens over SSO (see the
 * prototype's ROLES model). This gate just captures a name + lens, persists
 * them, and sets the `X-Lens` header every request carries.
 */
export interface AuthUser {
  name: string;
  lens: Lens;
}

interface AuthContextValue {
  user: AuthUser | null;
  signIn: (name: string, lens: Lens) => void;
  signOut: () => void;
}

const STORAGE_KEY = 'nehishlens.auth';

function readStored(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (parsed && typeof parsed.name === 'string' && typeof parsed.lens === 'string') return parsed;
  } catch {
    /* private mode / cleared storage — treat as signed out */
  }
  return null;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const stored = readStored();
    if (stored) setLens(stored.lens);
    return stored;
  });

  const signIn = useCallback((name: string, lens: Lens) => {
    const next: AuthUser = { name: name.trim() || 'operator', lens };
    setLens(next.lens);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* ignore persistence failure */
    }
    setUser(next);
  }, []);

  const signOut = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    setLens(apiConfig.defaultLens);
    setUser(null);
  }, []);

  return <AuthContext.Provider value={{ user, signIn, signOut }}>{children}</AuthContext.Provider>;
}

// oxlint-disable-next-line react/only-export-components -- colocated context hook
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

/** Landing screen per lens — mirrors ROLES[lens].landing in the prototype. */
// oxlint-disable-next-line react/only-export-components -- routing policy shared with App
export const LENS_LANDING: Record<Lens, string> = {
  ops: '/today',
  eng: '/incidents',
  assure: '/audit',
  exec: '/today', // renders the Executive preview for this lens
};
