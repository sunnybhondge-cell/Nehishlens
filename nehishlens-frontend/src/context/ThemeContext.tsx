import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from 'react';

/**
 * Light/dark theme. Light is the default (the design system in
 * styles/legacy.css is light-first; `color-scheme:light` is hard-set there).
 * Dark is opt-in via `html[data-theme="dark"]`, whose rules live in
 * styles/theme-dark.css — ported verbatim from the v7 prototype.
 */
export type Theme = 'light' | 'dark';

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
}

// `.v2`: the old key held 'dark' for every past visitor (the previous default
// was persisted on load), so it is ignored to let light take effect.
const STORAGE_KEY = 'nehishlens.theme.v2';

function readStored(): Theme {
  // v12: `?theme=light|dark` (before the hash) wins, so a theme can be linked to directly.
  const q = /[?&]theme=(light|dark)/.exec(window.location.search)?.[1];
  if (q === 'light' || q === 'dark') return q;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === 'light' || raw === 'dark') return raw;
  } catch {
    /* ignore */
  }
  return 'light';
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStored);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }, [theme]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);
  const toggle = useCallback(() => setThemeState((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return (
    <ThemeContext.Provider value={{ theme, toggle, setTheme }}>{children}</ThemeContext.Provider>
  );
}

// oxlint-disable-next-line react/only-export-components -- colocated context hook
export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
