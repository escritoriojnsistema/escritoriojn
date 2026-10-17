import { ArrowLeft, ArrowRight, Eye, LockKeyhole, Mail, ShieldCheck, UserRound, UsersRound } from 'lucide-react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { paths, normalizePathname } from '../../app/routes';
import { Brand } from '../../ui/Brand';
export default function AccessPage() {
  const pathname = normalizePathname(useLocation().pathname);
  const [params] = useSearchParams();
  const recovery = pathname === paths.recovery;
  const team = pathname === paths.team || (recovery && params.get('area') !== 'client');
  const title = recovery ? 'Esqueceu sua senha?' : team ? 'Área da Equipe' : 'Área do Cliente';
  const returnPath = team ? paths.team : paths.client;
  const Icon = team ? UsersRound : UserRound;
  return <div className="access-layout">
    <aside className="access-visual" aria-label="Escritório JN"><Brand light /><div className="access-visual-copy"><p className="eyebrow">Escritório JN</p><h2>Seu processo<br />em boas mãos.</h2><p>Organização, cuidado e confiança<br />em cada etapa do seu caminho.</p><span className="gold-rule" /></div><p className="visual-caption">Cuidado nos detalhes. Confiança nos processos.</p></aside>
    <main id="conteudo" className="access-main"><div className="access-topbar"><Link className="back-link" to={paths.home} aria-label="Voltar ao início" title="Voltar ao início"><ArrowLeft size={16} aria-hidden="true" /><span className="back-label">Voltar ao início</span></Link><div className="mobile-brand"><Brand /></div></div>
      <section className="access-content" aria-labelledby="access-title"><span className="access-symbol"><Icon size={26} strokeWidth={1.7} aria-hidden="true" /></span>
        <p className="eyebrow">{recovery ? 'Recuperação de acesso' : 'Acesso individual'}</p><h1 id="access-title">{title}</h1>
        <p className="access-description">{recovery ? 'Recupere o acesso à sua conta.' : team ? 'Acesse seu ambiente no Escritório JN.' : 'Acesse seu espaço no Escritório JN.'}</p>
        <div className="preparation-note" id="access-note"><strong>Acesso em preparação</strong><p>Campos e envio desativados nesta versão.</p></div>
        <form aria-describedby="access-note" onSubmit={event => event.preventDefault()}><fieldset disabled>
          <label htmlFor="email">E-mail</label><div className="input-wrap"><Mail size={18} aria-hidden="true" /><input id="email" name="email" type="email" autoComplete="off" placeholder="seuemail@exemplo.com" /></div>
          {!recovery && <><div className="password-label"><label htmlFor="password">Senha</label><Link to={`${paths.recovery}?area=${team ? 'team' : 'client'}`}>Esqueci minha senha</Link></div><div className="input-wrap"><LockKeyhole size={18} aria-hidden="true" /><input id="password" name="password" type="password" autoComplete="off" placeholder="Digite sua senha" /><Eye size={18} aria-hidden="true" /></div></>}
          <button className="primary-button" type="submit">{recovery ? 'Enviar instruções' : `Entrar na área ${team ? 'da equipe' : 'do cliente'}`}<ArrowRight size={18} aria-hidden="true" /></button>
        </fieldset></form>
        {recovery && <Link className="return-login" to={returnPath}>Voltar para entrar</Link>}
        {!recovery && team && <p className="access-help">O acesso da equipe é gerenciado pelo escritório.</p>}
      </section><p className="access-security"><ShieldCheck size={16} aria-hidden="true" />Acesso individual e protegido.</p>
    </main>
  </div>;
}
