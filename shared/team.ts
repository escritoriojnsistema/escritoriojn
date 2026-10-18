import type { BusinessRole } from './access.js';

export const teamRoles = ['employee', 'admin', 'owner'] as const;
export type TeamRole = Exclude<BusinessRole, 'client'>;
export const teamRoleNames: Record<TeamRole, string> = {
  owner: 'Superadministrador (Proprietário)', admin: 'Administrador', employee: 'Funcionário',
};
export const assignablePermissions = ['foundation.access', 'audit.read', 'audit.export', 'archives.manage'] as const;
export type TeamPermission = typeof assignablePermissions[number];
export const permissionNames: Record<TeamPermission, string> = {
  'foundation.access': 'Acesso básico', 'audit.read': 'Consultar auditoria', 'audit.export': 'Exportar auditoria', 'archives.manage': 'Gerenciar arquivados',
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
