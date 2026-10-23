import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {X,RefreshCw} from 'lucide-react';
import type {AccessContext} from '../../../shared/access';
import type {AccountNotices} from '../../../shared/notifications';
import {paths} from '../../app/routes';
import {notificationsApi,NotificationsError,noticesChanged} from './api';
import {noticeText,isFinancialNotice} from './presentation';
import {useNotificationRead} from './NotificationReadProvider';
export function NotificationDrawer({client,contexts,initialOffice,onClose}:{client:boolean;contexts:AccessContext[];initialOffice?:string;onClose:()=>void}){
 const dialog=useRef<HTMLDialogElement>(null),location=useLocation(),initialLocation=useRef(location.key),markOnOpen=useNotificationRead();
 const [office,setOffice]=useState(()=>contexts.find(c=>c.office_id===initialOffice)?.office_id??contexts[0]?.office_id??''),[data,setData]=useState<AccountNotices>(),[error,setError]=useState<NotificationsError>(),[revision,setRevision]=useState(0),[pending,setPending]=useState(false),[saving,setSaving]=useState(false);
 const mutation=useRef<AbortController|null>(null),blocked=error?.status===401||error?.status===403;
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>{mutation.current?.abort();element?.close();};},[]);
 useEffect(()=>{if(location.key!==initialLocation.current)onClose();},[location.key,onClose]);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);window.addEventListener('jn:inbox-update',refresh);return()=>window.removeEventListener('jn:inbox-update',refresh);},[]);
 useEffect(()=>{
  if(!office||blocked)return;const controller=new AbortController();setPending(true);
  void notificationsApi.search(office,'','all','all',1,5,controller.signal).then(v=>{if(!controller.signal.aborted){setData(v);setError(undefined);}}).catch(cause=>{if(!controller.signal.aborted){const e=cause instanceof NotificationsError?cause:new NotificationsError(503);setError(e);if([401,403].includes(e.status))setData(undefined);}}).finally(()=>{if(!controller.signal.aborted)setPending(false);});return()=>controller.abort();
 },[office,revision,blocked]);
 async function read(id:string){if(mutation.current||blocked)return;const c=new AbortController();mutation.current=c;setSaving(true);try{await notificationsApi.read(office,id,c.signal);if(!c.signal.aborted){setData(old=>old?{...old,unread:Math.max(0,old.unread-1),items:old.items.map(n=>n.id===id?{...n,read_at:new Date().toISOString()}:n)}:old);noticesChanged();setRevision(n=>n+1);}}catch(cause){if(!c.signal.aborted){const e=cause instanceof NotificationsError?cause:new NotificationsError(503);setError(e);if([401,403].includes(e.status))setData(undefined);}}finally{if(!c.signal.aborted)setSaving(false);if(mutation.current===c)mutation.current=null;}}
 function close(){dialog.current?.close();onClose();}
 return <dialog ref={dialog} className="notification-drawer" aria-labelledby="notification-drawer-title" onKeyDown={e=>{if(e.key!=='Tab')return;const items=[...e.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],select:not([disabled]),input:not([disabled]),textarea:not([disabled]),[tabindex="0"]')].filter(item=>item.getClientRects().length>0);const first=items[0],last=items.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}} onCancel={e=>{e.preventDefault();close();}} onClose={onClose} onClick={e=>{if(e.target===e.currentTarget){const b=e.currentTarget.getBoundingClientRect();if(e.clientX<b.left||e.clientX>b.right||e.clientY<b.top||e.clientY>b.bottom)close();}}}>
  <div className="notification-drawer-heading"><div><h2 id="notification-drawer-title">Notificações</h2>{data&&<p className="customer-note">{data.unread} não lidas</p>}</div><button type="button" className="operation-icon-button" aria-label="Fechar notificações" onClick={close}><X aria-hidden="true" size={22}/></button></div>
  {contexts.length>1&&<label className="team-field">Escritório<select value={office} disabled={saving} onChange={e=>{setData(undefined);setError(undefined);setOffice(e.target.value);}}>{contexts.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
  <div className="notification-drawer-body" aria-busy={pending}>
   {error&&<p role="alert" className="form-feedback error">{error.message}</p>}
   {!blocked&&!data&&pending&&<p className="customer-note" role="status">Consultando seus avisos.</p>}
   {!blocked&&data&&!data.items.length&&<p className="team-empty">Você não tem notificações neste escritório.</p>}
   {!blocked&&data&&<ul className="notification-drawer-list">{data.items.map(n=><li key={n.id} className={n.read_at?'':'notice-unread'}><strong>{noticeText(n)}</strong><small>{new Date(n.created_at).toLocaleString('pt-BR')} · {n.read_at?'Lida':'Não lida'}</small><div className="notification-drawer-actions">{n.can_open&&<Link className="team-text-button" to={isFinancialNotice(n.kind)?paths.clientPayments:client?paths.clientRequests:paths.requests} state={{office_id:office,request_id:n.request_id}} onClick={()=>{if(!n.read_at)markOnOpen(office,n.id);close();}}>Abrir {n.protocol}</Link>}{!n.read_at&&<button type="button" className="team-text-button" disabled={saving} onClick={()=>void read(n.id)}>Marcar como lida</button>}</div></li>)}</ul>}
  </div><div className="notification-drawer-footer">{!blocked&&<Link className="primary-button" to={client?paths.clientNotifications:paths.notifications} state={{office_id:office}} onClick={close}>Ver mais</Link>}<button type="button" className="operation-icon-button" aria-label="Atualizar notificações" disabled={pending||saving||blocked} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={19} aria-hidden="true"/></button></div>
 </dialog>;
}
