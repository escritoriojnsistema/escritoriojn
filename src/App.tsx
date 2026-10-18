import { lazy, Suspense, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { paths, pageTitles, normalizePathname } from './app/routes';
import { AuthProvider } from './features/auth/AuthProvider';
import HomePage from './features/home/HomePage';
import { PageLoading } from './ui/PageLoading';
const AccessPage = lazy(() => import('./features/access/AccessPage'));
const StatusPage = lazy(() => import('./features/home/StatusPage'));
const CallbackPage = lazy(() => import('./features/auth/CallbackPage'));
const ResetPage = lazy(() => import('./features/auth/ResetPage'));
const PanelPage = lazy(() => import('./features/auth/PanelPage'));
const TeamPage = lazy(() => import('./features/team/TeamPage'));
const InvitationPage = lazy(() => import('./features/team/InvitationPage'));
const AccountPage = lazy(() => import('./features/operation/AccountPage'));
function AppRoutes() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = `Escritório JN | ${pageTitles[normalizePathname(pathname)] ?? 'Página não encontrada'}`; window.scrollTo(0, 0); }, [pathname]);
  return <><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Suspense fallback={<PageLoading />}><Routes>
    <Route path={paths.home} element={<HomePage />} />
    <Route path={paths.team} element={<AccessPage key={pathname} />} />
    <Route path={paths.client} element={<AccessPage key={pathname} />} />
    <Route path={paths.recovery} element={<AccessPage key={pathname} />} />
    <Route path={paths.signup} element={<AccessPage key={pathname} />} />
    <Route path={paths.callback} element={<CallbackPage />} />
    <Route path={paths.reset} element={<ResetPage />} />
    <Route path={paths.panel} element={<PanelPage />} />
    <Route path={paths.clientPanel} element={<PanelPage />} />
    <Route path={paths.authenticated} element={<PanelPage />} />
    <Route path={paths.teamManagement} element={<TeamPage />} />
    <Route path={paths.invitation} element={<InvitationPage />} />
    <Route path={paths.account} element={<AccountPage />} />
    <Route path={paths.clientAccount} element={<AccountPage />} />
    <Route path={paths.status} element={<StatusPage />} />
    <Route path="*" element={<main id="conteudo" className="not-found"><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao início.</p><Link to={paths.home} className="primary-button"><ArrowLeft size={18} aria-hidden="true" />Voltar ao início</Link></main>} />
  </Routes></Suspense></>;
}
export default function App() { return <BrowserRouter><AuthProvider><AppRoutes /></AuthProvider></BrowserRouter>; }
