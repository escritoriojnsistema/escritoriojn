import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, LogIn, Plus, RefreshCw, Search } from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import { publicRequestStatusLabels, requestStatuses, requestStatusLabels, type CreateRequestInput, type RequestDetail as Detail, type RequestMutation, type RequestPage, type RequestFilterStatus } from '../../../shared/requests';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import {AccountCorrectionForm} from './AccountCorrectionForm';
import { RequestForm } from './RequestForm';
import { RequestDetail } from './RequestDetail';
import { requestsApi, requestsError, RequestsError } from './api';
import '../team/team.css';
import '../customers/customers.css';
import '../services/services.css';
import './requests.css';
export default function RequestsPage({client=false}:{client?:boolean}){
 const auth=useAuth(),location=useLocation(),[selected,setSelected]=useState<string>(typeof location.state?.office_id==='string'?location.state.office_id:'');
 const contexts=auth.contexts.filter(c=>client?c.role_code==='client':c.role_code!=='client'&&c.permissions.includes('requests.read'));
 useEffect(()=>{const target=location.state?.office_id;if(typeof target==='string'&&contexts.some(c=>c.office_id===target))setSelected(target);},[location.key]);
 const context=contexts.find(c=>c.office_id===selected)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={client?paths.client:paths.team} state={auth.status==='expired'?{sessionExpired:true}:null}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 return <RequestsWorkspace key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${context.permissions.slice().sort().join(',')}`} context={context} contexts={contexts} client={client} onOffice={setSelected}/>;
}
function RequestsWorkspace({context,contexts,client,onOffice}:{context:AccessContext;contexts:AccessContext[];client:boolean;onOffice:(id:string)=>void}){
 const location=useLocation();
 const office=context.office_id,canCreate=client||context.permissions.includes('requests.create');
 const [view,setView]=useState<'list'|'create'|'correction'|'detail'>('list'),[input,setInput]=useState(''),[query,setQuery]=useState(''),[scope,setScope]=useState<'mine'|'queue'>('mine'),[status,setStatus]=useState<RequestFilterStatus>(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const media='(max-width: 900px), (hover: none) and (pointer: coarse) and (max-width: 1200px)';
 const [size,setSize]=useState(()=>matchMedia(media).matches?3:5),[resource,setResource]=useState<{data?:RequestPage;error?:RequestsError}>({});
 const [detail,setDetail]=useState<Detail>(),[name,setName]=useState('Solicitação'),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<RequestsError>(),[feedback,setFeedback]=useState('');
 const pending=useRef<AbortController|null>(null),generation=useRef(0),busyRef=useRef(false),alive=useRef(true),idempotency=useRef(crypto.randomUUID());
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;pending.current?.abort();};},[]);
 useEffect(()=>{const m=matchMedia(media);const change=()=>{setSize(m.matches?3:5);setPage(1);};m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);
 const fail=useCallback((failure:RequestsError)=>{setError(failure);if(failure.status===401||failure.status===403){setBlocked(true);setDetail(undefined);setResource({});generation.current++;pending.current?.abort();}},[]);
 useEffect(()=>{if(view!=='list'||blocked)return;const controller=new AbortController();void requestsApi.search(office,query,scope,status,page,size,controller.signal).then(data=>{if(!controller.signal.aborted)setResource({data});}).catch(cause=>{if(!controller.signal.aborted){const failure=requestsError(cause);if(failure.status===401||failure.status===403)fail(failure);else setResource(old=>({...old,error:failure}));}});return()=>controller.abort();},[office,query,scope,status,page,size,revision,view,blocked,fail]);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(input.trim());setPage(1);},300);return()=>clearTimeout(timer);},[input]);
 useEffect(()=>{
  if(!client||view!=='detail'||!detail||blocked)return;const controller=new AbortController(),id=detail.id;let refreshGeneration=0;
  const refresh=()=>{if(busyRef.current||document.visibilityState!=='visible')return;const started=generation.current,refreshStarted=++refreshGeneration;void requestsApi.detail(office,id,1,controller.signal).then(v=>{if(!controller.signal.aborted&&generation.current===started&&refreshStarted===refreshGeneration)setDetail(v);}).catch(cause=>{if(!controller.signal.aborted&&generation.current===started&&refreshStarted===refreshGeneration)fail(requestsError(cause));});};
  window.addEventListener('jn:inbox-update',refresh);window.addEventListener('focus',refresh);return()=>{controller.abort();window.removeEventListener('jn:inbox-update',refresh);window.removeEventListener('focus',refresh);};
 },[client,view,detail?.id,office,blocked,fail]);
 function transition(next:typeof view){generation.current++;pending.current?.abort();pending.current=null;busyRef.current=false;setBusy(false);setError(undefined);setFeedback('');setView(next);window.scrollTo(0,0);}
 async function run<T>(work:(signal:AbortSignal)=>Promise<T>,accept:(result:T)=>void){if(busyRef.current||blocked)return;const started=generation.current,controller=new AbortController();pending.current=controller;busyRef.current=true;setBusy(true);setError(undefined);setFeedback('');try{const result=await work(controller.signal);if(alive.current&&!controller.signal.aborted&&generation.current===started)accept(result);}catch(cause){if(alive.current&&!controller.signal.aborted&&generation.current===started)fail(requestsError(cause));}finally{if(alive.current&&pending.current===controller){pending.current=null;busyRef.current=false;setBusy(false);}}}
 function back(){transition('list');setDetail(undefined);setRevision(n=>n+1);}
 function open(id:string,title:string){transition('detail');setDetail(undefined);setName(title);void run(signal=>requestsApi.detail(office,id,1,signal),setDetail);}
 useEffect(()=>{if(client&&location.state?.office_id===office&&location.state?.account_correction===true){transition('correction');setDetail(undefined);return;}const id=location.state?.request_id;if(location.state?.office_id===office&&typeof id==='string'&&id.length===36)open(id,'Solicitação');},[location.key,office]);
 function save(request:CreateRequestInput){if(!canCreate||view!=='create')return;void run(signal=>requestsApi.create(office,request,idempotency.current,signal),result=>{setDetail(result);setName(result.title);setView('detail');setFeedback(client?'Solicitação enviada para triagem.':'Atendimento aberto.');idempotency.current=crypto.randomUUID();});}
 function mutate(mutation:RequestMutation){if(!detail||detail.portal)return;void run(signal=>requestsApi.mutate(office,detail.id,detail.version,mutation,signal),result=>{if('access_lost'in result){setResource({});back();setFeedback('Atendimento transferido e fora do seu escopo.');return;}setDetail(result);window.dispatchEvent(new Event('jn:notices-changed'));setFeedback('Alteração registrada.');});}
 const data=resource.data;
 return <OperationLayout client={client} busy={busy}><div className="requests-main"><OperationHeading context={context} showRole={false} title={view==='list'?(client?'Minhas solicitações':'Solicitações'):view==='correction'?'Corrigir dados da conta':view==='create'?'Nova solicitação':detail?.title??name} description={client?'Envie uma mensagem e acompanhe seu atendimento.':'Abertura, fila e histórico dos atendimentos.'}/>
  {contexts.length>1&&<label className="team-field customer-office">Escritório<select value={office} onChange={e=>onOffice(e.target.value)}>{contexts.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
  {blocked?<div className="team-empty"><p role="alert" className="form-feedback error">{error?.message}</p><Link className="primary-button" to={client?paths.client:paths.team}><LogIn size={18} aria-hidden="true"/>Verificar acesso</Link></div>:<>
   {view!=='list'&&<div className="customer-view-toolbar"><button className="team-text-button" onClick={back}><ArrowLeft size={18} aria-hidden="true"/>Voltar à lista</button></div>}
   {feedback&&<p role="status" className="form-feedback">{feedback}</p>}{error&&<div><p role="alert" className="form-feedback error">{error.message}</p>{error.status===409&&detail&&<button className="team-text-button" disabled={busy} onClick={()=>open(detail.id,detail.title)}>Reabrir atendimento</button>}{view==='detail'&&!detail&&<button className="team-text-button" onClick={back}>Voltar às solicitações</button>}</div>}
   {view==='correction'?<AccountCorrectionForm office={office} onFailure={fail} onCreated={result=>{setDetail(result);setName(result.title);setView('detail');setFeedback('Solicitação de correção enviada. Acompanhe pelo protocolo.');}}/>:view==='create'?<RequestForm office={office} client={client} permissions={context.permissions} busy={busy} onSave={save} onFailure={fail}/>:view==='detail'?detail&&<RequestDetail office={office} data={detail} permissions={context.permissions} busy={busy} onHistory={p=>void run(signal=>requestsApi.detail(office,detail.id,p,signal),setDetail)} onMutate={mutate} onFailure={fail} onUpdated={setDetail}/>:<>
    <div className="customer-toolbar"><form className="customer-search" onSubmit={e=>{e.preventDefault();setQuery(input.trim());setPage(1);setRevision(n=>n+1);}}><label className="team-field">Buscar solicitação<input type="search" maxLength={120} value={input} onChange={e=>setInput(e.target.value)}/></label><button className="operation-icon-button" aria-label="Buscar" title="Buscar"><Search size={20} aria-hidden="true"/></button></form><button className="operation-icon-button" aria-label="Atualizar lista" title="Atualizar lista" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={20} aria-hidden="true"/></button>{canCreate&&<button className="primary-button customer-new" aria-label="Nova solicitação" title="Nova solicitação" onClick={()=>{setDetail(undefined);idempotency.current=crypto.randomUUID();transition('create');}}><Plus size={18} aria-hidden="true"/><span>Nova solicitação</span></button>}</div>
    {<div className="request-grid request-filters">{!client&&<label className="team-field">Escopo<select value={scope} onChange={e=>{setScope(e.target.value as typeof scope);setPage(1);}}><option value="mine">Meus</option><option value="queue">Fila autorizada</option></select></label>}<label className="team-field">Status<select value={status} onChange={e=>{setStatus(e.target.value as RequestFilterStatus);setPage(1);}}><option value="">Todos os status</option>{client?Object.entries(publicRequestStatusLabels).map(([value,label])=><option value={value} key={value}>{label}</option>):requestStatuses.map(s=><option value={s} key={s}>{requestStatusLabels[s]}</option>)}</select></label></div>}
    {resource.error&&<div><p role="alert" className="form-feedback error">{resource.error.message}</p><button className="team-text-button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></div>}
    {data&&<>{data.items.length?<ul className="customer-list request-list" aria-label={client?'Minhas solicitações':'Solicitações do escritório'}>{data.items.map(item=><li key={item.id}><div><strong>{item.title}</strong><small>{item.protocol} · {'status'in item?requestStatusLabels[item.status]:publicRequestStatusLabels[item.public_status]}</small></div><button className="operation-icon-button" aria-label={`Ver solicitação ${item.protocol}`} title="Ver solicitação" onClick={()=>open(item.id,item.title)}><Eye size={20} aria-hidden="true"/></button></li>)}</ul>:<p className="team-empty">Nenhuma solicitação encontrada. {canCreate?'Abra a primeira solicitação ou ajuste a busca.':'Ajuste a busca ou confira a fila autorizada.'}</p>}<nav className="team-pagination" aria-label="Paginação de solicitações"><button className="team-text-button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={17} aria-hidden="true"/>Anterior</button><span>{data.page}/{Math.max(1,Math.ceil(data.total/data.page_size))} · {data.total} solicitações</span><button className="team-text-button" disabled={page*data.page_size>=data.total} onClick={()=>setPage(p=>p+1)}>Próxima<ArrowRight size={17} aria-hidden="true"/></button></nav></>}
   </>}
  </>}
 </div></OperationLayout>;
}
