import type { AccessContext } from '../../../shared/access';
import { normalizePathname, paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'categories' | 'access' | 'privacy' | 'rural' | 'settings' | 'catalog' | 'portalDocuments' | 'documents' | 'templates' | 'quick' | 'reports' | 'expenses' | 'payments' | 'cash' | 'charges' | 'home' | 'checklists' | 'notifications' | 'requests' | 'attachments' | 'customers' | 'services' | 'team' | 'audit' | 'archives' | 'account'; label: string; path: string };
const staff = (contexts: AccessContext[], permissions: string[]) => contexts.some(context => context.role_code !== 'client' && permissions.every(permission => context.permissions.includes(permission)));

/** Only the parent sections belong to the sidebar, for both screen sizes. */
export function operationNavigation(contexts: AccessContext[], client: boolean): OperationItem[] {
  if (client) return [
    { key: 'home', label: 'Início', path: paths.clientPanel },
    { key: 'requests', label: 'Minhas solicitações', path: paths.clientRequests },
    { key: 'catalog', label: 'Documentos', path: paths.clientDocuments },
    { key: 'payments', label: 'Meus pagamentos', path: paths.clientPayments },
    { key: 'notifications', label: 'Notificações', path: paths.clientNotifications },
    { key: 'settings', label: 'Configurações', path: paths.clientSettings },
  ];
  const items: OperationItem[] = [{ key: 'home', label: 'Início', path: paths.panel }];
  if (staff(contexts, ['requests.read'])) items.push({ key: 'requests', label: 'Solicitações', path: paths.requests });
  if (staff(contexts, ['customers.read'])) items.push({ key: 'customers', label: 'Clientes', path: paths.customers });
  if (staff(contexts, ['documents.read', 'requests.read', 'customers.read']) || staff(contexts, ['templates.read'])) items.push({ key: 'documents', label: 'Documentos', path: paths.documents });
  if (staff(contexts, ['services.read']) || staff(contexts, ['requests.read', 'checklists.read'])) items.push({ key: 'services', label: 'Serviços', path: staff(contexts, ['services.read']) ? paths.services : paths.checklists });
  if (staff(contexts, ['cash.read']) || staff(contexts, ['requests.read','charges.read'])) items.push({ key: 'cash', label: 'Caixa', path: paths.cash });
  items.push({ key: 'notifications', label: 'Notificações', path: paths.notifications });
  // Account is available to every staff login; each administrative item still
  // checks its own office, role and capabilities inside this section.
  items.push({ key: 'settings', label: 'Configurações', path: paths.settings });
  return items;
}

export function settingsNavigation(context: AccessContext, client: boolean): OperationItem[] {
  if (client) return [{ key: 'account', label: 'Conta', path: paths.clientAccount }];
  if (context.role_code === 'client') return [];
  const has = (...permissions: string[]) => permissions.every(p => context.permissions.includes(p));
  const admin = ['owner','admin'].includes(context.role_code);
  const items: OperationItem[] = [];
  if (context.role_code === 'owner' && has('settings.access')) items.push({ key:'privacy', label:'Privacidade', path:paths.settingsPrivacy });
  if (has('audit.read')) items.push({ key:'audit', label:'Auditoria', path:paths.audit });
  if (has('archives.manage') || admin && has('requests.read','requests.archives.manage')) items.push({ key:'archives', label:'Arquivados', path:paths.settingsArchives });
  if (has('users.manage')) items.push({ key:'team', label:'Equipe e convites', path:paths.teamManagement });
  if (admin && has('settings.access','categories.manage')) items.push({ key:'categories', label:'Categorias', path:paths.settingsCategories });
  if (admin && has('settings.access','access.manage')) items.push({ key:'access', label:'Acessos', path:paths.settingsAccess });
  items.push({ key:'account', label:'Conta', path:paths.account });
  return items;
}

/** A direct URL keeps its parent highlighted, including the mobile shortcuts. */
export function operationSectionKey(pathname: string): OperationItem['key'] | undefined {
  const path = normalizePathname(pathname);
  const groups: [OperationItem['key'], readonly string[]][] = [
    ['requests', [paths.requests, paths.clientRequests, paths.attachments, paths.clientAttachments]],
    ['customers', [paths.customers, paths.rural]],
    ['services', [paths.services, paths.checklists]],
    ['cash', [paths.cash, paths.charges, paths.expenses, paths.financialReports, paths.quick]],
    ['settings', [paths.settings, paths.clientSettings, paths.settingsCategories, paths.settingsAccess, paths.settingsPrivacy, paths.settingsArchives, paths.teamManagement, paths.audit, paths.archives, paths.account, paths.clientAccount]],
  ];
  return groups.find(([, routes]) => routes.includes(path))?.[0];
}

/** Internal section links reuse the existing workspaces and their access checks. */
export function operationSectionNavigation(contexts: AccessContext[], client: boolean, pathname: string): OperationItem[] {
  const key = operationSectionKey(pathname);
  if (client) return key === 'requests' ? [
    { key:'requests', label:'Solicitações', path:paths.clientRequests },
    { key:'attachments', label:'Anexos', path:paths.clientAttachments },
  ] : [];
  const items: OperationItem[] = [];
  if (key === 'requests') {
    if (staff(contexts,['requests.read'])) items.push({ key:'requests', label:'Solicitações', path:paths.requests });
    if (staff(contexts,['requests.read','files.read'])) items.push({ key:'attachments', label:'Anexos', path:paths.attachments });
  }
  if (key === 'customers') {
    if (staff(contexts,['customers.read'])) items.push({ key:'customers', label:'Clientes', path:paths.customers });
    if (staff(contexts,['customers.read','rural.read'])) items.push({ key:'rural', label:'Imóveis rurais', path:paths.rural });
  }
  if (key === 'services') {
    if (staff(contexts,['services.read'])) items.push({ key:'services', label:'Serviços', path:paths.services });
    if (staff(contexts,['requests.read','checklists.read'])) items.push({ key:'checklists', label:'Checklist', path:paths.checklists });
  }
  return items;
}

// Reserve the last shortcut for the section containing Account.
export function mobileOperationNavigation(items: OperationItem[]): OperationItem[] {
  const settings = items.filter(item => item.key === 'settings');
  return [...items.filter(item => item.key !== 'settings').slice(0, 4 - settings.length), ...settings];
}
