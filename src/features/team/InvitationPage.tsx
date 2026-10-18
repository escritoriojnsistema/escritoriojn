import { ArrowLeft, ArrowRight, LogIn, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { uuidPattern } from '../../../shared/access';
import { teamRoles, type InvitationState, type TeamRole } from '../../../shared/team';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { authError, supabase } from '../auth/browser';
import { AccessShell } from '../access/AccessShell';
import { PasswordField } from '../access/PasswordField';
import { teamApi, teamError, type TeamError } from './api';
import { RoleField } from './TeamFields';
import { validCpf, validFullName } from './validation';
import './team.css';
export default function InvitationPage() {
  const [params] = useSearchParams();
  const id = params.get('id') ?? '';
  const validId = uuidPattern.test(id);
  const auth = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<InvitationState>();
  const [error, setError] = useState<TeamError>();
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [role, setRole] = useState<TeamRole>('employee');
  const [keepPassword, setKeepPassword] = useState(true);
  useEffect(() => {
    if (!validId) return;
    const controller = new AbortController();
    setState(undefined); setError(undefined); setMessage('');
    void teamApi.state(id, controller.signal).then(result => {
      if (!controller.signal.aborted) { setState(result); setKeepPassword(result.has_password); }
    }).catch(cause => { if (!controller.signal.aborted) setError(teamError(cause)); });
    return () => controller.abort();
  }, [id, validId, revision]);
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy) return;
    const form = event.currentTarget;
    const values = new FormData(form);
    const fullName = String(values.get('full_name') ?? '');
    const cpf = String(values.get('cpf') ?? '');
    if (!validFullName(fullName) || !validCpf(cpf)) { setMessage('Confira o nome completo e o CPF válido com 11 dígitos.'); return; }
    setBusy(true); setMessage('');
    try {
      const result = await teamApi.verify(id, { full_name: fullName.trim(), cpf: cpf.replace(/\D/g, ''), role_code: role });
      if (!result.verified) { setMessage(result.code === 'TEAM_RATE_LIMIT' ? 'Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.' : 'Não foi possível conferir os dados. Confira o cadastro recebido do escritório.'); return; }
      form.reset(); setKeepPassword(result.has_password);
      // A new server read restores the session-bound verification on reload too.
      const next = await teamApi.state(id); setState(next);
    } catch (cause) { setError(teamError(cause)); }
    finally { setBusy(false); }
  }
  async function accept(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || !state?.verified || !supabase) return;
    const values = new FormData(event.currentTarget);
    const changePassword = !state.has_password || !keepPassword;
    const password = String(values.get('password') ?? '');
    if (changePassword && (password.length < 8 || password !== String(values.get('password_confirm') ?? ''))) { setMessage('Use uma senha com pelo menos 8 caracteres e confirme a mesma senha.'); return; }
    setBusy(true); setMessage('');
    try {
      // Recheck before offering a credential operation; only the server grants membership.
      const current = await teamApi.state(id);
      if (!current.verified) { setState(current); setMessage('A conferência expirou. Confira seus dados novamente.'); return; }
      if (changePassword) {
        const { error: passwordError } = await supabase.auth.updateUser({ password });
        if (passwordError) { setMessage(authError(passwordError)); return; }
      }
      await teamApi.accept(id); auth.refresh(); navigate(paths.panel, { replace: true });
    } catch (cause) { setError(teamError(cause)); }
    finally { setBusy(false); }
  }
  const refused = !validId || (error && [403, 409, 410, 404, 422].includes(error.status));
  return <AccessShell title="Convite para a equipe" description={state ? `Acesso ao ${state.office_name}.` : 'Confirme seu acesso individual ao escritório.'}>{refused ? <><p role="alert" className="form-feedback error">Este convite não está disponível. Solicite um novo convite ao escritório.</p><Link className="return-login" to={paths.team}><ArrowLeft size={18} aria-hidden="true" />Ir para o acesso da equipe</Link></> : error ? <><p role="alert" className="form-feedback error">{error.status === 401 ? 'Sua sessão está ausente, expirou ou foi encerrada. Abra o link recebido por e-mail ou entre novamente.' : error.message}</p>{error.status === 401 ? <Link className="primary-button" to={`${paths.team}?invite=${encodeURIComponent(id)}`}><LogIn size={18} aria-hidden="true" />Entrar para continuar</Link> : <button className="primary-button" onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} aria-hidden="true" />Tentar novamente</button>}</> : !state ? null : state.verified ? <><p className="form-feedback" role="status">Dados conferidos. Agora finalize seu acesso.</p><form onSubmit={accept}><fieldset disabled={busy}>{state.has_password && <fieldset className="team-permissions"><legend>Senha da sua conta</legend><label className="team-check"><input type="radio" name="password_choice" checked={keepPassword} onChange={() => setKeepPassword(true)} />Manter minha senha atual</label><label className="team-check"><input type="radio" name="password_choice" checked={!keepPassword} onChange={() => setKeepPassword(false)} />Definir nova senha</label></fieldset>}{(!state.has_password || !keepPassword) && <><label htmlFor="password">Nova senha</label><PasswordField fresh /><label className="team-confirm-label" htmlFor="password_confirm">Confirmar nova senha</label><div className="input-wrap"><input id="password_confirm" name="password_confirm" type="password" autoComplete="new-password" minLength={8} maxLength={128} required /></div></>}{message && <p className="form-feedback error" role="alert">{message}</p>}<button className="primary-button" disabled={busy}><ArrowRight size={18} aria-hidden="true" />{busy ? 'Finalizando…' : 'Aceitar convite e entrar'}</button></fieldset></form></> : <><p className="access-description">Informe os dados cadastrados no convite. Escolher uma função aqui serve apenas para conferência.</p><form onSubmit={verify}><fieldset disabled={busy}><label className="team-field" htmlFor="verify-name">Nome completo<input id="verify-name" name="full_name" autoComplete="off" maxLength={120} required /></label><label className="team-field" htmlFor="verify-cpf">CPF<input id="verify-cpf" name="cpf" autoComplete="off" inputMode="numeric" maxLength={14} required /></label><RoleField id="verify-role" roles={[...teamRoles]} value={role} onChange={setRole} />{message && <p className="form-feedback error" role="alert">{message}</p>}<button className="primary-button" disabled={busy}><ShieldCheck size={18} aria-hidden="true" />{busy ? 'Conferindo…' : 'Conferir dados'}</button></fieldset></form></>}</AccessShell>;
}
