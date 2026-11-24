import {InfoTrigger} from './InfoTrigger';
import {useInstallPrompt} from '../pwa/useInstallPrompt';
import './privacy.css';

export function AccessPrivacyNotice(){
 const {installed}=useInstallPrompt();
 return <footer className="privacy-footer access-privacy" aria-label="Privacidade e uso">
  <div className="privacy-footer-row">
   <InfoTrigger className="privacy-footer-name" section="copyright"/>
   <nav className="privacy-links" aria-label="Privacidade e uso">
    <InfoTrigger section="privacy"/><InfoTrigger section="terms"/><InfoTrigger section="cookies"/>
   </nav>
   {!installed&&<InfoTrigger className="privacy-install" section="install"/>}
  </div>
 </footer>;
}
