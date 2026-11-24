import {useEffect,useSyncExternalStore} from 'react';
import {appVersion} from './version';

interface InstallPrompt extends Event {
 prompt():Promise<void>;
 userChoice:Promise<{outcome:'accepted'|'dismissed'}>;
}
type InstallRecord={installedAt?:string;firstOpenedAt?:string;version?:string};
const storageKey='jn-app-installation-v1';
const listeners=new Set<()=>void>();
let pendingPrompt:InstallPrompt|null=null;
let detected=false;
let checked=false;

function readRecord():InstallRecord|undefined {
 try{
  const value:unknown=JSON.parse(window.localStorage.getItem(storageKey)??'null');
  if(!value||typeof value!=='object')return;
  const record=value as InstallRecord;
  const date=(v:unknown)=>typeof v==='string'&&Number.isFinite(Date.parse(v))?v:undefined;
  return {installedAt:date(record.installedAt),firstOpenedAt:date(record.firstOpenedAt),
   version:typeof record.version==='string'&&/^[\w.-]{1,48}$/.test(record.version)?record.version:undefined};
 }catch{return;}
}
const standaloneMedia=typeof window==='undefined'?undefined:window.matchMedia('(display-mode: standalone)');
const isStandalone=()=>Boolean(standaloneMedia?.matches||(navigator as Navigator&{standalone?:boolean}).standalone);
let record=typeof window==='undefined'?undefined:readRecord();
let snapshot={installed:false,available:false,record,standalone:false};
function publish(){
 const standalone=isStandalone();
 snapshot={installed:standalone||detected||!!record?.installedAt,available:!!pendingPrompt,record,standalone};
 for(const listener of listeners)listener();
}
function store(value?:InstallRecord){
 record=value;
 try{if(value)window.localStorage.setItem(storageKey,JSON.stringify(value));else window.localStorage.removeItem(storageKey);}catch{}
 publish();
}
function observeStandalone(){
 if(isStandalone()){
  if(!record?.firstOpenedAt||record.version!==appVersion){
   store({...record,firstOpenedAt:record?.firstOpenedAt??new Date().toISOString(),version:appVersion});
  }else publish();
 }else publish();
}
function subscribe(listener:()=>void){listeners.add(listener);return()=>{listeners.delete(listener);};}
if(typeof window!=='undefined'){
 window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault();pendingPrompt=event as InstallPrompt;
  detected=false;store(undefined);
 });
 window.addEventListener('appinstalled',()=>{
  detected=true;pendingPrompt=null;store({...record,installedAt:new Date().toISOString(),version:appVersion});
 });
 window.addEventListener('storage',event=>{
  if(event.key===storageKey||event.key===null){record=readRecord();observeStandalone();}
 });
 standaloneMedia?.addEventListener('change',observeStandalone);
 observeStandalone();
}

export function useInstallPrompt(){
 const current=useSyncExternalStore(subscribe,()=>snapshot);
 useEffect(()=>{
  if(checked)return;
  checked=true;
  const platform=navigator as Navigator&{getInstalledRelatedApps?:()=>Promise<{platform:string}[]>};
  void platform.getInstalledRelatedApps?.().then(apps=>{
   if(!pendingPrompt&&apps.some(app=>app.platform==='webapp')){detected=true;publish();}
  }).catch(()=>{});
 },[]);
 return {...current,async install(){
  const prompt=pendingPrompt;
  if(!prompt||current.installed)return;
  pendingPrompt=null;publish();
  await prompt.prompt();await prompt.userChoice;
 }};
}
