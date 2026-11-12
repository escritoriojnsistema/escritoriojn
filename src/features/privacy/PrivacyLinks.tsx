import {Link} from 'react-router-dom';
import './privacy.css';
export function PrivacyLinks({newTab=false}:{newTab?:boolean}){const props=newTab?{target:'_blank',rel:'noreferrer'}:{};return <nav className="privacy-links" aria-label="Privacidade e uso"><Link to="/privacidade" {...props}>Privacidade</Link><Link to="/termos" {...props}>Termos de uso</Link><Link to="/cookies" {...props}>Cookies e preferências</Link></nav>;}
export function PrivacyFooter({access=false,className=''}:{access?:boolean;className?:string}){return <footer className={`privacy-footer ${className}`} aria-label="Privacidade e uso">{access&&<p>Usamos armazenamento necessário para autenticação e segurança. Sem cookies opcionais, publicidade ou rastreamento de audiência.</p>}<PrivacyLinks newTab/></footer>;}
export function AccessPrivacyNotice(){return <PrivacyFooter access className="access-privacy"/>;}
