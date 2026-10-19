import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador (Proprietário)', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'home' | 'customers' | 'team' | 'audit' | 'archives' | 'account'; label: string; path: string };
export function operationNavigation(contexts: AccessContext[], client: boolean): OperationItem[] {
  const items: OperationItem[] = [{ key: 'home', label: 'Início', path: client ? paths.clientPanel : paths.panel }];
  if (!client && contexts.some(context => context.role_code !== 'client' && context.permissions.includes('customers.read'))) items.push({ key: 'customers', label: 'Clientes', path: paths.customers });
  if (!client && contexts.some(context => context.role_code !== 'client' && context.permissions.includes('users.manage'))) {
    items.push({ key: 'team', label: 'Equipe e convites', path: paths.teamManagement });
  }
  if (!client && contexts.some(c => c.role_code !== 'client' && c.permissions.includes('audit.read'))) items.push({ key: 'audit', label: 'Auditoria', path: paths.audit });
  if (!client && contexts.some(c => c.role_code !== 'client' && c.permissions.includes('archives.manage'))) items.push({ key: 'archives', label: 'Arquivados', path: paths.archives });
  items.push({ key: 'account', label: 'Conta', path: client ? paths.clientAccount : paths.account });
  return items;
}

// Shared rule for every current/future operation screen. The complete registry
// remains in the sidebar; never fill unused slots with unavailable destinations.
export function mobileOperationNavigation(items: OperationItem[]): OperationItem[] {
  const account = items.filter(item => item.key === 'account');
  return [...items.filter(item => item.key !== 'account').slice(0, 4 - account.length), ...account];
}
