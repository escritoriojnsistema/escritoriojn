import {quickRequiredPermissions} from '../../../shared/finance19';
import type { AccessContext } from '../../../shared/access';
import { paths } from '../../app/routes';

export const operationRoleNames = {
  owner: 'Super administrador (Proprietário)', admin: 'Administrador', employee: 'Funcionário', client: 'Cliente',
};
export type OperationItem = { key: 'documents' | 'templates' | 'quick' | 'reports' | 'expenses' | 'payments' | 'cash' | 'charges' | 'home' | 'checklists' | 'notifications' | 'requests' | 'attachments' | 'customers' | 'services' | 'team' | 'audit' | 'archives' | 'account'; label: string; path: string };
export function operationNavigation(contexts: AccessContext[], client: boolean): OperationItem[] {
  const items: OperationItem[] = [{ key: 'home', label: 'Início', path: client ? paths.clientPanel : paths.panel }];
  if (client || contexts.some(context => context.role_code !== 'client' && context.permissions.includes('requests.read'))) items.push({ key: 'requests', label: client ? 'Minhas solicitações' : 'Solicitações', path: client ? paths.clientRequests : paths.requests });
  if (!client && contexts.some(context => context.role_code !== 'client' && context.permissions.includes('customers.read'))) items.push({ key: 'customers', label: 'Clientes', path: paths.customers });
  if (!client && contexts.some(c=>c.role_code!=='client'&&['documents.read','requests.read','customers.read'].every(p=>c.permissions.includes(p)))) items.push({key:'documents',label:'Documentos',path:paths.documents});
  if (!client && contexts.some(c=>c.role_code!=='client'&&c.permissions.includes('templates.read'))) items.push({key:'templates',label:'Modelos documentais',path:paths.templates});
  if (!client && contexts.some(context => context.role_code !== 'client' && context.permissions.includes('services.read'))) items.push({ key: 'services', label: 'Serviços', path: paths.services });
  if (!client && contexts.some(context => context.role_code !== 'client' && context.permissions.includes('users.manage'))) {
    items.push({ key: 'team', label: 'Equipe e convites', path: paths.teamManagement });
  }
  if (!client && contexts.some(c => c.role_code !== 'client' && c.permissions.includes('audit.read'))) items.push({ key: 'audit', label: 'Auditoria', path: paths.audit });
  if (!client && contexts.some(c => c.role_code !== 'client' && c.permissions.includes('archives.manage'))) items.push({ key: 'archives', label: 'Arquivados', path: paths.archives });
  if (client || contexts.some(context => context.role_code !== 'client' && context.permissions.includes('files.read') && context.permissions.includes('requests.read'))) items.push({ key: 'attachments', label: 'Anexos privados', path: client ? paths.clientAttachments : paths.attachments });
  if (!client && contexts.some(c => c.role_code !== 'client' && c.permissions.includes('requests.read') && c.permissions.includes('checklists.read'))) items.push({key:'checklists',label:'Checklists e pendências',path:paths.checklists});
  if(client)items.push({key:'payments',label:'Meus pagamentos',path:paths.clientPayments});
  items.push({key:'notifications',label:'Notificações',path:client?paths.clientNotifications:paths.notifications});
  if (!client && contexts.some(c => c.role_code !== 'client' && c.permissions.includes('requests.read') && c.permissions.includes('charges.read'))) items.push({key:'charges',label:'Cobranças',path:paths.charges});
  if(!client && contexts.some(c=>c.role_code!=='client'&&c.permissions.includes('cash.read'))) items.push({key:'cash',label:'Caixa',path:paths.cash});
  if(!client&&contexts.some(c=>c.role_code!=='client'&&c.permissions.includes('cash.read')&&['expenses.read','cash.transfer'].some(p=>c.permissions.includes(p))))items.push({key:'expenses',label:'Despesas e movimentações',path:paths.expenses});
  if(!client&&contexts.some(c=>c.role_code!=='client'&&quickRequiredPermissions.every(p=>c.permissions.includes(p))))items.push({key:'quick',label:'Atendimento rápido',path:paths.quick});
  if(!client&&contexts.some(c=>c.role_code!=='client'&&['cash.read','finance.reports.read'].every(p=>c.permissions.includes(p))))items.push({key:'reports',label:'Relatórios financeiros',path:paths.financialReports});
  items.push({ key: 'account', label: 'Conta', path: client ? paths.clientAccount : paths.account });
  return items;
}

// Shared rule for every current/future operation screen. The complete registry
// remains in the sidebar; never fill unused slots with unavailable destinations.
export function mobileOperationNavigation(items: OperationItem[]): OperationItem[] {
  const account = items.filter(item => item.key === 'account');
  return [...items.filter(item => item.key !== 'account').slice(0, 4 - account.length), ...account];
}
