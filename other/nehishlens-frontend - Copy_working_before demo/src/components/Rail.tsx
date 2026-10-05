import { NavLink } from 'react-router-dom';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import logo from '../assets/nehish-logo.png';
import { useLens } from '../context/LensContext';
import { visibleNavItems } from '../nav';

/** Left icon rail — matches `.rail` / `.rb` / `.rail-logo` from legacy.css. */
interface RailItem {
  to: string;
  label: string;
  icon: ReactNode;
  count?: number;
}

const I = {
  today: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" />
    </svg>
  ),
  incidents: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M12 8v5M12 16.5h.01" />
      <path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  ),
  eod: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.5l3.5 2" />
    </svg>
  ),
  audit: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
      <path d="M14 3v5h5M9 13h6M9 17h4" />
    </svg>
  ),
  corpus: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 3H20v18H6.5A2.5 2.5 0 0 1 4 18.5v-13A2.5 2.5 0 0 1 6.5 3z" />
    </svg>
  ),
  sources: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="m2 12 10 5 10-5" />
      <path d="m2 17 10 5 10-5" />
    </svg>
  ),
  db: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
      <path d="M4.5 5.5v13c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8v-13" />
      <path d="M4.5 12c0 1.6 3.4 2.8 7.5 2.8s7.5-1.2 7.5-2.8" />
    </svg>
  ),
  cortex: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8z" />
      <circle cx="8.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-2.82 1.18V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 7.26 19.4l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6V3a2 2 0 0 1 4 0v1.6a1.65 1.65 0 0 0 2.82 1.18l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 11H21a2 2 0 0 1 0 4z" />
    </svg>
  ),
};

const ICONS: Record<string, ReactNode> = {
  '/today': I.today,
  '/executive': I.today,
  '/incidents': I.incidents,
  '/eod': I.eod,
  '/audit': I.audit,
  '/corpus': I.corpus,
  '/sources': I.sources,
  '/db-console': I.db,
  '/cortex': I.cortex,
  '/settings': I.settings,
};

function RailButton({ item }: { item: RailItem }) {
  const linkRef = useRef<HTMLAnchorElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);

  // `.tip` is `position:fixed` (legacy.css) so it can escape .rail's
  // scroll clipping — fixed positioning needs pixel coordinates, not the
  // percent-of-parent trick absolute positioning used, so compute them
  // here before the hover/focus-triggered opacity transition runs.
  const positionTip = () => {
    const btn = linkRef.current;
    const tip = tipRef.current;
    if (!btn || !tip) return;
    const r = btn.getBoundingClientRect();
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.style.left = `${r.right + 8}px`;
  };

  // react-router sets aria-current="page" on the active link; legacy.css
  // styles `.rb[aria-current="page"]`.
  return (
    <NavLink
      ref={linkRef}
      to={item.to}
      className="rb"
      aria-label={item.label}
      end={item.to === '/'}
      onMouseEnter={positionTip}
      onFocus={positionTip}
    >
      <span className="tip" ref={tipRef}>{item.label}</span>
      {item.count != null && item.count > 0 && <span className="rb-count">{item.count}</span>}
      {item.icon}
    </NavLink>
  );
}

export function Rail({ incidentCount }: { incidentCount?: number }) {
  const { lens } = useLens();
  const items = visibleNavItems(lens);
  const top = items.filter((n) => n.section === 'top');
  const bottom = items.filter((n) => n.section === 'bottom');

  const toButton = (n: { to: string; label: string }) => (
    <RailButton
      key={n.to}
      item={{
        to: n.to,
        label: n.label,
        icon: ICONS[n.to],
        count: n.to === '/incidents' ? incidentCount : undefined,
      }}
    />
  );

  return (
    <nav className="rail" aria-label="Sections">
      <div className="rail-logo brand-mark" aria-label="NehishLens" title="NehishLens">
        <img src={logo} alt="Nehish" />
      </div>
      <div className="rail-lens" title={`Menu for the ${lens} lens`}>
        {lens}
      </div>
      {top.map(toButton)}
      <div className="rail-sp" />
      {bottom.map(toButton)}
    </nav>
  );
}
