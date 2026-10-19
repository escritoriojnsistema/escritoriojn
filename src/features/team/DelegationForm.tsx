import { ShieldCheck, X, XCircle } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { teamRoleNames, teamRoles, type TeamMember, type TeamPermission, type TeamRole, type TeamScope } from '../../../shared/team';
import { teamApi } from './api';
import { dateLabel, PermissionFields } from './TeamFields';
export function DelegationForm({ member, office, scope, onClose, onSaved, onError }: { member: TeamMember; office: string; scope: TeamScope; onClose: () => void; onSaved: () => void; onError: (cause: unknown) => void }) {
  const delegation = member.delegation?.active ? member.delegation : null;
  const [roles, setRoles] = useState<TeamRole[]>(delegation?.allowed_roles ?? ['employee']);
  const [permissions, setPermissions] = useState<TeamPermission[]>(delegation?.allowed_permissions ?? ['foundation.access']);
  const [owner, setOwner] = useState(delegation?.can_create_owner ?? false);
  const [days, setDays] = useState(30);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !roles.length || !window.confirm('Confirmar esta delegação de gestão? A delegação anterior e seus convites pendentes serão revogados.')) return;
    setBusy(true);
    try { await teamApi.delegation(member.id, { office_id: office, allowed_roles: roles.filter(role => role !== 'owner' || owner), allowed_permissions: permissions, can_create_owner: owner, expires_at: new Date(Date.now() + days * 86_400_000).toISOString() }); onSaved(); }
    catch (cause) { onError(cause); }
    finally { setBusy(false); }
  }
  async function revoke() {
    if (!delegation || busy || !window.confirm('Revogar esta delegação e seus convites pendentes? O administrador perderá os poderes delegados na próxima operação.')) return;
    setBusy(true);
    try { await teamApi.revokeDelegation(delegation.id, office); onSaved(); }
    catch (cause) { onError(cause); }
    finally { setBusy(false); }
  }
  return <section className="team-editor" aria-labelledby="delegation-heading"><div className="team-section-heading"><h2 id="delegation-heading">Delegar gestão</h2><button type="button" className="team-text-button" disabled={busy} onClick={onClose}><X size={17} aria-hidden="true" />Fechar</button></div><p className="team-hint">{member.name || member.email}. O administrador só poderá conceder o escopo selecionado.</p>{delegation && <p className="team-hint">Delegação atual até {dateLabel(delegation.expires_at)}.</p>}<form onSubmit={submit}><fieldset disabled={busy}><fieldset className="team-permissions"><legend>Funções que poderá convidar e gerenciar</legend>{teamRoles.filter(role => role !== 'owner').map(role => <label key={role} className="team-check"><input type="checkbox" checked={roles.includes(role)} onChange={event => setRoles(event.target.checked ? [...roles, role] : roles.filter(item => item !== role))} />{teamRoleNames[role]}</label>)}<label className="team-check"><input type="checkbox" checked={owner} onChange={event => { setOwner(event.target.checked); setRoles(event.target.checked ? [...roles, 'owner'] : roles.filter(role => role !== 'owner')); }} />Criar novos proprietários</label></fieldset><PermissionFields prefix="delegation" allowed={scope.allowed_permissions} value={permissions} onChange={setPermissions} /><label className="team-field" htmlFor="delegation-days">Validade em dias<input id="delegation-days" type="number" min={1} max={90} step={1} value={days} onChange={event => setDays(Number(event.target.value))} required /></label><p className="team-hint">Padrão de 30 dias; máximo de 90. Não permite delegação em cadeia.</p><button className="primary-button" disabled={busy || !roles.length}><ShieldCheck size={18} aria-hidden="true" />Conceder delegação</button>{delegation && <button type="button" className="secondary-button" disabled={busy} onClick={() => void revoke()}><XCircle size={18} aria-hidden="true" />Revogar delegação atual</button>}</fieldset></form></section>;
}
