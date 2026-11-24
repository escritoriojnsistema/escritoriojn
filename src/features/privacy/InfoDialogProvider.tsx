import {useEffect,useRef,useState,type ReactNode} from 'react';
import {useLocation} from 'react-router-dom';
import PrivacyPage from './PrivacyPage';
import {InfoContext,infoTitles,type InfoSection} from './InfoTrigger';
import {CopyrightPage} from './CopyrightPage';
import {AppInfo} from '../pwa/AppInfo';
import InstallPage from '../pwa/InstallPage';

export function InfoDialogProvider({children}:{children:ReactNode}){
 const [info,setInfo]=useState<{section:InfoSection;locationKey:string}>();
 const {key}=useLocation();
 const section=info?.locationKey===key?info.section:undefined;
 const dialog=useRef<HTMLDialogElement>(null);
 useEffect(()=>{
  const element=dialog.current;
  if(!element)return;
  if(section&&!element.open)element.showModal();
  else if(!section&&element.open)element.close();
 },[section]);
 return <InfoContext.Provider value={next=>setInfo({section:next,locationKey:key})}>
  {children}
  <dialog ref={dialog} className="quick-info-dialog" aria-label={section?infoTitles[section]:undefined} onClose={()=>setInfo(undefined)}>
   {section&&<>
    <div className="quick-info-actions"><button type="button" className="team-text-button" autoFocus onClick={()=>dialog.current?.close()}>Fechar</button></div>
    {section==='install'?<InstallPage embedded/>:section==='copyright'?<CopyrightPage/>:section==='app'?<AppInfo/>:<PrivacyPage section={section} embedded/>}
   </>}
  </dialog>
 </InfoContext.Provider>;
}
