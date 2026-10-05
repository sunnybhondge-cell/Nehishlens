import { useQuery } from '@tanstack/react-query';
import { useLens } from '../context/LensContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ConnectionBanner } from './ConnectionBanner';
import { CorpusApi } from '../api/endpoints';
import type { Lens } from '../api/config';

const LENSES: { id: Lens; label: string }[] = [
  { id: 'ops', label: 'Operations' },
  { id: 'eng', label: 'Engineering' },
  { id: 'assure', label: 'Assurance' },
  { id: 'exec', label: 'Executive' },
];

export function Topbar({ online }: { online: boolean | null }) {
  const { lens, setActiveLens } = useLens();
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();

  // Live corpus ticker — mirrors the prototype's top-bar ticker.
  const corpus = useQuery({ queryKey: ['corpus-metrics'], queryFn: CorpusApi.metrics, staleTime: 60_000 });

  const initials =
    (user?.name ?? '')
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || 'NL';

  return (
    <header className="topbar">
      <div className="lens-review" aria-label="Lens context">
        <span className="lens-title">LENS</span>
        {LENSES.map((l) => (
          <button
            key={l.id}
            type="button"
            className={`lens-tab ${l.id} ${lens === l.id ? 'active' : ''}`}
            aria-pressed={lens === l.id}
            onClick={() => setActiveLens(l.id)}
          >
            {l.label}
          </button>
        ))}
        <span className="lens-source">role context · via SSO</span>
      </div>

      <span className="chip">
        <span className="pip p-crit" />
        PROD · Sunflex
      </span>
      <ConnectionBanner online={online} />

      <div className="sp" style={{ flex: 1 }} />

      {corpus.data && (
        <span className="ticker">
          Corpus <b>{corpus.data.resolutions.toLocaleString()}</b> · +{corpus.data.addedToday} today ·
          reused <b>{corpus.data.reuseEventsThisWeek}×</b> this wk
        </span>
      )}

      <button
        type="button"
        className="btn btn-s btn-q"
        onClick={toggle}
        aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
        title={`Theme: ${theme}`}
      >
        {theme === 'dark' ? '☾ Dark' : '☀ Light'}
      </button>

      <details className="user-menu">
        <summary className="av" title={user?.name} aria-label="Account">
          {initials}
        </summary>
        <div className="user-menu-pop panel">
          <div className="t-cap mono" style={{ marginBottom: 8 }}>
            {user?.name} · {user?.lens}
          </div>
          <button type="button" className="btn btn-s" onClick={signOut}>
            Sign out
          </button>
        </div>
      </details>
    </header>
  );
}
