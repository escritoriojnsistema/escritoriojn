import {AccessPrivacyNotice} from '../privacy/PrivacyLinks';
import {useAuth} from '../auth/AuthProvider';
import {useLocation} from 'react-router-dom';
import {recoveryReturn} from '../auth/recoveryReturn';
import type { ReactNode } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { paths } from '../../app/routes';
import { Brand } from '../../ui/Brand';
import { useAccountHome } from '../auth/useAccountHome';
export function AccessShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const accountHome = useAccountHome();
  const auth=useAuth(),location=useLocation();
  const recovery=[paths.recovery,paths.reset].includes(location.pathname as typeof paths.recovery);
  const back=recovery?recoveryReturn(auth.status,auth.contexts.map(c=>c.role_code),new URLSearchParams(location.search).get('area')==='client'?'client':'team'):accountHome??paths.home;
  return <div className="access-layout">
    <aside className="access-visual" aria-label="Escritório JN"><Brand light /><div className="access-visual-copy"><p className="eyebrow">Escritório JN</p><h2>Seu processo<br />em boas mãos.</h2><p>Organização, cuidado e confiança<br />em cada etapa do seu caminho.</p><span className="gold-rule" /></div><p className="visual-caption">Cuidado nos detalhes. Confiança nos processos.</p></aside>
    <div className="access-pane"><main id="conteudo" className="access-main"><div className="access-topbar"><Link className="back-link" to={back} aria-label={recovery?'Voltar':'Voltar ao início'}><ArrowLeft size={16} aria-hidden="true" /><span className="back-label">{recovery?'Voltar':'Voltar ao início'}</span></Link><div className="mobile-brand"><Brand /></div></div>
      <section className="access-content" aria-labelledby="access-title"><span className="access-symbol"><ShieldCheck size={24} aria-hidden="true" /></span><p className="eyebrow">Acesso individual</p><h1 id="access-title">{title}</h1>{description && <p className="access-description">{description}</p>}{children}</section>
      <p className="access-security"><ShieldCheck size={16} aria-hidden="true" />Acesso individual e protegido.</p>
    </main><AccessPrivacyNotice/></div>
  </div>;
}
