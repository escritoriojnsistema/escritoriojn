export type AuditFilters = { action: string; actor_id: string; from: string; until: string };
export const emptyAuditFilters: AuditFilters = { action: '', actor_id: '', from: '', until: '' };
export type AuditEvent = { id: string; actor_id: string | null; actor_name: string; action: string; target_type: string; target_id: string | null; outcome: 'success' | 'denied' | 'failure'; occurred_at: string; request_id: string; changes: Record<string, unknown> };
export type ArchiveEntry = { id: string; target_type: 'membership'; target_id: string; target_label: string; archived_at: string; restored_at: string | null };
export type GovernancePage<T> = { items: T[]; total: number; page: number; page_size: number };
export type AuditExport = { items: AuditEvent[]; count: number; office_id: string; exported_at: string; request_id: string };
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
 'accounts.correction_requested':'Correção cadastral solicitada','accounts.correction_applied':'Correção cadastral aplicada','accounts.email_confirmed':'E-mail da conta confirmado','accounts.self_updated':'Dados da própria conta atualizados',
 'cash.configured':'Configuração financeira atualizada','cash.opened':'Caixa individual aberto','cash.payment_received':'Pagamento registrado no caixa','cash.payment_refunded':'Reembolso registrado','cash.payment_reversed':'Pagamento estornado','cash.reconciliation_recorded':'Conciliação do caixa registrada','cash.session_closed':'Caixa encerrado',
 'charges.created':'Cobrança criada','charges.adjusted':'Cobrança ajustada','charges.cancelled':'Cobrança cancelada',
 'requests.reclaimed':'Atendimento retomado pelo responsável',
 'files.upload_intended':'Envio de anexo iniciado','files.download_authorized':'Consulta de anexo autorizada','files.policy_updated':'Política de anexos atualizada','files.cleanup_taken_over':'Limpeza de anexos retomada','files.cleanup_planned':'Limpeza de anexos planejada','files.process_claimed':'Processamento de anexo iniciado','files.process_completed':'Processamento de anexo concluído',
});
const auditModules:Record<string,string>={accounts:'conta',cash:'caixa',charges:'cobranças',requests:'atendimentos',services:'serviços',files:'anexos',customers:'clientes',team:'equipe e permissões',auth:'acesso',foundation:'configuração inicial',checklists:'checklists',audit:'auditoria',archives:'arquivados',notifications:'notificações'};
export function auditActionLabel(action:string):string{return auditActionNames[action]??`Evento de ${auditModules[action.split('.')[0]]??'outro módulo'}`;}
export const auditFieldNames:Record<string,string>={active:'Acesso ativo',role_code:'Função',permissions:'Permissões',allowed_permissions:'Permissões delegadas',allowed_roles:'Funções delegadas',can_create_owner:'Pode convidar super administrador',expires_at:'Validade',membership_id:'Referência do acesso',archive_id:'Referência do arquivo',count:'Quantidade',customer_id:'Referência do cliente',source_id:'Referência de origem',target_id:'Referência de destino',relation_id:'Referência do vínculo',merge_id:'Referência da mesclagem',version:'Versão',status:'Situação',unit_id:'Unidade',session_id:'Caixa',charge_id:'Cobrança',request_id:'Atendimento',payment_method_id:'Forma de pagamento',amount_cents:'Valor',reason:'Motivo'};
export const auditTargetNames:Record<string,string>={account:'Conta',account_correction:'Correção cadastral',cash_session:'Caixa individual',cash_unit:'Unidade financeira',cash_account:'Conta financeira',cash_payment_method:'Forma de pagamento',charge:'Cobrança',request:'Atendimento',service:'Serviço',file:'Anexo',file_process:'Processamento de anexo',file_cleanup:'Limpeza de anexos',membership:'Acesso da equipe',delegation:'Delegação de permissões',invitation:'Convite',customer:'Cliente',office:'Escritório',audit:'Auditoria',notification:'Notificação'};
export function auditFieldLabel(field:string):string{return auditFieldNames[field]??'Informação adicional';}
