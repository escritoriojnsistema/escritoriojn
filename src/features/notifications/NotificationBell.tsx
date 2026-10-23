import {useEffect,useState,useRef} from 'react';
import {NotificationDrawer} from './NotificationDrawer';
import './notifications.css';
import {Bell} from 'lucide-react';
import {useAuth} from '../auth/AuthProvider';
import {notificationsApi,NotificationsError} from './api';

// One short-lived cache for the current authority only; never persisted to disk.
let cached:{key:string;at:number;counts:Record<string,number>}|undefined;
export function NotificationBell({client}:{client:boolean}){
 const [open,setOpen]=useState(false),button=useRef<HTMLButtonElement>(null);
 const auth=useAuth(),contexts=auth.contexts.filter(c=>client?c.role_code==='client':c.role_code!=='client');
 const key=JSON.stringify([auth.sessionKey,contexts.map(c=>[c.office_id,c.user_id,c.role_code,[...c.permissions].sort()])]);
 const [snapshot,setSnapshot]=useState<{key:string;counts:Record<string,number>}>();
 useEffect(()=>{
  const controller=new AbortController();let inFlight=false,again=false,refreshGeneration=0;
  if(cached?.key!==key)cached=undefined;
  if(cached)setSnapshot(cached);
  async function refresh(force=false){
   if(force){refreshGeneration++;if(inFlight){again=true;return;}}
   if(inFlight||controller.signal.aborted||document.visibilityState==='hidden')return;
   if(!force&&cached?.key===key&&Date.now()-cached.at<5000)return;
   inFlight=true;const started=refreshGeneration;
   try{const results=await Promise.all(contexts.map(async c=>[c.office_id,(await notificationsApi.summary(c.office_id,controller.signal)).unread] as const));
    if(!controller.signal.aborted&&started===refreshGeneration){const previous=cached?.key===key?cached.counts:undefined;const next=Object.fromEntries(results);const changedCounts=previous&&JSON.stringify(previous)!==JSON.stringify(next);cached={key,at:Date.now(),counts:Object.fromEntries(results)};setSnapshot(cached);if(force||changedCounts)window.dispatchEvent(new Event('jn:inbox-update'));}
   }catch(cause){if(!controller.signal.aborted&&cause instanceof NotificationsError&&[401,403].includes(cause.status)){cached=undefined;setSnapshot(undefined);}else if(!controller.signal.aborted&&cached?.key!==key)setSnapshot(undefined);}
   finally{inFlight=false;if(again&&!controller.signal.aborted){again=false;void refresh(true);}}
  }
  const focus=()=>void refresh(),changed=()=>{cached=undefined;void refresh(true);};
  const timer=window.setInterval(()=>void refresh(),30_000);
  void refresh();window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);window.addEventListener('jn:notices-changed',changed);
  return()=>{clearInterval(timer);controller.abort();window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);window.removeEventListener('jn:notices-changed',changed);};
 // The authority key includes every input; token rotation preserves it.
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[key]);
 const counts=snapshot?.key===key?snapshot.counts:{},total=Object.values(counts).reduce((a,b)=>a+b,0),office=contexts.find(c=>(counts[c.office_id]??0)>0)?.office_id??contexts[0]?.office_id;
 return <><button ref={button} type="button" onClick={()=>setOpen(value=>!value)} aria-haspopup="dialog" aria-expanded={open} className="operation-icon-button operation-bell" aria-label={`Abrir notificações${total?` (${total} não lidas)`:''}`} title="Notificações"><Bell size={23} aria-hidden="true"/>{total>0&&<span className="operation-notice-count" aria-hidden="true">{total>99?'99+':total}</span>}</button>{open&&<NotificationDrawer key={key} client={client} contexts={contexts} initialOffice={office} onClose={()=>{setOpen(false);button.current?.focus();}}/>}</>;
}
