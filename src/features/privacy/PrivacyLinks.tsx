import {Link} from 'react-router-dom';
import './privacy.css';
export function PrivacyLinks(){return <nav className="privacy-links" aria-label="Privacidade e uso"><Link to="/privacidade">Privacidade</Link><Link to="/termos">Termos de uso</Link><Link to="/cookies">Cookies e preferências</Link></nav>;}
export function AccessPrivacyNotice(){return <div className="access-privacy"><p>Usamos armazenamento necessário para autenticação e segurança. Sem cookies opcionais, publicidade ou rastreamento de audiência.</p><PrivacyLinks/></div>;}
