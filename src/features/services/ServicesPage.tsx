import { useEffect, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Eye, LogIn, Plus, RefreshCw, Search } from 'lucide-react';
import type { AccessContext } from '../../../shared/access';
import { serviceMoney, type ServiceDetail as Detail, type ServiceInput, type ServicePage, type ServiceQuote } from '../../../shared/services';
import { paths } from '../../app/routes';
import { useAuth } from '../auth/AuthProvider';
import { OperationHeading, OperationLayout } from '../operation/OperationLayout';
import { OperationalFeedback } from '../operation/OperationalAccess';
import { ServiceForm } from './ServiceForm';
import { ServiceDetail } from './ServiceDetail';
import { servicesApi, servicesError, ServicesError } from './api';
import '../team/team.css';
import '../customers/customers.css';
import './services.css';

export default function ServicesPage(){
 const auth=useAuth();const [selected,setSelected]=useState('');
 const contexts=auth.contexts.filter(c=>c.role_code!=='client'&&c.permissions.includes('services.read'));
 const context=contexts.find(c=>c.office_id===selected)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team} state={auth.status==='expired'?{sessionExpired:true}:null}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 return <ServicesWorkspace key={`${auth.sessionKey}:${context.office_id}:${context.role_code}:${context.permissions.slice().sort().join(',')}`} context={context} contexts={contexts} onOffice={setSelected}/>;
}
function ServicesWorkspace({context,contexts,onOffice}:{context:AccessContext;contexts:AccessContext[];onOffice:(office:string)=>void}){
 const auth=useAuth(),office=context.office_id,canManage=context.permissions.includes('services.manage');
 const [view,setView]=useState<'list'|'create'|'detail'|'edit'>('list');
 const [input,setInput]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const mediaQuery='(max-width: 900px), (hover: none) and (pointer: coarse) and (max-width: 1200px)';
 const [size,setSize]=useState(()=>matchMedia(mediaQuery).matches?3:5);
 const [resource,setResource]=useState<{key:string;data?:ServicePage;error?:ServicesError}>({key:''});
 const [detail,setDetail]=useState<Detail>(),[name,setName]=useState('Serviço'),[quote,setQuote]=useState<ServiceQuote>();
 const [blocked,setBlocked]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState<ServicesError>(),[feedback,setFeedback]=useState('');
 const pending=useRef<AbortController|null>(null),generation=useRef(0),busyRef=useRef(false),alive=useRef(true);
 const key=`${query}:${page}:${size}:${revision}`;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;generation.current++;pending.current?.abort();};},[]);
 useEffect(()=>{const m=matchMedia(mediaQuery);const change=()=>{setSize(m.matches?3:5);setPage(1);};m.addEventListener('change',change);return()=>m.removeEventListener('change',change);},[]);
 useEffect(()=>{
  if(view!=='list'||blocked)return;
  const controller=new AbortController();
  void servicesApi.search(office,query,page,size,controller.signal).then(data=>{if(!controller.signal.aborted)setResource({key,data});}).catch(cause=>{if(!controller.signal.aborted){const failure=servicesError(cause);setResource({key,error:failure});if(failure.status===401||failure.status===403)setBlocked(true);}});
  return()=>controller.abort();
 },[office,key,query,page,size,view,blocked]);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(input.trim());setPage(1);},300);return()=>clearTimeout(timer);},[input]);
 function transition(next:typeof view){generation.current++;pending.current?.abort();pending.current=null;busyRef.current=false;setBusy(false);setError(undefined);setFeedback('');setQuote(undefined);setView(next);window.scrollTo(0,0);}
 async function run<T>(work:(signal:AbortSignal)=>Promise<T>,accept:(result:T)=>void){
  if(busyRef.current)return;
  const started=generation.current;const controller=new AbortController();pending.current=controller;busyRef.current=true;setBusy(true);setError(undefined);setFeedback('');
  try{const result=await work(controller.signal);if(alive.current&&!controller.signal.aborted&&generation.current===started)accept(result);}
  catch(cause){if(alive.current&&!controller.signal.aborted&&generation.current===started){const failure=servicesError(cause);setError(failure);if(failure.status===401||failure.status===403){setBlocked(true);setDetail(undefined);setResource({key:''});setQuote(undefined);}}}
  finally{if(alive.current&&pending.current===controller){pending.current=null;busyRef.current=false;setBusy(false);}}
 }
 function open(id:string,title:string){transition('detail');setDetail(undefined);setName(title);void run(signal=>servicesApi.detail(office,id,1,signal),setDetail);}
 function back(){transition('list');setDetail(undefined);setRevision(n=>n+1);}
 function edit(){if(!detail||!canManage||!detail.can_manage)return;setQuote(undefined);setFeedback('');if(detail.versions.some(v=>v.number===detail.latest_version)){transition('edit');return;}void run(signal=>servicesApi.detail(office,detail.id,1,signal),result=>{setDetail(result);setView('edit');});}
 function save(service:ServiceInput,reason:string){
  if(!canManage||(view!=='create'&&view!=='edit')||(view==='edit'&&!detail?.can_manage))return;
  void run(signal=>view==='edit'&&detail?servicesApi.publish(office,detail.id,service,detail.latest_version,reason,signal):servicesApi.create(office,service,reason,signal),result=>{setDetail(result);setName(result.current?.name??result.versions[0].name);setView('detail');setQuote(undefined);setFeedback(view==='edit'?'Versão publicada. Itens antigos preservados.':'Serviço cadastrado.');});
 }
 const data=resource.data,listError=resource.error;
 const fatal=[error,listError].find(e=>e?.status===401||e?.status===403);
 const initial=detail?.versions.find(v=>v.number===detail.latest_version);
 return <OperationLayout busy={busy}><div className="services-main">
  <OperationHeading context={context} showRole={false} title={view==='list'?'Serviços':view==='create'?'Novo serviço':view==='edit'?'Nova versão':detail?.current?.name??name} description={view==='list'?'Catálogo, preços e regras do escritório.':'Preços e políticas preservados por versão.'}/>
  {contexts.length>1&&<label className="team-field customer-office">Escritório<select value={office} onChange={e=>onOffice(e.target.value)}>{contexts.map(c=><option key={c.office_id} value={c.office_id}>{c.office_name}</option>)}</select></label>}
  {fatal?<div className="team-empty"><p role="alert" className="form-feedback error">{fatal.message}</p>{fatal.status===401?<Link className="primary-button" to={paths.team}><LogIn size={18} aria-hidden="true"/>Entrar novamente</Link>:<button className="team-text-button" onClick={()=>{auth.refresh();setBlocked(false);setResource({key:''});back();}}>Verificar acesso novamente</button>}</div>:<>
   {view!=='list'&&<div className="customer-view-toolbar"><button className="team-text-button" onClick={back}><ArrowLeft size={18} aria-hidden="true"/>Voltar à lista</button>{view==='detail'&&detail?.can_manage&&canManage&&<button className="team-text-button" disabled={busy} onClick={edit}><Plus size={18} aria-hidden="true"/>Nova versão</button>}</div>}
   {feedback&&<p role="status" className="form-feedback">{feedback}</p>}
   {error&&<div><p role="alert" className="form-feedback error">{error.message}</p>{error.status===409&&detail&&<button className="team-text-button" disabled={busy} onClick={()=>open(detail.id,name)}>Reabrir serviço</button>}{view==='detail'&&!detail&&<button className="team-text-button" onClick={back}>Voltar ao catálogo</button>}</div>}
   {(view==='create'||view==='edit')?<ServiceForm key={`${view}:${detail?.latest_version??0}`} initial={view==='edit'?initial:undefined} busy={busy} onSave={save}/>:view==='detail'?detail&&<ServiceDetail key={detail.id} data={detail} busy={busy} permissions={context.permissions} quote={quote} onClearQuote={()=>setQuote(undefined)} onHistory={p=>void run(signal=>servicesApi.detail(office,detail.id,p,signal),result=>{setDetail(result);setQuote(undefined);})} onQuote={(quantity,adjustment)=>void run(signal=>servicesApi.quote(office,detail.id,quantity,adjustment,signal),setQuote)}/>:<>
    <div className="customer-toolbar"><form className="customer-search" onSubmit={e=>{e.preventDefault();setQuery(input.trim());setPage(1);setRevision(n=>n+1);}}><label className="team-field">Buscar serviço<input type="search" maxLength={120} value={input} onChange={e=>setInput(e.target.value)}/></label><button className="operation-icon-button" aria-label="Buscar" title="Buscar"><Search size={20} aria-hidden="true"/></button></form><button className="operation-icon-button" aria-label="Atualizar lista" title="Atualizar lista" onClick={()=>setRevision(n=>n+1)}><RefreshCw size={20} aria-hidden="true"/></button>{canManage&&<button className="primary-button customer-new" aria-label="Novo serviço" title="Novo serviço" onClick={()=>{setDetail(undefined);transition('create');}}><Plus size={18} aria-hidden="true"/><span>Novo serviço</span></button>}</div>
    {listError?<div className="team-empty"><p role="alert" className="form-feedback error">{listError.message}</p><button className="team-text-button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button></div>:data&&<>{data.items.length?<ul className="customer-list" aria-label="Serviços do escritório">{data.items.map(s=><li key={s.id}><div><strong>{s.name}</strong><small>{s.category} · {serviceMoney(s.price_cents)}/{s.unit} · v{s.version}{Date.parse(s.effective_from)>Date.now()?' · agendado':''}</small></div><button className="operation-icon-button" aria-label={`Ver serviço ${s.name}`} title="Ver serviço" onClick={()=>open(s.id,s.name)}><Eye size={20} aria-hidden="true"/></button></li>)}</ul>:<p className="team-empty">Nenhum serviço encontrado. Cadastre o primeiro serviço ou ajuste a busca.</p>}<nav className="team-pagination" aria-label="Paginação de serviços"><button className="team-text-button" disabled={page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={17} aria-hidden="true"/>Anterior</button><span>{data.page}/{Math.max(1,Math.ceil(data.total/data.page_size))} · {data.total} serviços</span><button className="team-text-button" disabled={page*data.page_size>=data.total} onClick={()=>setPage(p=>p+1)}>Próxima<ArrowRight size={17} aria-hidden="true"/></button></nav></>}
   </>}
  </>}
 </div></OperationLayout>;
}
