import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ArrowRight, Info, LockKeyhole, UserPlus, UserRound } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { loadOperations } from '../../app/loadOperations';
import { paths } from '../../app/routes';
import { SiteHeader } from '../../app/SiteLayout';
import { PasswordField } from '../access/PasswordField';
import {
  normalizeLoginEmail,
  resolveInitialLoginNotice,
  validateLoginCredentials,
  type LoginFeedback,
} from '../access/loginFormModel';
import { authError, supabase } from '../auth/browser';
import { PortalAccessError, portalLogin } from '../auth/portalLogin';
import { useAccountHome } from '../auth/useAccountHome';
import { AccessPrivacyNotice } from '../privacy/PrivacyLinks';

export default function HomePage() {
  const accountHome = useAccountHome();
  const location = useLocation();
  const navigate = useNavigate();
  const loginAttempt = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<LoginFeedback | null>(null);

  useEffect(() => {
    void loadOperations().catch(() => {});
  }, []);

  useEffect(() => () => loginAttempt.current?.abort(), []);

  if (accountHome) return <Navigate replace to={accountHome} />;

  const notice = resolveInitialLoginNotice(location.state, feedback);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || busy) return;
    const values = new FormData(event.currentTarget);
    const email = normalizeLoginEmail(values.get('email'));
    const password = String(values.get('password') ?? '');
    const validationError = validateLoginCredentials(email, password);
    if (validationError) {
      setFeedback({ text: validationError, error: true });
      return;
    }

    setBusy(true);
    setFeedback(null);
    const controller = new AbortController();
    loginAttempt.current = controller;
    try {
      const destination = await portalLogin(email, password, false, null, controller.signal);
      if (!controller.signal.aborted) navigate(destination, { replace: true });
    } catch (error) {
      if (!controller.signal.aborted) {
        setFeedback({
          text: error instanceof PortalAccessError ? error.message : authError(error),
          error: true,
        });
      }
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="public-site login-landing">
      <SiteHeader />

      <main id="conteudo" className="login-landing-main">
        <div className="login-landing-grid">
          <section className="login-hero-banner" aria-labelledby="welcome-title">
            <img
              src="/images/recepcao-jn.webp"
              alt=""
              aria-hidden="true"
              className="login-hero-img"
            />
            <div className="login-hero-scrim" aria-hidden="true" />
            <div className="welcome-copy">
              <p className="eyebrow">Gestão que cuida de você</p>
              <h1 id="welcome-title">Bem-vindo ao Escritório JN</h1>
              <span className="gold-rule" aria-hidden="true" />
              <p>Agilidade, segurança e praticidade em todos os seus processos.</p>
            </div>
          </section>

          <section className="login-card-region" aria-labelledby="client-title">
            <article className="client-card">
              <header className="client-card-head">
                <span className="round-icon" aria-hidden="true">
                  <UserRound size={25} strokeWidth={1.7} />
                </span>
                <h2 id="client-title">Área do Cliente</h2>
                <p>Acesse seu espaço no Escritório JN.</p>
              </header>

              {!supabase && (
                <div className="preparation-note" role="status">
                  <div className="preparation-note-head">
                    <Info size={15} aria-hidden="true" />
                    <strong>Acesso indisponível</strong>
                  </div>
                  <p>Configuração pendente pelo escritório.</p>
                </div>
              )}

              {notice && (
                <p
                  className={`form-feedback ${notice.error ? 'error' : ''}`}
                  role={notice.error ? 'alert' : 'status'}
                >
                  {notice.text}
                </p>
              )}

              <form onSubmit={handleSubmit} className="login-card-form" aria-busy={busy}>
                <fieldset disabled={busy}>
                  <div className="login-field">
                    <label htmlFor="email">E-mail</label>
                    <div className="input-wrap input-wrap-clean">
                      <input
                        id="email"
                        name="email"
                        type="email"
                        autoComplete="email"
                        maxLength={254}
                        required
                        placeholder="nome@exemplo.com"
                      />
                    </div>
                  </div>

                  <div className="login-field">
                    <label htmlFor="password">Senha</label>
                    <PasswordField clean />
                  </div>

                  <button className="primary-button" type="submit" disabled={!supabase || busy}>
                    <span>Entrar</span>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                </fieldset>
              </form>

              <div className="client-card-footer">
                <Link className="recovery-link" to={`${paths.recovery}?area=client`}>
                  Esqueci minha senha
                </Link>
                <Link className="signup-inline-link" to={paths.signup}>
                  <UserPlus size={15} aria-hidden="true" />
                  <span>Ainda não tem conta? Cadastre-se</span>
                </Link>
                <span className="access-footnote">
                  <LockKeyhole size={14} aria-hidden="true" />
                  <span>Acesso individual e protegido</span>
                </span>
              </div>
            </article>
          </section>
        </div>
      </main>

      <AccessPrivacyNotice variant="navy" />
    </div>
  );
}
