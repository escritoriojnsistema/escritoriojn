import { UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../ui/Brand';
import { paths } from './routes';
export function SiteHeader() {
  return <header className="site-header"><Brand /><div className="header-access"><span>Seu processo em boas mãos.</span>
    <nav aria-label="Acesso"><Link to={paths.team} className="team-link" aria-label="Acesso da equipe" title="Acesso da equipe"><UsersRound size={22} strokeWidth={1.7} aria-hidden="true" /></Link></nav>
  </div></header>;
}
export function SiteFooter() {
  return <footer className="site-footer"><span>Escritório JN</span><span aria-hidden="true">·</span><span>Tecnologia a serviço da sua tranquilidade.</span><Link to={paths.status}>Status do sistema</Link></footer>;
}
