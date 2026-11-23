import {useEffect,useState} from 'react';

interface InstallPrompt extends Event {
  prompt():Promise<void>;
  userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
let installedSignal=false;
let pendingPrompt:InstallPrompt|null=null;
const listeners=new Set<()=>void>();
function publish(){for(const listener of listeners)listener();}
if(typeof window!=='undefined'){
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();pendingPrompt=event as InstallPrompt;publish();
 });
 window.addEventListener('appinstalled',()=>{installedSignal=true;pendingPrompt=null;publish();});
}

export function useInstallPrompt(){
 const [,setRevision]=useState(0);
 useEffect(()=>{
  const update=()=>setRevision(value=>value+1);
  listeners.add(update);update();
  return ()=>{listeners.delete(update);};
 },[]);
 const installed=installedSignal||window.matchMedia('(display-mode: standalone)').matches||
  (navigator as Navigator&{standalone?:boolean}).standalone===true;
 return {installed,available:pendingPrompt!==null,async install(){
  const prompt=pendingPrompt;
  if(!prompt)return;
  pendingPrompt=null;publish();
  await prompt.prompt();await prompt.userChoice;
 }};
}
