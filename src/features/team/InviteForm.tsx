import { useState, type FormEvent } from 'react';
import type { TeamPermission, TeamScope } from '../../../shared/team';
import { teamApi } from './api';
import { invitationRoles, validCpf, validFullName } from './validation';
import { PermissionFields, RoleField } from './TeamFields';
export function InviteForm({ office, scope, onClose, onCreated, onError }: { office: string; scope: TeamScope; onClose: () => void; onCreated: (id: string, delivery: string) => void; onError: (cause: unknown) => void }) {
  const roles = invitationRoles(scope);
  const [role, setRole] = useState(roles[0] ?? 'employee');
  const [permissions, setPermissions] = useState<TeamPermission[]>(['foundation.access']);
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [identity, setIdentity] = useState({ full_name: '', email: '', cpf: '' });
  const [hours, setHours] = useState(72);
  function validIdentity() {
    if (!validFullName(identity.full_name)) { setError('Informe o nome completo, com nome e sobrenome.'); return false; }
    if (!validCpf(identity.cpf)) { setError('Informe um CPF válido com 11 dígitos.'); return false; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) { setError('Confira o endereço de e-mail.'); return false; }
    setError(''); return true;
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !validIdentity()) return;
    if (step === 1 && window.matchMedia('(max-width: 600px)').matches) { setStep(2); return; }
    if (role === 'owner' && !window.confirm('Confirmar o convite de um novo proprietário? Esse papel terá poderes de proprietário no escritório.')) return;
    setBusy(true);
    try {
      const result = await teamApi.invite({ office_id: office, full_name: identity.full_name.trim(), email: identity.email.trim(), cpf: identity.cpf.replace(/\D/g, ''), role_code: role, permissions, expires_at: new Date(Date.now() + hours * 3_600_000).toISOString() });
      setIdentity({ full_name: '', email: '', cpf: '' }); onCreated(result.id, result.delivery);
    } catch (cause) { onError(cause); }
    finally { setBusy(false); }
  }
  return <section className="team-editor" aria-labelledby="invite-heading"><div className="team-section-heading"><h2 id="invite-heading">Novo convite</h2><button className="team-text-button" type="button" onClick={onClose} disabled={busy}>Fechar</button></div><p className="team-hint">O convite só libera acesso depois da conferência dos dados.</p><form onSubmit={submit}><fieldset disabled={busy}><p className="team-mobile-steps" aria-live="polite">Etapa {step} de 2 · {step === 1 ? 'Dados' : 'Acesso'}</p><div className={`invite-identity ${step === 2 ? 'mobile-step-hidden' : ''}`}><label className="team-field" htmlFor="invite-name">Nome completo<input id="invite-name" autoComplete="off" value={identity.full_name} onChange={event => setIdentity({ ...identity, full_name: event.target.value })} maxLength={120} required /></label><label className="team-field" htmlFor="invite-email">E-mail<input id="invite-email" type="email" autoComplete="off" value={identity.email} onChange={event => setIdentity({ ...identity, email: event.target.value })} maxLength={254} required /></label><label className="team-field" htmlFor="invite-cpf">CPF<input id="invite-cpf" inputMode="numeric" autoComplete="off" value={identity.cpf} onChange={event => setIdentity({ ...identity, cpf: event.target.value })} maxLength={14} required /></label><button className="primary-button team-next-step" type="button" onClick={() => { if (validIdentity()) setStep(2); }}>Continuar para acesso</button></div><div className={`invite-access ${step === 1 ? 'mobile-step-hidden' : ''}`}><RoleField id="invite-role" roles={roles} value={role} onChange={setRole} /><PermissionFields prefix="invite" allowed={scope.allowed_permissions} value={permissions} onChange={setPermissions} /><label className="team-field" htmlFor="invite-hours">Validade do convite<select id="invite-hours" value={hours} onChange={event => setHours(Number(event.target.value))}><option value={24}>24 horas</option><option value={72}>72 horas</option><option value={168}>7 dias</option></select></label>{role === 'owner' && <p className="team-hint">Este convite cria outro proprietário, com os poderes desse papel.</p>}<div className="team-actions"><button className="team-text-button team-back-step" type="button" onClick={() => setStep(1)}>Voltar aos dados</button><button className="primary-button" disabled={busy || !roles.length}>{busy ? 'Criando…' : 'Criar e enviar convite'}</button></div></div>{error && <p role="alert" className="form-feedback error">{error}</p>}</fieldset></form></section>;
}
