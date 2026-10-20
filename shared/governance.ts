export type AuditFilters = { action: string; actor_id: string; from: string; until: string };
export const emptyAuditFilters: AuditFilters = { action: '', actor_id: '', from: '', until: '' };
export type AuditEvent = { id: string; actor_id: string | null; actor_name: string; action: string; target_type: string; target_id: string | null; outcome: 'success' | 'denied' | 'failure'; occurred_at: string; request_id: string; changes: Record<string, unknown> };
export type ArchiveEntry = { id: string; target_type: 'membership'; target_id: string; target_label: string; archived_at: string; restored_at: string | null };
export type GovernancePage<T> = { items: T[]; total: number; page: number; page_size: number };
export type AuditExport = { items: AuditEvent[]; count: number; office_id: string; exported_at: string; request_id: string };
export const auditActionNames: Record<string, string> = {
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
