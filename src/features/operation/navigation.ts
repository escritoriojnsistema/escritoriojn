import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'rural' | 'settings' | 'catalog' | 'portalDocuments' | 'documents' | 'templates' | 'quick' | 'reports' | 'expenses' | 'payments' | 'cash' | 'charges' | 'home' | 'checklists' | 'notifications' | 'requests' | 'attachments' | 'customers' | 'services' | 'team' | 'audit' | 'archives' | 'account'; label: string; path: string };
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
  if (staff(contexts, ['customers.read','rural.read'])) items.push({key:'rural',label:'Imóveis rurais',path:paths.rural});

  if (staff(contexts, ['documents.read', 'requests.read', 'customers.read']) || staff(contexts, ['templates.read'])) items.push({ key: 'documents', label: 'Documentos', path: paths.documents });
  if (staff(contexts, ['services.read'])) items.push({ key: 'services', label: 'Serviços', path: paths.services });
  if (staff(contexts, ['requests.read', 'checklists.read'])) items.push({ key: 'checklists', label: 'Checklist', path: paths.checklists });
  if (staff(contexts, ['cash.read']) || staff(contexts, ['requests.read','charges.read'])) items.push({ key: 'cash', label: 'Caixa', path: paths.cash });
  if (staff(contexts, ['files.read', 'requests.read'])) items.push({ key: 'attachments', label: 'Anexos', path: paths.attachments });
  items.push({ key: 'notifications', label: 'Notificações', path: paths.notifications });
  if (contexts.some(c=>c.role_code!=='client'&&c.permissions.includes('settings.access'))) items.push({key:'settings',label:'Configurações',path:paths.settings});
  // Independent grants must remain reachable even when this office does not
  // grant Settings. Never combine permissions from different offices.
  const outsideSettings=contexts.filter(c=>!c.permissions.includes('settings.access'));
  if(staff(outsideSettings,['users.manage']))items.push({key:'team',label:'Equipe e convites',path:paths.teamManagement});
  if(staff(outsideSettings,['audit.read']))items.push({key:'audit',label:'Auditoria',path:paths.audit});
  if(outsideSettings.some(c=>c.role_code!=='client'&&(c.permissions.includes('archives.manage')||['owner','admin'].includes(c.role_code)&&['requests.read','requests.archives.manage'].every(p=>c.permissions.includes(p)))))items.push({key:'archives',label:'Arquivados',path:paths.settingsArchives});
  items.push({ key: 'account', label: 'Conta', path: paths.account });
  return items;
}

// Shared rule for every current/future operation screen. The complete registry
// remains in the sidebar; never fill unused slots with unavailable destinations.
export function mobileOperationNavigation(items: OperationItem[]): OperationItem[] {
  const account = items.filter(item => item.key === 'account');
  return [...items.filter(item => item.key !== 'account').slice(0, 4 - account.length), ...account];
}
