import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { apiConfig, type Lens } from '../api/config';
import { setLens, setSession, clearSession, getRefreshToken, onSessionEnded } from '../api/client';
import { AuthApi, type SessionUser } from '../api/endpoints';
import { queryClient } from '../lib/queryClient';

/**
 * Sign-in against POST /auth/login. The user — and with it the lens — comes
 * from the server; the frontend never asserts a lens of its own. Tokens live
 * in memory only (see `setSession` in api/client), so nothing identifying is
 * persisted and a reload asks for sign-in again.
 */
export type AuthUser = SessionUser;

interface AuthContextValue {
  user: AuthUser | null;
  /** Throws the server's ApiError (e.g. 401 invalid_credentials) for the caller to render. */
  signIn: (username: string, password: string) => Promise<AuthUser>;
  signOut: () => void;
  /** Why the last session ended without the user signing out, in the server's words. */
  sessionNotice: string | null;
}

// Earlier builds persisted a client-chosen {name, lens} here; drop it so no stale identity lingers.
try {
  localStorage.removeItem('nehishlens.auth');
} catch {
  /* private mode — nothing stored anyway */
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);

  const reset = useCallback(() => {
    setLens(apiConfig.defaultLens);
    setUser(null);
    // Responses are scoped to the signed-in user's lens — never show them to the next one.
    queryClient.clear();
  }, []);

  useEffect(
    () =>
      onSessionEnded((message) => {
        setSessionNotice(message);
        reset();
      }),
    [reset],
  );

  const signIn = useCallback(async (username: string, password: string) => {
    const res = await AuthApi.login(username.trim(), password);
    setSession(res);
    setLens(res.user.lens);
    queryClient.clear();
    setSessionNotice(null);
    setUser(res.user);
    return res.user;
  }, []);

  const signOut = useCallback(() => {
    const refreshToken = getRefreshToken();
    // Logout is idempotent server-side; local sign-out must not wait on or fail with it.
    if (refreshToken) void AuthApi.logout(refreshToken).catch(() => undefined);
    clearSession();
    setSessionNotice(null);
    reset();
  }, [reset]);

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, sessionNotice }}>{children}</AuthContext.Provider>
  );
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
