import {InfoTrigger} from './InfoTrigger';
import './privacy.css';

export function PrivacyLinks(){return <nav className="privacy-links" aria-label="Privacidade e uso"><InfoTrigger section="privacy"/><InfoTrigger section="terms"/><InfoTrigger section="cookies"/></nav>;}
export function PrivacyFooter({access=false,className=''}:{access?:boolean;className?:string}){return <footer className={`privacy-footer ${className}`} aria-label="Privacidade e uso">{access&&<p>Usamos armazenamento necessário para autenticação e segurança. Sem cookies opcionais, publicidade ou rastreamento de audiência.</p>}<div className="privacy-footer-row"><span className="privacy-footer-name">Escritório JN</span><PrivacyLinks/>{!className.includes('operation-footer')&&<InfoTrigger className="privacy-install" section="install"/>}</div></footer>;}
export function AccessPrivacyNotice(){return <PrivacyFooter access className="access-privacy"/>;}
