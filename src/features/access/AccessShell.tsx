import type { ReactNode } from 'react';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { normalizePathname, paths } from '../../app/routes';
import { Brand } from '../../ui/Brand';
import { useAuth } from '../auth/AuthProvider';
import { recoveryReturn } from '../auth/recoveryReturn';
import { useAccountHome } from '../auth/useAccountHome';
import { AccessPrivacyNotice } from '../privacy/PrivacyLinks';

export function AccessShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  const accountHome = useAccountHome();
  const auth = useAuth();
  const location = useLocation();
  const path = normalizePathname(location.pathname);
  const login = path === paths.team || path === paths.client;
  const recovery = [paths.recovery, paths.reset].includes(
    location.pathname as typeof paths.recovery,
  );
  const back = recovery
    ? recoveryReturn(
        auth.status,
        auth.contexts.map(c => c.role_code),
        new URLSearchParams(location.search).get('area') === 'client' ? 'client' : 'team',
      )
    : (accountHome ?? paths.home);

  return (
    <div className="access-layout">
      <aside className="access-visual" aria-label="Escritório JN">
        <Brand light emblem="scale" />
        <div className="access-visual-copy">
          <p className="eyebrow">Escritório JN</p>
          <h2>
            Seu processo
            <br />
            em boas mãos.
          </h2>
          <p>
            Organização, cuidado e confiança
            <br />
            em cada etapa do seu caminho.
          </p>
          <span className="gold-rule" aria-hidden="true" />
        </div>
        <p className="visual-caption">Cuidado nos detalhes. Confiança nos processos.</p>
      </aside>

      <div className="access-pane">
        <header className="access-topbar">
          <Link
            className="back-link"
            to={back}
            aria-label={recovery ? 'Voltar' : 'Voltar ao início'}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="back-label">{recovery ? 'Voltar' : 'Voltar ao início'}</span>
          </Link>
          <div className="mobile-brand">
            <Brand light emblem="scale" />
          </div>
        </header>

        <main id="conteudo" className="access-main">
          <section className="access-content" aria-labelledby="access-title">
            <div className="access-card-head">
              <span className="access-symbol" aria-hidden="true">
                <ShieldCheck size={20} strokeWidth={1.9} />
              </span>
              <div className="access-card-head-copy">
                <p className="eyebrow">Acesso individual</p>
                <h1 id="access-title">{title}</h1>
                {description && <p className="access-description">{description}</p>}
              </div>
            </div>
            {children}
            <p className="access-security">
              <LockKeyhole size={14} aria-hidden="true" />
              <span>Acesso individual e protegido.</span>
            </p>
          </section>
        </main>

        {login && !auth.sessionKey && <AccessPrivacyNotice variant="navy" />}
      </div>
    </div>
  );
}
