import { useState } from 'react';
import logo from '../assets/nehish-logo.png';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { apiConfig, type Lens } from '../api/config';
import { ApiError } from '../api/client';

/**
 * The mock's seeded users (Open Queries v1.1 · Authentication). Dev-only:
 * the mock checks just the username, and the real service replaces that
 * check wholesale — this list is a convenience, not a client-side rule.
 */
const MOCK_ACCOUNTS = [
  { id: 'vishal.d', label: 'Operations · proposer' },
  { id: 'r.edwards', label: 'Operations · approver' },
  { id: 'a.menon', label: 'Engineering' },
  { id: 'compliance.head', label: 'Assurance' },
  { id: 's.iyer', label: 'Executive' },
];

/**
 * Sign-in via POST /auth/login. The lens is whatever the server returns for
 * this user — there is no lens picker, by design.
 */
export function Login({ onDone }: { onDone: (lens: Lens) => void }) {
  const { signIn, sessionNotice } = useAuth();
  const { theme, toggle } = useTheme();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  return (
    <div className="login-wrap">
      <form
        className="panel login-card"
        onSubmit={async (e) => {
          e.preventDefault();
          setPending(true);
          setError(null);
          try {
            const user = await signIn(username, password);
            onDone(user.lens);
          } catch (err) {
            // Render the server's own words (401 invalid_credentials, network_unreachable…).
            setError(err instanceof ApiError ? err.message : 'Sign-in failed.');
            setPending(false);
          }
        }}
      >
        <div className="login-logo">
          <img src={logo} alt="Nehish" />
        </div>
        <h1 className="t-title" style={{ fontSize: 20 }}>
          NehishLens
        </h1>
        <p className="t-cap" style={{ marginTop: 4 }}>
          Sign in to the operations console. Your lens comes from your account.
        </p>

        {(error ?? sessionNotice) && (
          <p className="t-cap" role="alert" style={{ marginTop: 12, color: 'var(--crit)' }}>
            {error ?? sessionNotice}
          </p>
        )}

        <label htmlFor="login-name">Username</label>
        <input
          id="login-name"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoComplete="username"
          required
        />

        <label htmlFor="login-password">Password</label>
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          required
        />

        <button
          type="submit"
          className="btn btn-p"
          disabled={pending}
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        >
          {pending ? 'Signing in…' : 'Sign in'}
        </button>

        <button
          type="button"
          className="btn btn-s btn-q"
          onClick={toggle}
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        >
          {theme === 'dark' ? '☾ Dark theme' : '☀ Light theme'}
        </button>

        {apiConfig.devTools && (
          <div className="t-cap" style={{ marginTop: 16 }}>
            <div className="mono" style={{ marginBottom: 4 }}>DEV · mock accounts (any password; “wrong” → 401)</div>
            {MOCK_ACCOUNTS.map((a) => (
              <button
                key={a.id}
                type="button"
                className="btn btn-s btn-q"
                style={{ margin: '0 4px 4px 0' }}
                onClick={() => {
                  setUsername(a.id);
                  setPassword('mock');
                }}
                title={a.label}
              >
                {a.id}
              </button>
            ))}
          </div>
        )}
      </form>
    </div>
  );
}
