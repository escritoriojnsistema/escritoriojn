import PaymentsPage from './features/payments/PaymentsPage';
import {NotificationReadProvider} from './features/notifications/NotificationReadProvider';
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
import CustomersPage from './features/customers/CustomersPage';
import ServicesPage from './features/services/ServicesPage';
import RequestsPage from './features/requests/RequestsPage';
import AttachmentsPage from './features/attachments/AttachmentsPage';
import NotificationsPage from './features/notifications/NotificationsPage';
import ChargesPage from './features/charges/ChargesPage';
import CashPage from './features/cash/CashPage';
import ChecklistsPage from './features/checklists/ChecklistsPage';
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
    <Route path={paths.customers} element={<CustomersPage key={operationKey} />} />
    <Route path={paths.requests} element={<RequestsPage key={`requests:${operationKey}`} />} />
    <Route path={paths.clientRequests} element={<RequestsPage key={`client-requests:${operationKey}`} client />} />
    <Route path={paths.clientPayments} element={<PaymentsPage key={`client-payments:${operationKey}`} />} />
    <Route path={paths.cash} element={<CashPage key={`cash:${operationKey}`} />} />
    <Route path={paths.charges} element={<ChargesPage key={`charges:${operationKey}`} />} />
    <Route path={paths.checklists} element={<ChecklistsPage key={`checklists:${operationKey}`} />} />
    <Route path={paths.notifications} element={<NotificationsPage key={`notices:${operationKey}`} />} />
    <Route path={paths.clientNotifications} element={<NotificationsPage key={`client-notices:${operationKey}`} client />} />
    <Route path={paths.attachments} element={<AttachmentsPage key={`attachments:${operationKey}`} />} />
    <Route path={paths.clientAttachments} element={<AttachmentsPage key={`client-attachments:${operationKey}`} client />} />
    <Route path={paths.services} element={<ServicesPage key={operationKey} />} />
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
export default function App() { return <BrowserRouter><AuthProvider><NotificationReadProvider><AppRoutes /></NotificationReadProvider></AuthProvider></BrowserRouter>; }
