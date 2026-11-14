import {DocumentPresenceProvider} from './features/documentCommercial/DocumentPresenceProvider';
import {NotificationReadProvider} from './features/notifications/NotificationReadProvider';
import {loadOperations} from './app/loadOperations';
import { lazy, Suspense, useEffect } from 'react';
import PrivacyPage from './features/privacy/PrivacyPage';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { paths, pageTitles, normalizePathname } from './app/routes';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import {PortalBoundary} from './features/auth/PortalBoundary';
import HomePage from './features/home/HomePage';
import AccessPage from './features/access/AccessPage';
import CallbackPage from './features/auth/CallbackPage';
import ResetPage from './features/auth/ResetPage';
const InstallPage = lazy(()=>import('./features/pwa/InstallPage'));
const OperationalRoutes = lazy(loadOperations);
function AppRoutes() {
  const { pathname } = useLocation();
  const auth = useAuth();
  // Reset private page state across identities/sessions/permission changes.
  // Token rotation and ordinary navigation preserve the same session key.
  // Login/callback must stay mounted while adopting a provider session.
  const operationKey = JSON.stringify([auth.sessionKey, auth.contexts.map(context => [context.office_id, context.user_id, context.role_code, [...context.permissions].sort()])]);
  useEffect(() => { document.title = `Escritório JN | ${pageTitles[normalizePathname(pathname)] ?? 'Página não encontrada'}`; window.scrollTo(0, 0); }, [pathname]);
  return <><a className="skip-link" href="#conteudo" onClick={event=>{const main=document.getElementById('conteudo');if(main){event.preventDefault();main.tabIndex=-1;main.focus();main.scrollIntoView({block:'start'});}}}>Pular para o conteúdo</a><Routes>
    <Route path={paths.home} element={<HomePage />} />
    <Route path={paths.team} element={<AccessPage key={pathname} />} />
    <Route path={paths.client} element={<AccessPage key={pathname} />} />
    <Route path={paths.recovery} element={<AccessPage key={pathname} />} />
    <Route path={paths.signup} element={<AccessPage key={pathname} />} />
    <Route path={paths.callback} element={<CallbackPage />} />
    <Route path={paths.reset} element={<ResetPage key={auth.sessionKey} />} />
    <Route path="/privacidade" element={<PrivacyPage section="privacy" />} />
    <Route path="/termos" element={<PrivacyPage section="terms" />} />
    <Route path="/cookies" element={<PrivacyPage section="cookies" />} />
    <Route path="/instalar" element={<Suspense fallback={null}><InstallPage/></Suspense>} />
    <Route path="*" element={<PortalBoundary><Suspense fallback={null}><OperationalRoutes operationKey={operationKey} /></Suspense></PortalBoundary>} />

  </Routes></>;
}
export default function App() { return <BrowserRouter><AuthProvider><NotificationReadProvider><DocumentPresenceProvider><AppRoutes /></DocumentPresenceProvider></NotificationReadProvider></AuthProvider></BrowserRouter>; }
