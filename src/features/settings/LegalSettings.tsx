import {useState} from 'react';
import {Building2, Cookie, FileText, ShieldCheck} from 'lucide-react';
import {CopyrightPage} from '../privacy/CopyrightPage';
import {InfoTrigger} from '../privacy/InfoTrigger';
import {PrivacySettings} from './PrivacySettings';

export function LegalSettings({office,canEditCopyright,canEditController,busy,onPendingChange}:{
 office:string;canEditCopyright:boolean;canEditController:boolean;busy:boolean;onPendingChange:(pending:boolean)=>void;
}){
 const [copyright,setCopyright]=useState(false);
 return <>
  <div className="settings-destinations legal-destinations" aria-label="Leis e privacidade">
   <InfoTrigger section="privacy" disabled={busy}><ShieldCheck size={22} aria-hidden="true"/><strong>Privacidade</strong></InfoTrigger>
   <InfoTrigger section="terms" disabled={busy}><FileText size={22} aria-hidden="true"/><strong>Termos de uso</strong></InfoTrigger>
   <InfoTrigger section="cookies" disabled={busy}><Cookie size={22} aria-hidden="true"/><strong>Cookies e preferências</strong></InfoTrigger>
   <button type="button" aria-expanded={copyright} aria-controls="office-copyright" disabled={busy} onClick={()=>setCopyright(value=>!value)}>
    <Building2 size={22} aria-hidden="true"/><strong>Escritório JN</strong>
   </button>
  </div>
  <div id="office-copyright">{copyright&&<CopyrightPage office={office} editable={canEditCopyright} onPendingChange={onPendingChange}/>}</div>
  {canEditController&&<details className="privacy-controller-editor">
   <summary>Configurar responsável pelo tratamento</summary>
   <PrivacySettings office={office} onPendingChange={onPendingChange}/>
  </details>}
 </>;
}
