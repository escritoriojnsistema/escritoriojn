import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Link, Route, Routes, useLocation } from 'react-router-dom';
import { paths, pageTitles, normalizePathname } from './app/routes';
import HomePage from './features/home/HomePage';
import { PageLoading } from './ui/PageLoading';
const AccessPage = lazy(() => import('./features/access/AccessPage'));
const StatusPage = lazy(() => import('./features/home/StatusPage'));
function AppRoutes() {
  const { pathname } = useLocation();
  useEffect(() => { document.title = `Escritório JN | ${pageTitles[normalizePathname(pathname)] ?? 'Página não encontrada'}`; window.scrollTo(0, 0); }, [pathname]);
  return <><a className="skip-link" href="#conteudo">Pular para o conteúdo</a><Suspense fallback={<PageLoading />}><Routes>
    <Route path={paths.home} element={<HomePage />} />
    <Route path={paths.team} element={<AccessPage />} />
    <Route path={paths.client} element={<AccessPage />} />
    <Route path={paths.recovery} element={<AccessPage />} />
    <Route path={paths.status} element={<StatusPage />} />
    <Route path="*" element={<main id="conteudo" className="not-found"><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao início.</p><Link to={paths.home} className="primary-button">Voltar ao início</Link></main>} />
  </Routes></Suspense></>;
}
export default function App() { return <BrowserRouter><AppRoutes /></BrowserRouter>; }
