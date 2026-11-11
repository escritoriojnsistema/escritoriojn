import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'categories' | 'access' | 'privacy' | 'rural' | 'settings' | 'catalog' | 'portalDocuments' | 'documents' | 'templates' | 'quick' | 'reports' | 'expenses' | 'payments' | 'cash' | 'charges' | 'home' | 'checklists' | 'notifications' | 'requests' | 'attachments' | 'customers' | 'services' | 'team' | 'audit' | 'archives' | 'account'; label: string; path: string };
const staff = (contexts: AccessContext[], permissions: string[]) => contexts.some(context => context.role_code !== 'client' && permissions.every(permission => context.permissions.includes(permission)));
/**
 * One destination per subject. Client and team menus never share entries:
 * a screen that belongs to the client portal is not rendered for the team and
 * vice versa. Grouped finance/settings destinations also have explicit sidebar
 * entries so authorized functions are discoverable from every screen.
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
  if (staff(contexts, ['requests.read','charges.read'])) items.push({key:'charges',label:'Cobranças',path:paths.charges});
  if (staff(contexts, ['cash.read','expenses.read']) || staff(contexts, ['cash.read','cash.transfer'])) items.push({key:'expenses',label:'Despesas e movimentações',path:paths.expenses});
  if (staff(contexts, ['cash.read','finance.reports.read'])) items.push({key:'reports',label:'Relatórios financeiros',path:paths.financialReports});
  if (staff(contexts, ['files.read', 'requests.read'])) items.push({ key: 'attachments', label: 'Anexos', path: paths.attachments });
  items.push({ key: 'notifications', label: 'Notificações', path: paths.notifications });
  if (contexts.some(c=>c.role_code!=='client'&&c.permissions.includes('settings.access'))) items.push({key:'settings',label:'Configurações',path:paths.settings});
  // Never combine permissions from different offices or infer grants from role.
  if(staff(contexts,['users.manage']))items.push({key:'team',label:'Equipe e convites',path:paths.teamManagement});
  if(staff(contexts,['audit.read']))items.push({key:'audit',label:'Auditoria',path:paths.audit});
  if(contexts.some(c=>c.role_code!=='client'&&(c.permissions.includes('archives.manage')||['owner','admin'].includes(c.role_code)&&['requests.read','requests.archives.manage'].every(p=>c.permissions.includes(p)))))items.push({key:'archives',label:'Arquivados',path:paths.settingsArchives});
  const administrators=contexts.filter(c=>c.role_code==='owner'||c.role_code==='admin');
  if(staff(administrators,['settings.access','categories.manage']))items.push({key:'categories',label:'Categorias',path:paths.settingsCategories});
  if(staff(administrators,['settings.access','access.manage']))items.push({key:'access',label:'Acessos',path:paths.settingsAccess});
  if(staff(contexts.filter(c=>c.role_code==='owner'),['settings.access']))items.push({key:'privacy',label:'Privacidade',path:paths.settingsPrivacy});
  items.push({ key: 'account', label: 'Conta', path: paths.account });
  return items;
}

// Shared rule for every current/future operation screen. The complete registry
// remains in the sidebar; never fill unused slots with unavailable destinations.
export function mobileOperationNavigation(items: OperationItem[]): OperationItem[] {
  const account = items.filter(item => item.key === 'account');
  return [...items.filter(item => item.key !== 'account').slice(0, 4 - account.length), ...account];
}
