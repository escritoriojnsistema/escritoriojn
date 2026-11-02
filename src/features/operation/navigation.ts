import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'catalog' | 'portalDocuments' | 'documents' | 'templates' | 'quick' | 'reports' | 'expenses' | 'payments' | 'cash' | 'charges' | 'home' | 'checklists' | 'notifications' | 'requests' | 'attachments' | 'customers' | 'services' | 'team' | 'audit' | 'archives' | 'account'; label: string; path: string };
const staff = (contexts: AccessContext[], permissions: string[]) => contexts.some(context => context.role_code !== 'client' && permissions.every(permission => context.permissions.includes(permission)));
/**
 * One destination per subject. Client and team menus never share entries:
 * a screen that belongs to the client portal is not rendered for the team and
 * vice versa. Finance lives inside Caixa; document models and issued documents
 * live inside Documentos; the document catalog is opened from Solicitações.
 */
export function operationNavigation(contexts: AccessContext[], client: boolean): OperationItem[] {
  if (client) {
    return [
      { key: 'home', label: 'Início', path: paths.clientPanel },
      { key: 'requests', label: 'Minhas solicitações', path: paths.clientRequests },
      { key: 'catalog', label: 'Documentos', path: paths.clientDocuments },
      { key: 'attachments', label: 'Anexos', path: paths.clientAttachments },
      { key: 'payments', label: 'Meus pagamentos', path: paths.clientPayments },
      { key: 'notifications', label: 'Notificações', path: paths.clientNotifications },
      { key: 'account', label: 'Conta', path: paths.clientAccount },
    ];
  }
  const items: OperationItem[] = [{ key: 'home', label: 'Início', path: paths.panel }];
  if (staff(contexts, ['requests.read'])) items.push({ key: 'requests', label: 'Solicitações', path: paths.requests });
  if (staff(contexts, ['customers.read'])) items.push({ key: 'customers', label: 'Clientes', path: paths.customers });
  if (staff(contexts, ['documents.read', 'requests.read', 'customers.read']) || staff(contexts, ['templates.read'])) items.push({ key: 'documents', label: 'Documentos', path: paths.documents });
  if (staff(contexts, ['services.read'])) items.push({ key: 'services', label: 'Serviços', path: paths.services });
  if (staff(contexts, ['requests.read', 'checklists.read'])) items.push({ key: 'checklists', label: 'Checklist', path: paths.checklists });
  if (contexts.some(context => context.role_code !== 'client' && (context.permissions.includes('cash.read') || context.permissions.includes('charges.read') || context.permissions.includes('expenses.read') || context.permissions.includes('cash.transfer')))) items.push({ key: 'cash', label: 'Caixa', path: paths.cash });
  if (staff(contexts, ['files.read', 'requests.read'])) items.push({ key: 'attachments', label: 'Anexos', path: paths.attachments });
  items.push({ key: 'notifications', label: 'Notificações', path: paths.notifications });
  if (staff(contexts, ['users.manage'])) items.push({ key: 'team', label: 'Equipe e convites', path: paths.teamManagement });
  if (staff(contexts, ['audit.read'])) items.push({ key: 'audit', label: 'Auditoria', path: paths.audit });
  if (staff(contexts, ['archives.manage'])) items.push({ key: 'archives', label: 'Arquivados', path: paths.archives });
  items.push({ key: 'account', label: 'Conta', path: paths.account });
  return items;
}

// Shared rule for every current/future operation screen. The complete registry
// remains in the sidebar; never fill unused slots with unavailable destinations.
export function mobileOperationNavigation(items: OperationItem[]): OperationItem[] {
  const account = items.filter(item => item.key === 'account');
  return [...items.filter(item => item.key !== 'account').slice(0, 4 - account.length), ...account];
}
