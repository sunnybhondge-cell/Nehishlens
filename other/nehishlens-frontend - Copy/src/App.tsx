import { useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Rail } from './components/Rail';
import { Topbar } from './components/Topbar';
import { Login } from './screens/Login';
import { Today } from './screens/Today';
import { Executive } from './screens/Executive';
import { IncidentsList } from './screens/Incidents';
import { IncidentDetail } from './screens/IncidentDetail';
import { Eod } from './screens/Eod';
import { Audit } from './screens/Audit';
import { PackBuilder } from './screens/PackBuilder';
import { Corpus } from './screens/Corpus';
import { ResolutionDetail } from './screens/ResolutionDetail';
import { Sources } from './screens/Sources';
import { DbConsole } from './screens/DbConsole';
import { Settings } from './screens/Settings';
import { Cortex } from './screens/Cortex';
import { useConnectionProbe } from './hooks/useConnection';
import { useAuth, LENS_LANDING } from './context/AuthContext';
import { useLens } from './context/LensContext';
import { isRouteAllowed } from './nav';
import { IncidentsApi } from './api/endpoints';

// ─── DEMO: blanked screens ──────────────────────────────────────────────────
// The rail still shows every menu item and every route still resolves, but the
// screens listed in the <Routes> block below render this empty page instead of
// their real content. To restore a screen, swap its `element` back to the real
// component (e.g. `<Eod />`); to restore all of them, set DEMO_BLANK to false
// and delete this block.
const DEMO_BLANK = true;
function DemoBlank() {
  return <div className="stack" />;
}
// ─── END DEMO ───────────────────────────────────────────────────────────────

/** Redirects to the lens landing screen if the current route is `none` for this lens. */
function RouteGuard() {
  const { lens } = useLens();
  const { pathname } = useLocation();
  if (isRouteAllowed(lens, pathname)) return null;
  return <Navigate to={LENS_LANDING[lens]} replace />;
}

function Shell() {
  const { online } = useConnectionProbe();
  const incidents = useQuery({
    queryKey: ['incidents'],
    queryFn: () => IncidentsApi.list(),
    staleTime: 30_000,
  });

  return (
    <div className="shell nocop">
      <a className="skip-link" href="#mainContent" onClick={(event) => {
        event.preventDefault();
        document.getElementById('mainContent')?.focus();
      }}>Skip to main content</a>
      <Rail incidentCount={incidents.data?.length} />
      <main className="canvas" id="mainContent" tabIndex={-1}>
        <Topbar online={online} />
        <div className="cscroll">
          <RouteGuard />
          <Routes>
            <Route path="/today" element={<Today />} />
            <Route path="/executive" element={<Executive />} />
            <Route path="/incidents" element={<IncidentsList />} />
            <Route path="/incidents/:id" element={DEMO_BLANK ? <DemoBlank /> : <IncidentDetail />} />
            <Route path="/eod" element={DEMO_BLANK ? <DemoBlank /> : <Eod />} />
            <Route path="/eod/:runId" element={DEMO_BLANK ? <DemoBlank /> : <Eod />} />
            <Route path="/audit" element={DEMO_BLANK ? <DemoBlank /> : <Audit />} />
            <Route path="/audit/packs/new" element={DEMO_BLANK ? <DemoBlank /> : <PackBuilder />} />
            <Route path="/corpus" element={DEMO_BLANK ? <DemoBlank /> : <Corpus />} />
            <Route path="/corpus/:id" element={DEMO_BLANK ? <DemoBlank /> : <ResolutionDetail />} />
            <Route path="/sources" element={DEMO_BLANK ? <DemoBlank /> : <Sources />} />
            <Route path="/sources/:id" element={DEMO_BLANK ? <DemoBlank /> : <Sources />} />
            <Route path="/db-console" element={DEMO_BLANK ? <DemoBlank /> : <DbConsole />} />
            <Route path="/settings" element={DEMO_BLANK ? <DemoBlank /> : <Settings />} />
            <Route path="/cortex" element={<Cortex />} />
            <Route path="*" element={<Navigate to="/today" replace />} />
          </Routes>
        </div>
      </main>
    </div>
  );
}

/** Keeps the lens switcher / X-Lens header in sync with the signed-in user. */
function LensSync() {
  const { user } = useAuth();
  const { setActiveLens } = useLens();
  useEffect(() => {
    if (user) setActiveLens(user.lens);
  }, [user, setActiveLens]);
  return null;
}

function LandingRedirect() {
  const { user } = useAuth();
  return <Navigate to={user ? LENS_LANDING[user.lens] : '/today'} replace />;
}

function Gate() {
  const { user } = useAuth();
  const navigate = useNavigate();
  if (!user) return <Login onDone={(lens) => navigate(LENS_LANDING[lens], { replace: true })} />;
  return (
    <Routes>
      <Route path="/" element={<LandingRedirect />} />
      <Route path="/login" element={<LandingRedirect />} />
      <Route path="*" element={<Shell />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <LensSync />
      <Gate />
    </HashRouter>
  );
}
