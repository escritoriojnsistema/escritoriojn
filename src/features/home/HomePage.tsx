import { ArrowRight, Building2, ClipboardList, HeartHandshake, LockKeyhole, ShieldCheck, UserRound } from 'lucide-react';
import { Link, Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useAccountHome } from '../auth/useAccountHome';
import { paths } from '../../app/routes';
import { SiteFooter, SiteHeader } from '../../app/SiteLayout';
const benefits = [
  { icon: ClipboardList, title: 'Organização', text: 'Cuidado com cada detalhe.' },
  { icon: HeartHandshake, title: 'Atendimento', text: 'Atenção em cada processo.' },
  { icon: Building2, title: 'Praticidade', text: 'Soluções para sua rotina.' },
  { icon: ShieldCheck, title: 'Segurança', text: 'Proteção das informações.' },
];
export default function HomePage() {
  const auth = useAuth();
  const accountHome = useAccountHome();
  if (auth.status === 'loading') return null;
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
    <section className="benefits" aria-label="Nosso compromisso">{benefits.map(({ icon: Icon, title, text }) => <div className="benefit" key={title}><span><Icon size={20} strokeWidth={1.5} aria-hidden="true" /></span><div><h2>{title}</h2><p>{text}</p></div></div>)}</section>
  </main><SiteFooter /></div>;
}
