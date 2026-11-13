import {PrivacyFooter} from '../features/privacy/PrivacyLinks';
import { UsersRound } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Brand } from '../ui/Brand';
import { paths } from './routes';
export function SiteHeader() {
  return <header className="site-header"><Brand /><div className="header-access"><span>Seu processo em boas mãos.</span>
    <nav aria-label="Acesso"><Link to={paths.team} className="team-link" aria-label="Portal da Equipe" title="Portal da Equipe"><UsersRound size={22} strokeWidth={1.7} aria-hidden="true" /><span>Portal da Equipe</span></Link></nav>
  </div></header>;
}
export function SiteFooter() {
  return <PrivacyFooter className="site-footer"/>;
}
