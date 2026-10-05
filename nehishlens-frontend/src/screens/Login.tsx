import { useState } from 'react';
import logo from '../assets/nehish-logo.png';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import type { Lens } from '../api/config';

const LENSES: { id: Lens; label: string }[] = [
  { id: 'ops', label: 'Operations' },
  { id: 'eng', label: 'Engineering' },
  { id: 'assure', label: 'Assurance' },
  { id: 'exec', label: 'Executive' },
];

/**
 * Mock sign-in. There is no auth on the NehishLens API — a real deployment
 * gets the user and lens from the bank's SSO. This captures a name + lens so
 * the app has an identity to attribute actions to and a lens to send as
 * `X-Lens`.
 */
export function Login({ onDone }: { onDone: (lens: Lens) => void }) {
  const { signIn } = useAuth();
  const { theme, toggle } = useTheme();
  const [name, setName] = useState('vishal.d');
  const [lens, setLens] = useState<Lens>('ops');

  return (
    <div className="login-wrap">
      <form
        className="panel login-card"
        onSubmit={(e) => {
          e.preventDefault();
          signIn(name, lens);
          onDone(lens);
        }}
      >
        <div className="login-logo">
          <img src={logo} alt="Nehish" />
        </div>
        <h1 className="t-title" style={{ fontSize: 20 }}>
          NehishLens
        </h1>
        <p className="t-cap" style={{ marginTop: 4 }}>
          Sign in to the operations console. Role is normally supplied by the bank identity provider;
          pick a lens to preview that experience.
        </p>

        <label htmlFor="login-name">Operator</label>
        <input
          id="login-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="username"
          placeholder="you@bank"
        />

        <label htmlFor="login-lens">Lens</label>
        <select id="login-lens" value={lens} onChange={(e) => setLens(e.target.value as Lens)}>
          {LENSES.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>

        <button
          type="submit"
          className="btn btn-p"
          style={{ width: '100%', justifyContent: 'center', marginTop: 16 }}
        >
          Sign in
        </button>

        <button
          type="button"
          className="btn btn-s btn-q"
          onClick={toggle}
          style={{ width: '100%', justifyContent: 'center', marginTop: 8 }}
        >
          {theme === 'dark' ? '☾ Dark theme' : '☀ Light theme'}
        </button>
      </form>
    </div>
  );
}
