import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { useLens } from '../context/LensContext';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { ConnectionBanner } from './ConnectionBanner';
import { CorpusApi, TodayApi } from '../api/endpoints';
import type { Lens } from '../api/config';

const LENSES: { id: Lens; label: string }[] = [
  { id: 'ops', label: 'Operations' },
  { id: 'eng', label: 'Engineering' },
  { id: 'assure', label: 'Assurance' },
  { id: 'exec', label: 'Executive' },
];

export function Topbar({ online }: { online: boolean | null }) {
  const [attentionOpen, setAttentionOpen] = useState(false);
  const { lens } = useLens();
  const { theme, toggle } = useTheme();
  const { user, signOut } = useAuth();

  // Live corpus ticker — mirrors the prototype's top-bar ticker.
  const corpus = useQuery({ queryKey: ['corpus-metrics'], queryFn: CorpusApi.metrics, staleTime: 60_000 });
  const priorities = useQuery({ queryKey: ['priorities'], queryFn: TodayApi.priorities, staleTime: 30_000 });

  const initials =
    (user?.name ?? '')
      .split(/[\s._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join('') || 'NL';

  return (
    <header className="topbar">
      {/* Read-only: the lens is derived server-side from the token. To see another lens, sign in as that user. */}
      <div className="lens-review" aria-label="Lens context">
        <span className="lens-title">LENS</span>
        <span className={`lens-tab ${lens} active`} style={{ cursor: 'default' }}>
          {LENSES.find((l) => l.id === lens)?.label ?? lens}
        </span>
        <span className="lens-source">from your sign-in</span>
      </div>

      <span className="chip">
        <span className="pip p-crit" />
        PROD · Sunflex
      </span>
      <ConnectionBanner online={online} />

      <div className="sp" style={{ flex: 1 }} />

      <Link className="btn btn-s btn-q" to="/cortex">Cortex</Link>
      <button className="attention-btn" aria-expanded={attentionOpen} onClick={() => setAttentionOpen((v) => !v)}>
        <span className="attention-dot" />Attention <b>{priorities.data?.length ?? 0}</b>
      </button>

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
        {theme === 'dark' ? 'Dark' : 'Light'}
      </button>

      <details className="user-menu">
        <summary className="av" title={user?.name} aria-label="Account">
          {initials}
        </summary>
        <div className="user-menu-pop panel">
          <div className="t-cap mono" style={{ marginBottom: 8 }}>
            {user?.name} · {user?.id}
            <br />
            {user?.title ?? user?.lens} · {user?.tenant}
          </div>
          <button type="button" className="btn btn-s" onClick={signOut}>
            Sign out
          </button>
        </div>
      </details>
      <div className={`attention-tray ${attentionOpen ? 'open' : ''}`}>
        <div className="attention-tray-head"><b>Needs attention</b><button className="btn btn-s btn-q" onClick={() => setAttentionOpen(false)}>Close</button></div>
        <div className="attention-tray-body">
          {priorities.data?.length === 0 && <p className="muted">Nothing needs attention.</p>}
          {priorities.data?.map((p, i) => <div className="tray-item" key={`${p.title}-${i}`}><div className="pc-title">{p.title}</div><div className="pc-meta">{p.meta}</div>{p.target && <div className="pc-actions"><Link className="btn btn-s" to={`/${p.target}`} onClick={() => setAttentionOpen(false)}>{p.action ?? 'Open'}</Link></div>}</div>)}
        </div>
      </div>
    </header>
  );
}
