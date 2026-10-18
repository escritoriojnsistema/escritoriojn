import type { TeamPermission, TeamRole } from '../../../shared/team';
import { permissionNames, teamRoleNames } from '../../../shared/team';
export function RoleField({ id, roles, value, onChange, disabled }: { id: string; roles: TeamRole[]; value: TeamRole; onChange: (role: TeamRole) => void; disabled?: boolean }) {
  return <label className="team-field" htmlFor={id}>Função<select id={id} value={value} onChange={event => onChange(event.target.value as TeamRole)} disabled={disabled} required>{roles.map(role => <option key={role} value={role}>{teamRoleNames[role]}</option>)}</select></label>;
}
export function PermissionFields({ allowed, value, onChange, prefix }: { allowed: TeamPermission[]; value: TeamPermission[]; onChange: (value: TeamPermission[]) => void; prefix: string }) {
  return <fieldset className="team-permissions"><legend>Permissões dos módulos existentes</legend>{allowed.map(permission => <label className="team-check" key={permission} htmlFor={`${prefix}-${permission}`}><input id={`${prefix}-${permission}`} type="checkbox" checked={permission === 'foundation.access' || value.includes(permission)} disabled={permission === 'foundation.access'} onChange={event => onChange(event.target.checked ? [...value, permission] : value.filter(item => item !== permission))} />{permissionNames[permission]}{permission === 'foundation.access' && <small>Obrigatório</small>}</label>)}</fieldset>;
}
export function dateLabel(value: string) { return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }); }
