import { lazy } from 'react';
import PanelPage from '../features/auth/PanelPage';
import { Route, Routes, Navigate, Link } from 'react-router-dom';
import { paths } from './routes';
import {useAuth} from '../features/auth/AuthProvider';
// Keep the verified panel small; load each business screen on navigation.
const RuralPage = lazy(() => import('../features/rural/RuralPage'));
const SettingsPage = lazy(() => import('../features/settings/SettingsPage'));
const ArchivesHubPage = lazy(() => import('../features/settings/ArchivesHubPage'));
const DocumentsHubPage = lazy(() => import('../features/documents/DocumentsHubPage'));
const ClientDocumentsPage = lazy(() => import('../features/documents/ClientDocumentsPage'));
const QuickPage = lazy(() => import('../features/finance/QuickPage'));
const ReportsPage = lazy(() => import('../features/finance/ReportsPage'));
const PaymentsPage = lazy(() => import('../features/payments/PaymentsPage'));
const TeamPage = lazy(() => import('../features/team/TeamPage'));
const CustomersPage = lazy(() => import('../features/customers/CustomersPage'));
const ServicesPage = lazy(() => import('../features/services/ServicesPage'));
const RequestsPage = lazy(() => import('../features/requests/RequestsPage'));
const AttachmentsPage = lazy(() => import('../features/attachments/AttachmentsPage'));
const NotificationsPage = lazy(() => import('../features/notifications/NotificationsPage'));
const ChargesPage = lazy(() => import('../features/charges/ChargesPage'));
const ExpensesPage = lazy(() => import('../features/cash/ExpensesPage'));
const CashPage = lazy(() => import('../features/cash/CashPage'));
const ChecklistsPage = lazy(() => import('../features/checklists/ChecklistsPage'));
const InvitationPage = lazy(() => import('../features/team/InvitationPage'));
const AccountPage = lazy(() => import('../features/operation/AccountPage'));
const GovernancePage = lazy(() => import('../features/governance/GovernancePage'));
export default function OperationalRoutes({operationKey}:{operationKey:string}){
 const auth=useAuth();
 return <Routes>
    <Route path={paths.panel} element={<PanelPage key={`team:${operationKey}`} />} />
    <Route path={paths.clientPanel} element={<PanelPage key={`client:${operationKey}`} />} />
    <Route path={paths.authenticated} element={<PanelPage key={operationKey} />} />
    <Route path={paths.rural} element={<RuralPage key={operationKey}/>} />
    <Route path={paths.customers} element={<CustomersPage key={operationKey} />} />
    <Route path={paths.requests} element={<RequestsPage key={`requests:${operationKey}`} />} />
    <Route path={paths.clientRequests} element={<RequestsPage key={`client-requests:${operationKey}`} client />} />
    <Route path={paths.clientPayments} element={<PaymentsPage key={`client-payments:${operationKey}`} />} />
    <Route path={paths.expenses} element={<ExpensesPage key={`expenses:${operationKey}`} />} />
    <Route path={paths.clientDocumentCatalog} element={<Navigate replace to={paths.clientDocuments} />} />
    <Route path={paths.clientDocuments} element={<ClientDocumentsPage key={`client-documents:${operationKey}`} />} />
    <Route path={paths.documents} element={<DocumentsHubPage key={`documents:${operationKey}`} />} />
    <Route path={paths.templates} element={<Navigate replace to={paths.documents} />} />
    <Route path={paths.documentCatalog} element={<Navigate replace to={paths.requests} />} />
    <Route path={paths.quick} element={<QuickPage key={`quick:${operationKey}`} />} />
    <Route path={paths.financialReports} element={<ReportsPage key={`financial-reports:${operationKey}`} />} />
    <Route path={paths.cash} element={<CashPage key={`cash:${operationKey}`} />} />
    <Route path={paths.charges} element={<ChargesPage key={`charges:${operationKey}`} />} />
    <Route path={paths.checklists} element={<ChecklistsPage key={`checklists:${operationKey}`} />} />
    <Route path={paths.notifications} element={<NotificationsPage key={`notices:${operationKey}`} />} />
    <Route path={paths.clientNotifications} element={<NotificationsPage key={`client-notices:${operationKey}`} client />} />
    <Route path={paths.attachments} element={<AttachmentsPage key={`attachments:${operationKey}`} />} />
    <Route path={paths.clientAttachments} element={<AttachmentsPage key={`client-attachments:${operationKey}`} client />} />
    <Route path={paths.settings} element={<SettingsPage key={`settings:${operationKey}`}/>} />
    <Route path={paths.settingsCategories} element={<SettingsPage key={`categories:${operationKey}`} section="categories"/>} />
    <Route path={paths.settingsPrivacy} element={<SettingsPage key={`privacy-settings:${operationKey}`} section="privacy"/>} />
    <Route path={paths.settingsAccess} element={<SettingsPage key={`access-settings:${operationKey}`} section="access"/>} />
    <Route path={paths.settingsArchives} element={<ArchivesHubPage key={`archives-hub:${operationKey}`}/>} />
    <Route path={paths.services} element={<ServicesPage key={operationKey} />} />
    <Route path={paths.teamManagement} element={<TeamPage key={operationKey} />} />
    <Route path={paths.invitation} element={<InvitationPage key={auth.sessionKey} />} />
    <Route path={paths.audit} element={<GovernancePage key={`audit:${operationKey}`} mode="audit" />} />
    <Route path={paths.archives} element={<ArchivesHubPage key={`archives:${operationKey}`} />} />
    <Route path={paths.account} element={<AccountPage key={`team:${operationKey}`} />} />
    <Route path={paths.clientAccount} element={<AccountPage key={`client:${operationKey}`} />} />
<Route path="*" element={<main id="conteudo" className="not-found"><h1>Página não encontrada</h1><p>Confira o endereço ou volte ao início.</p><Link className="primary-button" to={paths.home}>Voltar ao início</Link></main>}/>
 </Routes>;
}
