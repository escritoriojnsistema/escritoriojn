export type AuditFilters = { action: string; actor_id: string; from: string; until: string };
export const emptyAuditFilters: AuditFilters = { action: '', actor_id: '', from: '', until: '' };
export type AuditEvent = { id: string; actor_id: string | null; actor_name: string; action: string; target_type: string; target_id: string | null; outcome: 'success' | 'denied' | 'failure'; occurred_at: string; request_id: string; changes: Record<string, unknown> };
export type ArchiveEntry = { id: string; target_type: 'membership'; target_id: string; target_label: string; archived_at: string; restored_at: string | null };
export type GovernancePage<T> = { items: T[]; total: number; page: number; page_size: number };
export type AuditView = 'recent' | 'archived';
export type AuditPolicy = { days: 30 | 60 | 90; version: number; cutoff: string; effective_at: string };
export type AuditReport = { id: string; protocol: string; count: number; office_id: string; office_name: string; actor_name: string; created_at: string; view: AuditView; cutoff: string; filters: AuditFilters; renderer_version: 1|2|3|4|5|6|7|8; contract_version: 1 };
export type AuditVerification = { match: boolean; protocol: string; count: number; created_at: string; bytes: number };
export const auditReportMaxEvents = 10_000;
export const auditReportMaxBytes = 3 * 1024 * 1024;
export const auditActionNames: Record<string, string> = {
 'checklists.model_published':'Modelo de checklist publicado', 'checklists.applied':'Checklist aplicado', 'checklists.item_updated':'Item de checklist atualizado',
 'requests.created':'Atendimento aberto', 'requests.status_changed':'Etapa do atendimento alterada', 'requests.transferred':'Responsável pelo atendimento alterado', 'requests.note_added':'Nota interna registrada', 'requests.triaged':'Solicitação classificada',
 'services.created':'Serviço cadastrado', 'services.version_published':'Versão de serviço publicada',
 'foundation.owner_provisioned': 'Proprietário provisionado', 'auth.client_registered': 'Cliente cadastrado', 'auth.registration_configured': 'Cadastro público configurado',
 'auth.customer_registration_received': 'Cadastro público recebido',
 'team.member_updated': 'Acesso atualizado', 'team.invitation_created': 'Convite criado', 'team.invitation_sent': 'Convite enviado',
 'team.invitation_delivery_claimed': 'Envio de convite iniciado', 'team.invitation_delivery_failed': 'Falha no envio do convite',
 'team.invitation_revoked': 'Convite revogado', 'team.invitation_verified': 'Identidade do convite conferida', 'team.invitation_accepted': 'Convite aceito',
 'team.delegation_granted': 'Gestão delegada', 'team.delegation_revoked': 'Delegação revogada',
 'audit.exported': 'Auditoria exportada', 'archives.archived': 'Acesso arquivado', 'archives.restored': 'Referência restaurada',
 'customers.assignment_grant': 'Acesso ao cliente atribuído', 'customers.assignment_revoke': 'Acesso ao cliente revogado',
 'customers.representation_grant': 'Representação registrada', 'customers.representation_revoke': 'Representação revogada',
 'customers.identity_verify': 'Identidade conferida', 'customers.identity_revoke': 'Conferência de identidade revogada',
 'customers.merged': 'Fichas de cliente mescladas',
 'customers.created': 'Ficha de cliente cadastrada', 'customers.updated': 'Ficha de cliente atualizada',
};

Object.assign(auditActionNames,{
 'cash.closure_recorded':'Conferência por meio registrada','cash.closure_reviewed':'Divergência de fechamento revisada','cash.closure_adjusted':'Ajuste de conferência registrado',
 'expenses.create':'Conta a pagar registrada','expenses.approve':'Despesa aprovada','expenses.pay':'Despesa paga','cash.transferred':'Movimentação entre contas registrada','receipts.issued':'Recibo de pagamento emitido',
 'audit.policy_changed':'Prazo de arquivamento da auditoria alterado','audit.report_started':'Preparação de relatório de auditoria registrada','notifications.read':'Aviso marcado como lido',
 'accounts.correction_requested':'Correção cadastral solicitada','accounts.correction_applied':'Correção cadastral aplicada','accounts.email_confirmed':'E-mail da conta confirmado','accounts.self_updated':'Dados da própria conta atualizados',
 'payments.allocation_reversed':'Alocação de pagamento estornada','payments.refund_paid':'Devolução efetiva registrada',
 'payments.pending':'Pagamento pendente registrado','payments.rejected':'Pagamento pendente rejeitado','payments.settled':'Liquidação manual de cartão registrada',
 'cash.configured':'Configuração financeira atualizada','cash.opened':'Caixa individual aberto','cash.payment_received':'Pagamento registrado no caixa','cash.payment_refunded':'Reembolso registrado','cash.payment_reversed':'Pagamento estornado','cash.reconciliation_recorded':'Conciliação do caixa registrada','cash.session_closed':'Caixa encerrado',
 'charges.created':'Cobrança criada','charges.adjusted':'Cobrança ajustada','charges.cancelled':'Cobrança cancelada',
 'requests.reclaimed':'Atendimento retomado pelo responsável',
 'files.upload_intended':'Envio de anexo iniciado','files.download_authorized':'Consulta de anexo autorizada','files.policy_updated':'Política de anexos atualizada','files.cleanup_taken_over':'Limpeza de anexos retomada','files.cleanup_planned':'Limpeza de anexos planejada','files.process_claimed':'Processamento de anexo iniciado','files.process_completed':'Processamento de anexo concluído',
});
const auditModules:Record<string,string>={expenses:'despesas',receipts:'recibos',payments:'pagamentos',accounts:'conta',cash:'caixa',charges:'cobranças',requests:'atendimentos',services:'serviços',files:'anexos',customers:'clientes',team:'equipe e permissões',auth:'acesso',foundation:'configuração inicial',checklists:'checklists',audit:'auditoria',archives:'arquivados',notifications:'notificações'};
export function auditActionLabel(action:string):string{return auditActionNames[action]??`Evento de ${auditModules[action.split('.')[0]]??'outro módulo'}`;}
export const auditFieldNames:Record<string,string>={reversal_id:'Referência do estorno lógico',refund_id:'Referência da devolução',payment_id:'Referência do pagamento',active:'Acesso ativo',role_code:'Função',permissions:'Permissões',allowed_permissions:'Permissões delegadas',allowed_roles:'Funções delegadas',can_create_owner:'Pode convidar super administrador',expires_at:'Validade',membership_id:'Referência do acesso',archive_id:'Referência do arquivo',count:'Quantidade',customer_id:'Referência do cliente',source_id:'Referência de origem',target_id:'Referência de destino',relation_id:'Referência do vínculo',merge_id:'Referência da mesclagem',version:'Versão',status:'Situação',unit_id:'Unidade',session_id:'Caixa',charge_id:'Cobrança',request_id:'Atendimento',payment_method_id:'Forma de pagamento',amount_cents:'Valor',reason:'Motivo'};
export const auditTargetNames:Record<string,string>={account:'Conta',account_correction:'Correção cadastral',cash_session:'Caixa individual',cash_unit:'Unidade financeira',cash_account:'Conta financeira',cash_payment_method:'Forma de pagamento',charge:'Cobrança',request:'Atendimento',service:'Serviço',file:'Anexo',file_process:'Processamento de anexo',file_cleanup:'Limpeza de anexos',membership:'Acesso da equipe',delegation:'Delegação de permissões',invitation:'Convite',customer:'Cliente',office:'Escritório',audit:'Auditoria',notification:'Notificação'};
export function auditFieldLabel(field:string):string{return auditFieldNames[field]??'Informação adicional';}

Object.assign(auditFieldNames,{delta_cents:'Variação em reais',days:'Prazo em dias',previous_days:'Prazo anterior em dias',report_id:'Protocolo do relatório',notification_id:'Referência do aviso',cutoff:'Corte do arquivo',view:'Histórico selecionado',version:'Versão',amount_cents:'Valor em reais',due_cents:'Obrigação em reais',balance_cents:'Saldo em reais',entry_id:'Referência do lançamento',counted_cents:'Valor conferido',expected_cents:'Valor esperado',item_id:'Referência do item',model_id:'Referência do modelo',file_id:'Referência do anexo'});
const auditValues:Record<string,string>={client:'Cliente','users.manage':'Gerenciar equipe e convites','users.owners.create':'Convidar superadministrador',success:'Concluído',denied:'Negado',failure:'Falha',recent:'Recentes',archived:'Arquivados',open:'Aberto',closed:'Encerrado',cancelled:'Cancelado',completed:'Concluído',pending:'Pendente',received:'Recebido',validated:'Validado',waived:'Dispensado',cash:'Espécie',bank:'Banco',digital:'Digital',pix:'Pix',card:'Cartão',transfer:'Transferência'};
export function auditValueLabel(value:unknown,field='',names:Record<string,string>={}):string {
 if(value===null||value===undefined)return 'Não informado';
 if(typeof value==='boolean')return value?'Sim':'Não';
 if(Array.isArray(value))return value.map(v=>auditValueLabel(v,field,names)).join(', ');
 if(typeof value==='number')return field.endsWith('_cents')?new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100):String(value);
 if(typeof value==='string')return names[value]??auditValues[value]??value;
 return 'Informação estruturada registrada';
}

Object.assign(auditTargetNames,{cash_closure:'Conferência de caixa'});
Object.assign(auditFieldNames,{closure_id:'Referência da conferência',differences_count:'Meios com divergência',absolute_difference_cents:'Soma absoluta das diferenças',has_difference:'Há divergência',decision:'Decisão da revisão'});

Object.assign(auditActionNames,{'quick.completed':'Atendimento rápido concluído','finance.report_prepared':'Relatório financeiro preparado','finance.report_exported':'Relatório financeiro exportado','finance.report_timezone_changed':'Fuso dos relatórios alterado'});
Object.assign(auditTargetNames,{financial_report:'Relatório financeiro',finance_report_settings:'Configuração dos relatórios'});
Object.assign(auditFieldNames,{format:'Formato do arquivo'});

Object.assign(auditActionNames,{'templates.saved':'Versão de modelo salva','templates.approved':'Versão de modelo aprovada'});
Object.assign(auditTargetNames,{template:'Modelo documental'});

Object.assign(auditActionNames,{'documents.created':'Rascunho documental criado','documents.saved':'Revisão documental salva','documents.participants_changed':'Participantes do documento alterados','documents.prepared':'Preenchimento documental concluído'});
Object.assign(auditTargetNames,{document:'Documento em preenchimento'});
