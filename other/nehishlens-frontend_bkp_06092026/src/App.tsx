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
      <Rail incidentCount={incidents.data?.length} />
      <main className="canvas" id="mainContent">
        <Topbar online={online} />
        <div className="cscroll">
          <RouteGuard />
          <Routes>
            <Route path="/today" element={<Today />} />
            <Route path="/executive" element={<Executive />} />
            <Route path="/incidents" element={<IncidentsList />} />
            <Route path="/incidents/:id" element={<IncidentDetail />} />
            <Route path="/eod" element={<Eod />} />
            <Route path="/eod/:runId" element={<Eod />} />
            <Route path="/audit" element={<Audit />} />
            <Route path="/audit/packs/new" element={<PackBuilder />} />
            <Route path="/corpus" element={<Corpus />} />
            <Route path="/corpus/:id" element={<ResolutionDetail />} />
            <Route path="/sources" element={<Sources />} />
            <Route path="/sources/:id" element={<Sources />} />
            <Route path="/db-console" element={<DbConsole />} />
            <Route path="/settings" element={<Settings />} />
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
