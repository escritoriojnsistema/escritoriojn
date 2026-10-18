import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { paths, pageTitles, normalizePathname } from './app/routes';
import { AuthProvider, useAuth } from './features/auth/AuthProvider';
import HomePage from './features/home/HomePage';
import AccessPage from './features/access/AccessPage';
import StatusPage from './features/home/StatusPage';
import CallbackPage from './features/auth/CallbackPage';
import ResetPage from './features/auth/ResetPage';
import PanelPage from './features/auth/PanelPage';
import TeamPage from './features/team/TeamPage';
import InvitationPage from './features/team/InvitationPage';
import AccountPage from './features/operation/AccountPage';
import GovernancePage from './features/governance/GovernancePage';
function AppRoutes() {
  const { pathname } = useLocation();
  const auth = useAuth();
  // Reset private page state across identities/sessions/permission changes.
  // Token rotation and ordinary navigation preserve the same session key.
  // Login/callback must stay mounted while adopting a provider session.
  const operationKey = JSON.stringify([auth.sessionKey, auth.contexts.map(context => [context.office_id, context.user_id, context.role_code, [...context.permissions].sort()])]);
  useEffect(() => { document.title = `Escritório JN | ${pageTitles[normalizePathname(pathname)] ?? 'Página não encontrada'}`; window.scrollTo(0, 0); }, [pathname]);
  return <><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Routes>
    <Route path={paths.home} element={<HomePage />} />
    <Route path={paths.team} element={<AccessPage key={pathname} />} />
    <Route path={paths.client} element={<AccessPage key={pathname} />} />
    <Route path={paths.recovery} element={<AccessPage key={pathname} />} />
    <Route path={paths.signup} element={<AccessPage key={pathname} />} />
    <Route path={paths.callback} element={<CallbackPage />} />
    <Route path={paths.reset} element={<ResetPage key={auth.sessionKey} />} />
    <Route path={paths.panel} element={<PanelPage key={`team:${operationKey}`} />} />
    <Route path={paths.clientPanel} element={<PanelPage key={`client:${operationKey}`} />} />
    <Route path={paths.authenticated} element={<PanelPage key={operationKey} />} />
    <Route path={paths.teamManagement} element={<TeamPage key={operationKey} />} />
    <Route path={paths.invitation} element={<InvitationPage key={auth.sessionKey} />} />
    <Route path={paths.audit} element={<GovernancePage key={`audit:${operationKey}`} mode="audit" />} />
    <Route path={paths.archives} element={<GovernancePage key={`archives:${operationKey}`} mode="archives" />} />
    <Route path={paths.account} element={<AccountPage key={`team:${operationKey}`} />} />
    <Route path={paths.clientAccount} element={<AccountPage key={`client:${operationKey}`} />} />
    <Route path={paths.status} element={<StatusPage />} />
    <Route path="*" element={<main id="conteudo" className="not-found"><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao início.</p><Link to={paths.home} className="primary-button"><ArrowLeft size={18} aria-hidden="true" />Voltar ao início</Link></main>} />
  </Routes></>;
}
export default function App() { return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>; }
