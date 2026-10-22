import {useNotificationRead} from './NotificationReadProvider';
import {useEffect,useRef,useState} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {Search} from 'lucide-react';
import type {AccessContext} from '../../../shared/access';
import type {AccountNotices,NotificationFilter,NotificationRead} from '../../../shared/notifications';
import {paths} from '../../app/routes';
import {OperationalAccess} from '../operation/OperationalAccess';
import {OperationHeading} from '../operation/OperationLayout';
import {notificationsApi,NotificationsError,noticesChanged} from './api';
import '../team/team.css';
import '../customers/customers.css';
import '../checklists/checklists.css';

export default function NotificationsPage({client=false}:{client?:boolean}){
 return <OperationalAccess client={client}>{contexts=><OfficeInbox contexts={contexts} client={client}/>}</OperationalAccess>;
}
function OfficeInbox({contexts,client}:{contexts:AccessContext[];client:boolean}){
 const location=useLocation(),state=location.state as {office_id?:string}|null;
 const [office,setOffice]=useState(()=>contexts.find(c=>c.office_id===state?.office_id)?.office_id??contexts[0].office_id);
 // A bell click can target the same route. Apply its authorized office on a
 // new navigation; ordinary context/token refresh preserves manual selection.
 useEffect(()=>{if(contexts.some(c=>c.office_id===state?.office_id))setOffice(state!.office_id!);},[location.key,state?.office_id]);
 const context=contexts.find(c=>c.office_id===office)??contexts[0];
 return <div className="notifications-main"><OperationHeading context={context} showRole={false} title="Notificações" description={client?'Acompanhe quem está cuidando do seu atendimento.':'Avisos dos seus atendimentos e pendências.'}/>
  {contexts.length>1&&<label className="team-field team-office">Escritório<select value={office} onChange={e=>setOffice(e.target.value)}>{contexts.map(c=><option value={c.office_id} key={c.office_id}>{c.office_name}</option>)}</select></label>}
  <Inbox key={context.office_id} office={context.office_id} client={client}/>
 </div>;
}
function Inbox({office,client}:{office:string;client:boolean}){
 const markOnOpen=useNotificationRead();
 const [input,setInput]=useState(''),[query,setQuery]=useState(''),[read,setRead]=useState<NotificationRead>('all'),[kind,setKind]=useState<NotificationFilter>('all'),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [data,setData]=useState<AccountNotices>(),[error,setError]=useState<NotificationsError>(),[pending,setPending]=useState(false),[saving,setSaving]=useState(false),[feedback,setFeedback]=useState('');
 const [size,setSize]=useState(()=>matchMedia('(max-width:900px)').matches?3:5),generation=useRef(0),mutation=useRef<AbortController|undefined>(undefined);
 const blocked=error?.status===401||error?.status===403;
 useEffect(()=>()=>mutation.current?.abort(),[]);
 useEffect(()=>{const media=matchMedia('(max-width:900px)'),resize=()=>{setSize(media.matches?3:5);setPage(1);};media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[]);
 useEffect(()=>{const refresh=()=>{if(!saving&&!blocked&&document.visibilityState==='visible')setRevision(n=>n+1);};window.addEventListener('jn:inbox-update',refresh);window.addEventListener('focus',refresh);return()=>{window.removeEventListener('jn:inbox-update',refresh);window.removeEventListener('focus',refresh);};},[saving,blocked]);
 useEffect(()=>{
  if(blocked)return;const controller=new AbortController(),current=++generation.current;setPending(true);
  void notificationsApi.search(office,query,read,kind,page,size,controller.signal).then(v=>{if(!controller.signal.aborted&&current===generation.current){setData(v);setError(undefined);}}).catch(cause=>{if(!controller.signal.aborted&&current===generation.current){const e=cause instanceof NotificationsError?cause:new NotificationsError(503);setError(e);if(e.status===401||e.status===403)setData(undefined);}}).finally(()=>{if(!controller.signal.aborted&&current===generation.current)setPending(false);});
  return()=>controller.abort();
 },[office,query,read,kind,page,size,revision,blocked]);
 async function mark(id:string){
  if(saving||blocked||mutation.current)return;const controller=new AbortController();mutation.current=controller;setSaving(true);setFeedback('');
  try{await notificationsApi.read(office,id,controller.signal);if(controller.signal.aborted)return;generation.current++;setFeedback('Notificação lida.');setRevision(n=>n+1);noticesChanged();}
  catch(cause){if(!controller.signal.aborted){const e=cause instanceof NotificationsError?cause:new NotificationsError(503);setError(e);if(e.status===401||e.status===403)setData(undefined);}}
  finally{if(!controller.signal.aborted)setSaving(false);if(mutation.current===controller)mutation.current=undefined;}
 }
 return <>{feedback&&<p role="status" className="form-feedback">{feedback}</p>}{error&&<p role="alert" className="form-feedback error">{error.message}</p>}
  {!blocked&&<><form className="team-filters operation-filters notification-filters" onSubmit={e=>{e.preventDefault();setQuery(input.trim());setPage(1);setRevision(n=>n+1);}}>
   <label className="team-field">Buscar solicitação<input type="search" value={input} maxLength={120} onChange={e=>setInput(e.target.value)} placeholder={client?'Protocolo ou atendente':'Protocolo'}/></label>
   <label className="team-field">Leitura<select value={read} disabled={saving} onChange={e=>{setRead(e.target.value as NotificationRead);setPage(1);}}><option value="all">Todas</option><option value="unread">Não lidas</option><option value="read">Lidas</option></select></label>
   <label className="team-field">Tipo<select value={kind} disabled={saving} onChange={e=>{setKind(e.target.value as NotificationFilter);setPage(1);}}><option value="all">Todos</option>{client?<><option value="assignee_changed">Atendente</option><option value="account_updated">Dados da conta</option></>:<><option value="handoff">Encaminhamentos</option><option value="pending">Pendências</option><option value="account_correction">Correções cadastrais</option></>}</select></label>
   <button className="secondary-button" disabled={saving}><Search size={18} aria-hidden="true"/>Buscar</button>
  </form>
  {data&&<><p className="customer-note">{data.unread} não lidas</p>{!data.items.length?<p className="team-empty">Nenhuma notificação neste filtro.</p>:<ul className="checklist-notices" aria-label={client?'Notificações do atendimento':'Notificações internas'}>{data.items.map(n=><li key={n.id}>
   <strong>{n.kind==='assignee_changed'?`${n.attendant_name} assumiu seu atendimento.`:n.kind==='account_correction'?'Um cliente solicitou correção dos dados da conta.':n.kind==='account_updated'?'A correção dos dados da sua conta foi analisada. Confira o atendimento.':n.kind==='handoff'?'Um atendimento foi encaminhado para você.':'Há pendências em um atendimento sob sua responsabilidade.'}</strong>
   <small>{new Date(n.created_at).toLocaleString('pt-BR')} · {n.read_at?'Lida':'Não lida'}</small><div>
    {n.can_open&&<Link className="team-text-button" to={client?paths.clientRequests:paths.requests} state={{office_id:office,request_id:n.request_id}} onClick={()=>{if(!n.read_at)markOnOpen(office,n.id);}}>Abrir {n.protocol}</Link>}
    {!n.read_at&&<button className="team-text-button" disabled={saving} onClick={()=>void mark(n.id)}>Marcar como lida</button>}
   </div></li>)}</ul>}
   <nav className="team-pagination" aria-label="Paginação de notificações"><button className="team-text-button" disabled={saving||pending||page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>{data.page}/{Math.max(1,Math.ceil(data.total/data.page_size))}</span><button className="team-text-button" disabled={saving||pending||page*data.page_size>=data.total} onClick={()=>setPage(n=>n+1)}>Próxima</button></nav>
  </>}
  </>}
 </>;
}
