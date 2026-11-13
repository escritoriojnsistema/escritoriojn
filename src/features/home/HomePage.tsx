import { ArrowRight, LockKeyhole, UserRound } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAccountHome } from '../auth/useAccountHome';
import { paths } from '../../app/routes';
import { SiteFooter, SiteHeader } from '../../app/SiteLayout';
export default function HomePage() {
  const accountHome = useAccountHome();
  if (accountHome) return <Navigate replace to={accountHome} />;
  return <div className="public-site"><SiteHeader /><main id="conteudo" className="landing-main">
    <section className="landing-hero" aria-labelledby="welcome-title">
      <div className="landing-content">
        <div className="welcome-copy"><p className="eyebrow">Gestão que cuida de você</p>
          <h1 id="welcome-title">Bem-vindo ao<br /><strong>Escritório JN</strong></h1><span className="gold-rule" aria-hidden="true" />
          <p>Agilidade, segurança e praticidade<br />em todos os seus processos.</p>
        </div>
        <section className="client-card" aria-labelledby="client-title"><span className="round-icon" aria-hidden="true"><UserRound size={27} strokeWidth={1.6} /></span>
          <h2 id="client-title">Área do Cliente</h2><p>Acesse seu espaço no Escritório JN.</p>
          <Link className="primary-button" to={paths.client}>Entrar <ArrowRight size={19} aria-hidden="true" /></Link>
          <Link className="recovery-link" to={`${paths.recovery}?area=client`}>Esqueci minha senha</Link>
          <span className="access-footnote"><LockKeyhole size={14} aria-hidden="true" /> Acesso individual e protegido</span>
        </section>
      </div>
    </section>
  </main><SiteFooter /></div>;
}
