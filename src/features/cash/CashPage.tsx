import {CashStatement} from './CashStatement';
import {cashMoney} from './CashSessions';
import type {CashFilters} from '../../../shared/cash';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {RefreshCw} from 'lucide-react';
import type {AccessContext} from '../../../shared/access';
import type {CashConfiguration,CashDashboard,CashOpen,CashConfigure} from '../../../shared/cash';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import {cashApi,cashError,CashError} from './api';
import {CashOpeningForm} from './CashOpeningForm';
import {CashConfigurationPanel} from './CashConfigurationPanel';
import {CashSessions} from './CashSessions';
import '../team/team.css';
import '../customers/customers.css';
import './cash.css';
type Tab='own'|'all'|'configuration';
type Issue={source:'dashboard'|'configuration'|'command';error:CashError};
export default function CashPage(){
 const auth=useAuth(),[office,setOffice]=useState('');
 const contexts=auth.contexts.filter(c=>c.role_code!=='client'&&c.permissions.includes('cash.read'));
 const context=contexts.find(c=>c.office_id===office)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 return <CashWorkspace key={context.office_id} context={context} contexts={contexts} onOffice={setOffice}/>;
}
function CashWorkspace({context,contexts,onOffice}:{context:AccessContext;contexts:AccessContext[];onOffice:(id:string)=>void}){
 const office=context.office_id;
 const [statement,setStatement]=useState<string>(),[statementBusy,setStatementBusy]=useState(false),[filterDraft,setFilterDraft]=useState<CashFilters>({unit_id:null,status:'all',query:''}),[filters,setFilters]=useState<CashFilters>({unit_id:null,status:'all',query:''});
 const [tab,setTab]=useState<Tab>('own'),[scope,setScope]=useState<'own'|'all'>('own'),[page,setPage]=useState(1),[configPage,setConfigPage]=useState(1),[unitFilter,setUnitFilter]=useState<string|null>(null),[revision,setRevision]=useState(0);
 const [size,setSize]=useState<3|5>(()=>matchMedia('(max-width:900px)').matches?3:5);
 const [data,setData]=useState<CashDashboard>(),[configuration,setConfiguration]=useState<CashConfiguration>(),[openingOptions,setOpeningOptions]=useState<CashConfiguration>(),[issues,setIssues]=useState<Partial<Record<Issue['source'],CashError>>>({}),[feedback,setFeedback]=useState(''),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[configReading,setConfigReading]=useState(false);
 const alive=useRef(true),mutation=useRef<AbortController|null>(null),dashboardRead=useRef<AbortController|null>(null),configRead=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort();dashboardRead.current?.abort();configRead.current?.abort();};},[]);
 useEffect(()=>{const m=matchMedia('(max-width:900px)'),resize=()=>{setSize(m.matches?3:5);setPage(1);};m.addEventListener('change',resize);return()=>m.removeEventListener('change',resize);},[]);
 const adoptConfiguration=useCallback((v:CashConfiguration)=>{
  setConfiguration(v);setOpeningOptions(old=>{const merge=<T extends {id:string},>(a:T[],b:T[])=>[...new Map([...a,...b].map(x=>[x.id,x])).values()];return old?{...v,units:merge(old.units,v.units),accounts:merge(old.accounts,v.accounts),payment_methods:merge(old.payment_methods,v.payment_methods)}:v;});
 },[]);
 const fail=useCallback((cause:unknown,source:Issue['source']='command')=>{const e=cashError(cause);setIssues(old=>({...old,[source]:e}));if([401,403,404].includes(e.status)){dashboardRead.current?.abort();configRead.current?.abort();setReading(false);setConfigReading(false);setData(undefined);setConfiguration(undefined);setOpeningOptions(undefined);setFeedback('');if(e.status!==404)setBlocked(true);}},[]);
 useEffect(()=>{
  if(blocked||mutation.current)return;const c=new AbortController();dashboardRead.current=c;setReading(true);
  void (filters.unit_id||filters.status!=='all'||filters.query?cashApi.filteredDashboard(office,scope,page,size,filters,c.signal):cashApi.dashboard(office,scope,page,size,c.signal)).then(v=>{if(!c.signal.aborted){setData(v);setIssues(previous=>{const next={...previous};delete next.dashboard;return next;});}}).catch(cause=>{if(!c.signal.aborted)fail(cause,'dashboard');}).finally(()=>{if(!c.signal.aborted)setReading(false);});return()=>c.abort();
 },[office,scope,page,size,revision,blocked,fail,filters]);
 useEffect(()=>{
  if(blocked||mutation.current)return;const c=new AbortController();configRead.current=c;setConfigReading(true);
  void cashApi.configuration(office,configPage,unitFilter,c.signal).then(v=>{if(!c.signal.aborted){adoptConfiguration(v);setIssues(previous=>{const next={...previous};delete next.configuration;return next;});}}).catch(cause=>{if(!c.signal.aborted)fail(cause,'configuration');}).finally(()=>{if(!c.signal.aborted)setConfigReading(false);});return()=>c.abort();
 },[office,configPage,unitFilter,revision,blocked,fail,adoptConfiguration]);
 useEffect(()=>{const refresh=()=>{if(!mutation.current&&document.visibilityState==='visible')setRevision(n=>n+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
 async function command<T>(work:(signal:AbortSignal)=>Promise<T>,apply:(v:T)=>void){
  if(blocked||mutation.current)return false;const c=new AbortController();mutation.current=c;dashboardRead.current?.abort();configRead.current?.abort();setReading(false);setConfigReading(false);setBusy(true);setIssues({});setFeedback('');
  try{const v=await work(c.signal);if(!c.signal.aborted&&alive.current){apply(v);return true;}return false;}
  catch(cause){if(!c.signal.aborted&&alive.current)fail(cause);return false;}
  finally{if(alive.current&&mutation.current===c){mutation.current=null;setBusy(false);}}
 }
 const open=(input:CashOpen)=>command(signal=>cashApi.open(office,input,signal),v=>{setData(v);setPage(1);setScope('own');setTab('own');setFeedback('Seu caixa foi aberto. O fundo em espécie não é receita.');});
 const configure=(input:CashConfigure,key:string)=>command(signal=>cashApi.configure(office,input,key,signal),v=>{adoptConfiguration(v.configuration);setConfigPage(1);setUnitFilter(null);setFeedback('Configuração financeira registrada.');});
 const canAll=(data?.can_read_all??true)&&context.permissions.includes('cash.read_all'),canManage=(data?.can_manage??true)&&context.permissions.includes('cash.manage');
 const shown=data?.scope===scope?data:undefined,controlsBusy=busy||statementBusy;
 function changeTab(next:Tab){if(mutation.current||statementBusy)return;setTab(next);setStatement(undefined);setFeedback('');setIssues({});if(next!=='configuration'){setScope(next);setPage(1);}}
 return <OperationLayout busy={busy||statementBusy}><div className="cash-main team-main">
  <OperationHeading context={context} showRole={false} title="Caixa" description="Operação individual, recebimentos e conferência financeira."/>
  {contexts.length>1&&<label className="team-field team-office">Escritório<select disabled={controlsBusy} value={office} onChange={e=>onOffice(e.target.value)}>{contexts.map(c=><option value={c.office_id} key={c.office_id}>{c.office_name}</option>)}</select></label>}
  {feedback&&<p role="status" className="form-feedback">{feedback}</p>}{Object.entries(issues).map(([source,error])=><p key={source} role="alert" className="form-feedback error">{error.message}</p>)}
  {blocked?<Link className="secondary-button" to={paths.account}>Verificar meu acesso</Link>:<>
   <div className="team-toolbar cash-toolbar"><div role="tablist" aria-label="Área do caixa" className="team-tabs">
    <button role="tab" aria-selected={tab==='own'} disabled={controlsBusy} onClick={()=>changeTab('own')}>Meu caixa</button>
    {canAll&&<button role="tab" aria-selected={tab==='all'} disabled={controlsBusy} onClick={()=>changeTab('all')}>Consolidação</button>}
    {canManage&&<button role="tab" aria-selected={tab==='configuration'} disabled={controlsBusy} onClick={()=>changeTab('configuration')}>Configuração</button>}
   </div><button className="operation-icon-button" disabled={controlsBusy||reading||configReading} aria-label="Atualizar caixa" title="Atualizar caixa" onClick={()=>{setIssues({});setRevision(n=>n+1);}}><RefreshCw size={19} aria-hidden="true"/></button></div>
   {statement?<CashStatement office={office} sessionId={statement} configuration={openingOptions} onBack={()=>setStatement(undefined)} onBusy={setStatementBusy} onChanged={()=>setRevision(n=>n+1)}/>:tab==='configuration'&&canManage&&configuration?<CashConfigurationPanel key={office} data={configuration} references={openingOptions??configuration} busy={busy} size={size} onSave={configure} onClear={()=>{setIssues({});setFeedback('');}} onPage={setConfigPage} onUnit={id=>{setUnitFilter(id);setConfigPage(1);}} pending={configReading}/>:tab!=='configuration'&&<>
    {tab==='own'&&shown&&openingOptions&&shown.can_open&&<CashOpeningForm canManage={canManage} onConfigure={()=>changeTab('configuration')} configuration={openingOptions} sessions={shown.sessions} busy={busy} onOpen={open} onClear={()=>{setIssues({});setFeedback('');}}/>}
    {tab==='own'&&shown&&!shown.can_open&&<p className="customer-note">Você pode consultar seu caixa. A abertura exige autorização do escritório.</p>}
    <form className="cash-list-filters" onSubmit={e=>{e.preventDefault();setFilters({...filterDraft,query:filterDraft.query.trim()});setPage(1);}}><label className="team-field">Unidade dos caixas<select value={filterDraft.unit_id??''} disabled={controlsBusy} onChange={e=>setFilterDraft(v=>({...v,unit_id:e.target.value||null}))}><option value="">Todas as unidades</option>{openingOptions?.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="team-field">Situação<select value={filterDraft.status} disabled={controlsBusy} onChange={e=>setFilterDraft(v=>({...v,status:e.target.value as CashFilters['status']}))}><option value="all">Todos</option><option value="open">Abertos</option><option value="closed">Fechados</option></select></label><label className="team-field">Operador ou conta<input value={filterDraft.query} maxLength={120} onChange={e=>setFilterDraft(v=>({...v,query:e.target.value}))}/></label><button className="secondary-button" disabled={busy||reading}>Filtrar caixas</button></form>
    {shown?.summary&&<dl className="cash-totals"><div><dt>Caixas no filtro</dt><dd>{shown.summary.open} abertos · {shown.summary.closed} fechados</dd></div><div><dt>Saldo histórico em espécie</dt><dd>{cashMoney(shown.summary.numerario_cents)}</dd></div><div><dt>Recebimentos líquidos</dt><dd>{cashMoney(shown.summary.received_cents)}</dd></div></dl>}
    {shown&&<><CashSessions data={shown} size={size} onStatement={setStatement}/><nav className="team-pagination" aria-label="Paginação de caixas"><button className="team-text-button" disabled={busy||reading||shown.page<=1} onClick={()=>setPage(shown.page-1)}>Anterior</button><span>{shown.page}/{Math.max(1,Math.ceil(shown.total/size))} · {shown.total} caixas</span><button className="team-text-button" disabled={busy||reading||shown.page*size>=shown.total} onClick={()=>setPage(shown.page+1)}>Próxima</button></nav></>}
   </>}
   {configuration&&tab==='own'&&Math.max(configuration.units_total,configuration.accounts_total)>50&&<div className="cash-option-pages"><p className="customer-note">Opções de unidade/conta · página {configuration.page}. Consulte as próximas opções quando necessário.</p><button className="team-text-button" disabled={busy||configReading||configuration.page<=1} onClick={()=>setConfigPage(configuration.page-1)}>Opções anteriores</button><button className="team-text-button" disabled={busy||configReading||configuration.page*50>=Math.max(configuration.units_total,configuration.accounts_total)} onClick={()=>setConfigPage(configuration.page+1)}>Mais opções</button></div>}
  </>}
 </div></OperationLayout>;
}
