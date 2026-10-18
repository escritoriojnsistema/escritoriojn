import { Save, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import type { TeamMember, TeamPermission, TeamScope } from '../../../shared/team';
import { teamApi } from './api';
import { invitationRoles } from './validation';
import { PermissionFields, RoleField } from './TeamFields';
const rank = { employee: 0, admin: 1, owner: 2 };
export function MemberForm({ member, office, scope, onClose, onSaved, onError }: { member: TeamMember; office: string; scope: TeamScope; onClose: () => void; onSaved: () => void; onError: (cause: unknown) => void }) {
  const [role, setRole] = useState(member.role_code);
  const [active, setActive] = useState(member.active);
  const [permissions, setPermissions] = useState<TeamPermission[]>(() => [...new Set<TeamPermission>(['foundation.access', ...member.permissions.filter((item): item is TeamPermission => scope.allowed_permissions.includes(item as TeamPermission))])]);
  const [busy, setBusy] = useState(false);
  const roles = [...new Set([member.role_code, ...invitationRoles(scope)])].filter(role => role !== 'owner' || member.role_code === 'owner');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    if ((!active || rank[role] < rank[member.role_code]) && !window.confirm('Confirmar a redução ou desativação deste acesso? O histórico será preservado e o acesso mudará na próxima operação.')) return;
    setBusy(true);
    try { await teamApi.member(member.id, { office_id: office, role_code: role, active, permissions }); onSaved(); }
    catch (cause) { onError(cause); }
    finally { setBusy(false); }
  }
  return <section className="team-editor" aria-labelledby="member-heading"><div className="team-section-heading"><h2 id="member-heading">Editar acesso</h2><button type="button" className="team-text-button" disabled={busy} onClick={onClose}><X size={17} aria-hidden="true" />Fechar</button></div><p className="team-hint">{member.name || member.email}</p><form onSubmit={submit}><fieldset disabled={busy}><RoleField id="member-role" roles={roles} value={role} onChange={setRole} disabled={member.protected_owner} /><PermissionFields prefix="member" allowed={scope.allowed_permissions} value={permissions} onChange={setPermissions} /><label className="team-check"><input type="checkbox" checked={active} disabled={member.protected_owner} onChange={event => setActive(event.target.checked)} />Conta ativa neste escritório</label>{member.protected_owner && <p className="team-hint">Último proprietário ativo: função e ativação protegidas.</p>}<button className="primary-button" disabled={busy}><Save size={18} aria-hidden="true" />{busy ? 'Salvando…' : 'Salvar acesso'}</button></fieldset></form></section>;
}
