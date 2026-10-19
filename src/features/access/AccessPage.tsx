import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, UserPlus, ArrowRight, Mail, UserRound } from 'lucide-react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { paths, normalizePathname } from '../../app/routes';
import { supabase, callbackUrl, authError } from '../auth/browser';
import { AccessShell } from './AccessShell';
import { PasswordField } from './PasswordField';
import { portalLogin, PortalAccessError } from '../auth/portalLogin';
export default function AccessPage() {
  const location = useLocation();
  const pathname = normalizePathname(location.pathname);
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const signup = pathname === paths.signup;
  const recovery = pathname === paths.recovery;
  const team = pathname === paths.team || (recovery && params.get('area') !== 'client');
  const loginAttempt = useRef<AbortController | null>(null);
  useEffect(() => () => loginAttempt.current?.abort(), []);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; error: boolean } | null>(null);
  const title = signup ? 'Crie sua conta' : recovery ? 'Esqueceu sua senha?' : team ? 'Área da Equipe' : 'Área do Cliente';
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!supabase || busy) return;
    const values = new FormData(event.currentTarget);
    const email = String(values.get('email')).trim();
    const password = String(values.get('password') ?? '');
    setBusy(true); setFeedback(null);
    try {
      if (recovery) {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: callbackUrl(team ? 'team' : 'client') });
        if (error) throw error;
        setFeedback({ text: 'Se houver uma conta para este e-mail, você receberá as instruções. Abra o link neste mesmo navegador.', error: false });
      } else if (signup) {
        const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl(), data: { display_name: String(values.get('name')).trim() } } });
        if (error) throw error;
        setFeedback({ text: 'Confira seu e-mail para confirmar o cadastro. Abra o link neste mesmo navegador. Se já tem conta, entre ou recupere sua senha.', error: false });
      } else {
        const controller = new AbortController();
        loginAttempt.current = controller;
        const destination = await portalLogin(email, password, team, params.get('invite'), controller.signal);
        if (!controller.signal.aborted) navigate(destination, { replace: true });
      }
    } catch (error) { if (!loginAttempt.current?.signal.aborted) setFeedback({ text: error instanceof PortalAccessError ? error.message : authError(error), error: true }); }
    finally { setBusy(false); }
  }
  return <AccessShell title={title} description={signup ? 'Cadastre seu acesso de cliente.' : recovery ? 'Recupere o acesso à sua conta.' : 'Acesse seu ambiente no Escritório JN.'}>
    {!supabase && <div className="preparation-note" role="status"><strong>Acesso indisponível</strong><p>Configuração pendente pelo escritório.</p></div>}
    {location.state?.sessionExpired && !feedback && <p className="form-feedback error" role="alert">Sua sessão expirou. Entre novamente para continuar.</p>}
    {location.state?.passwordUpdated && !feedback && <p className="form-feedback" role="status">Senha atualizada. Entre com sua nova senha.</p>}
    {feedback && <p className={`form-feedback ${feedback.error ? 'error' : ''}`} role={feedback.error ? 'alert' : 'status'}>{feedback.text}</p>}
    <form onSubmit={submit} aria-busy={busy}><fieldset disabled={busy}>
      {signup && <div className="form-field"><label htmlFor="name">Nome</label><div className="input-wrap"><UserRound size={18} aria-hidden="true" /><input id="name" name="name" autoComplete="name" required minLength={2} maxLength={100} placeholder="Como podemos chamar você?" /></div></div>}
      <label htmlFor="email">E-mail</label><div className="input-wrap"><Mail size={18} aria-hidden="true" /><input id="email" name="email" type="email" autoComplete="email" maxLength={254} required placeholder="seuemail@exemplo.com" /></div>
      {!recovery && <><div className="password-label"><label htmlFor="password">Senha</label>{!signup && <Link to={`${paths.recovery}?area=${team ? 'team' : 'client'}`}>Esqueci minha senha</Link>}</div><PasswordField fresh={signup} /></>}
      <button className="primary-button" type="submit" disabled={!supabase || busy}>{signup ? 'Criar conta de cliente' : recovery ? 'Enviar instruções' : `Entrar na área ${team ? 'da equipe' : 'do cliente'}`}<ArrowRight size={18} aria-hidden="true" /></button>
    </fieldset></form>
    {recovery || signup ? <Link className="return-login" to={signup || !team ? paths.client : paths.team}><ArrowLeft size={17} aria-hidden="true" />Voltar para entrar</Link> : team ? <p className="access-help">O acesso da equipe é gerenciado pelo escritório.</p> : <Link className="return-login" to={paths.signup}><UserPlus size={17} aria-hidden="true" />Ainda não tem conta? Cadastre-se</Link>}
  </AccessShell>;
}
