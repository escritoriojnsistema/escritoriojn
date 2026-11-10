import {assignablePermissions,type TeamPermission} from './team.js';
const definitions=[
 ['general','Acesso geral e configurações',['foundation.','settings.','access.']],
 ['customers','Clientes',['customers.']],['services','Serviços',['services.']],
 ['requests','Solicitações e atendimentos',['requests.','categories.','quick.']],
 ['attachments','Anexos dos atendimentos',['files.']],['checklists','Checklists e pendências',['checklists.']],
 ['corrections','Correções cadastrais',['accounts.corrections.']],['documents','Documentos',['documents.']],
 ['templates','Modelos documentais',['templates.']],['charges','Cobranças',['charges.']],
 ['cash','Caixa',['cash.']],['expenses','Despesas e contas a pagar',['expenses.']],
 ['reports','Relatórios financeiros',['finance.reports.']],['receipts','Recibos',['receipts.']],
 ['audit','Auditoria',['audit.']],['archives','Arquivados do escritório',['archives.']],['rural','Imóveis rurais',['rural.']],['specialized','Previdenciário e jurídico',['specialized.']],
] as const;
export function permissionAction(p:TeamPermission){if(/\.read(_all)?$/.test(p))return 'Consulta';if(/\.(create|open|issue)$/.test(p))return 'Cadastro e emissão';if(/\.(update|apply|adjust)$/.test(p)||p.startsWith('rural.')&&p.endsWith('.manage'))return 'Edição e vínculos';if(/\.(approve|validate|review|decide|verify)$/.test(p))return 'Conferência e aprovação';if(p.endsWith('.manage'))return 'Configuração e gestão';return 'Ações especiais';}
export const permissionModules=definitions.map(([id,label,prefixes])=>({id,label,permissions:assignablePermissions.filter(p=>prefixes.some(prefix=>p.startsWith(prefix))).sort((a,b)=>permissionAction(a).localeCompare(permissionAction(b),'pt-BR')||a.localeCompare(b))}));
export const administrativePermissions=new Set<TeamPermission>(['access.manage','categories.manage','requests.archives.manage','requests.reclaim','customers.merge','templates.approve','documents.deliveries.revoke','finance.reports.manage','cash.closure.approve','cash.closure.adjust','audit.archives','audit.manage']);
export const permissionDependencies:Partial<Record<TeamPermission,TeamPermission[]>>={
 'specialized.read':['requests.read','customers.read','checklists.read'],'specialized.manage':['specialized.read'],'specialized.conduct':['specialized.read','specialized.manage'],'specialized.sensitive':['specialized.read','files.read'],
 'rural.read':['customers.read'],'rural.read_all':['rural.read','customers.read_all'],'rural.create':['rural.read','customers.create'],'rural.parties.manage':['rural.read','customers.update'],'rural.records.manage':['rural.read','customers.update','requests.read','files.read'],
 'requests.create':['requests.read'],'requests.update':['requests.read'],'requests.transfer':['requests.read'],'requests.cancel':['requests.read'],'requests.read_all':['requests.read'],'requests.reclaim':['requests.read'],
 'checklists.read':['requests.read'],'checklists.manage':['requests.read','checklists.read'],'checklists.update':['requests.read','checklists.read'],'checklists.waive':['requests.read','checklists.read'],
 'charges.read':['requests.read'],'charges.create':['requests.read','charges.read'],'charges.adjust':['requests.read','charges.read'],'charges.cancel':['requests.read','charges.read'],
 'templates.manage':['templates.read'],'templates.approve':['templates.read'],
 'audit.export':['audit.read'],'cash.open':['cash.read'],'cash.read_all':['cash.read'],
 'customers.create':['customers.read'],'customers.update':['customers.read'],'customers.relate':['customers.read'],'customers.verify':['customers.read'],'customers.merge':['customers.read'],
 'accounts.corrections.read':['requests.read'],'accounts.corrections.apply':['requests.read','accounts.corrections.read'],
 'files.read':['requests.read'],'files.upload':['requests.read','files.read'],'files.copy':['requests.read','files.read','files.upload'],'files.manage':['requests.read','files.read'],
 'finance.reports.read_all':['finance.reports.read','cash.read_all'],'finance.reports.export':['finance.reports.read'],
 'documents.create':['documents.read','requests.read','customers.read'],'documents.update':['documents.read','requests.read','customers.read'],
};
export const permissionSearch=(value:string)=>value.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
