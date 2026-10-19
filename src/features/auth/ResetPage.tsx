import { KeyRound, Mail } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { paths } from '../../app/routes';
import { useAuth } from './AuthProvider';
import { supabase, authError } from './browser';
import { AccessShell } from '../access/AccessShell';
import { PasswordField } from '../access/PasswordField';
export default function ResetPage() {
  const auth = useAuth();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || !auth.recovery || busy) return;
    const password = String(new FormData(event.currentTarget).get('password'));
    setBusy(true); setError('');
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      const ended = await auth.logout();
      if (!ended) { setError('Senha atualizada. Não foi possível encerrar a sessão; saia da conta antes de entrar novamente.'); return; }
      auth.endRecovery();
      navigate(params.get('area') === 'team' ? paths.team : paths.client, { replace: true, state: { passwordUpdated: true } });
    } catch (cause) { setError(authError(cause)); }
    finally { setBusy(false); }
  }
  return <AccessShell title="Defina sua nova senha" description="Escolha uma senha que você ainda não usou.">{auth.recovery ? <>{error && <p className="form-feedback error" role="alert">{error}</p>}<form onSubmit={submit}><fieldset disabled={busy}><label htmlFor="password">Nova senha</label><PasswordField fresh /><button className="primary-button" disabled={busy}><KeyRound size={18} aria-hidden="true" />Salvar nova senha</button></fieldset></form></> : <><p className="form-feedback error" role="alert">Link inválido ou expirado. Solicite um novo link para redefinir sua senha.</p><Link className="primary-button" to={paths.recovery}><Mail size={18} aria-hidden="true" />Solicitar novo link</Link></>}</AccessShell>;
}
