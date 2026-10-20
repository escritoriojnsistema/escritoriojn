import type { BusinessRole } from './access.js';

export const teamRoles = ['employee', 'admin', 'owner'] as const;
export type TeamRole = Exclude<BusinessRole, 'client'>;
export const teamRoleNames: Record<TeamRole, string> = {
  owner: 'Superadministrador (Proprietário)', admin: 'Administrador', employee: 'Funcionário',
};
export const assignablePermissions = ['foundation.access', 'audit.read', 'audit.export', 'archives.manage', 'customers.read', 'customers.create', 'customers.update', 'customers.read_all', 'customers.relate', 'customers.verify', 'customers.merge', 'requests.read', 'requests.create', 'requests.update', 'requests.transfer', 'requests.cancel', 'requests.read_all', 'services.read', 'services.manage', 'services.perform', 'services.approve', 'services.discount', 'services.surcharge', 'services.courtesy', 'services.price_override'] as const;
export type TeamPermission = typeof assignablePermissions[number];
export const permissionNames: Record<TeamPermission, string> = {
  'requests.read':'Consultar solicitações do seu escopo', 'requests.create':'Abrir atendimentos', 'requests.update':'Atualizar atendimentos', 'requests.transfer':'Transferir responsável', 'requests.cancel':'Cancelar atendimentos', 'requests.read_all':'Consultar todas as solicitações do escritório',
  'services.read':'Consultar serviços', 'services.manage':'Publicar preços e políticas', 'services.perform':'Executar serviços', 'services.approve':'Aprovar serviços', 'services.discount':'Aplicar descontos', 'services.surcharge':'Aplicar acréscimos', 'services.courtesy':'Conceder cortesia', 'services.price_override':'Alterar preço manualmente',
  'foundation.access': 'Acesso básico', 'audit.read': 'Consultar auditoria', 'audit.export': 'Exportar auditoria', 'archives.manage': 'Gerenciar arquivados',
  'customers.read': 'Consultar clientes do seu escopo', 'customers.create': 'Cadastrar clientes', 'customers.update': 'Editar clientes do seu escopo', 'customers.read_all': 'Consultar todos os clientes do escritório',
  'customers.relate': 'Gerenciar vínculos e representantes', 'customers.verify': 'Conferir identidade de clientes', 'customers.merge': 'Revisar e mesclar fichas duplicadas',
};
export type TeamScope = {
  role_code: TeamRole; allowed_roles: TeamRole[]; allowed_permissions: TeamPermission[];
  can_create_owner: boolean; can_delegate: boolean;
};
export type TeamDelegation = {
  id: string; allowed_roles: TeamRole[]; allowed_permissions: TeamPermission[];
  can_create_owner: boolean; expires_at: string; revoked_at: string | null; active: boolean;
};
export type TeamMember = {
  id: string; user_id: string; name: string | null; email: string; role_code: TeamRole;
  active: boolean; access_active: boolean; permissions: string[]; cpf_masked: string | null;
  can_edit: boolean; archived?: boolean; protected_owner: boolean; delegation: TeamDelegation | null;
};
export type DeliveryStatus = 'pending' | 'sending' | 'sent' | 'failed';
export type TeamInvitation = {
  id: string; name: string; email: string; role_code: TeamRole; permissions: TeamPermission[];
  status: 'pending' | 'accepted' | 'revoked' | 'expired' | 'blocked';
  delivery_status: DeliveryStatus; expires_at: string; created_at: string; cpf_masked: string;
};
type DashboardBase = { scope: TeamScope; total: number; page: number; page_size: number; counts: { members: number; invitations: number } };
export type TeamDashboard = DashboardBase & (
  { kind: 'members'; items: TeamMember[] } | { kind: 'invitations'; items: TeamInvitation[] }
);
export type InvitationState = {
  id: string; office_name: string; verified: boolean; has_password: boolean; verified_until: string | null;
};
export type InvitationVerification = { verified: true; has_password: boolean } |
  { verified: false; code: 'IDENTITY_MISMATCH' | 'TEAM_RATE_LIMIT' };
export type CreateInvitation = {
  office_id: string; email: string; full_name: string; cpf: string; role_code: TeamRole;
  permissions: TeamPermission[]; expires_at: string;
};
export type SetMember = {
  office_id: string; role_code: TeamRole; active: boolean; permissions: TeamPermission[];
};
export type SetDelegation = {
  office_id: string; allowed_roles: TeamRole[]; allowed_permissions: TeamPermission[];
  can_create_owner: boolean; expires_at: string;
};
