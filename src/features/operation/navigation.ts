import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador (Proprietário)', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'home' | 'team' | 'account'; label: string; path: string };
export function operationNavigation(contexts: AccessContext[], client: boolean): OperationItem[] {
  const items: OperationItem[] = [{ key: 'home', label: 'Início', path: client ? paths.clientPanel : paths.panel }];
  if (!client && contexts.some(context => context.role_code !== 'client' && context.permissions.includes('users.manage'))) {
    items.push({ key: 'team', label: 'Equipe e convites', path: paths.teamManagement });
  }
  items.push({ key: 'account', label: 'Conta', path: client ? paths.clientAccount : paths.account });
  return items;
}
