import {DocumentCashQueue} from '../documentWorkflow/DocumentCashQueue';
import ChargesPage from '../charges/ChargesPage';
import ExpensesPage from './ExpensesPage';
import ReportsPage from '../finance/ReportsPage';
import type {ClosureMode} from './CashClosurePanel';
import {CashStatement} from './CashStatement';
import {cashMoney} from './CashSessions';
import type {CashFilters} from '../../../shared/cash';
import {quickRequiredPermissions} from '../../../shared/finance19';
import {evaluateCashSetupReadiness,MANUAL_PAYMENT_SETUP_GUIDANCE,type CashNavigationState} from '../../../shared/manualPaymentFlow';
import {useCallback,useEffect,useRef,useState} from 'react';
import {Link,Navigate,useLocation,useNavigate} from 'react-router-dom';
import {ArrowLeft,Banknote,RefreshCw,Settings} from 'lucide-react';
import type {AccessContext} from '../../../shared/access';
import type {CashConfiguration,CashDashboard,CashOpen,CashConfigure} from '../../../shared/cash';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import {cashApi,cashError,CashError} from './api';
import {loadAllCashConfigurationPages} from './cashConfigLoader';
import {CashOpeningForm} from './CashOpeningForm';
import {CashConfigurationPanel} from './CashConfigurationPanel';
import {CashSessions} from './CashSessions';
import {ApprovalsPanel} from '../approvals/ApprovalsPanel';
import '../team/team.css';
import '../customers/customers.css';
import '../payments/payments.css';
import '../settings/paymentProviders.css';
import './cash.css';
type Tab='own'|'all'|'configuration'|'charges'|'expenses'|'reports'|'approvals';
type Issue={source:'dashboard'|'configuration'|'references'|'command';error:CashError};
const VALID_TABS:Tab[]=['own','all','configuration','charges','expenses','reports','approvals'];
export default function CashPage(){
 const auth=useAuth(),location=useLocation(),navState=location.state as CashNavigationState|null,[office,setOffice]=useState(navState?.office_id??'');
 const contexts=auth.contexts.filter(c=>c.role_code!=='client'&&(c.permissions.includes('cash.read')||(c.permissions.includes('requests.read')&&c.permissions.includes('charges.read'))));
 const context=contexts.find(c=>c.office_id===office)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 return <CashWorkspace key={context.office_id} context={context} contexts={contexts} onOffice={setOffice}/>;
}
function CashWorkspace({context,contexts,onOffice}:{context:AccessContext;contexts:AccessContext[];onOffice:(id:string)=>void}){
 const location=useLocation(),navigate=useNavigate(),navState=location.state as CashNavigationState|null;
 const office=context.office_id;
 const [closureTools,setClosureTools]=useState<{sessionId:string;canAdjust:boolean}>(),[closureIntent,setClosureIntent]=useState<{mode:ClosureMode;nonce:number}>();
 const closureAction=(mode:ClosureMode)=>setClosureIntent(v=>({mode,nonce:(v?.nonce??0)+1}));
 const [statement,setStatement]=useState<string>(),[statementBusy,setStatementBusy]=useState(false),[autoOpenRecord,setAutoOpenRecord]=useState(false),[filterDraft,setFilterDraft]=useState<CashFilters>({unit_id:null,status:'all',query:''}),[filters,setFilters]=useState<CashFilters>({unit_id:null,status:'all',query:''});
 const mayCash=context.permissions.includes('cash.read');
 const resolveInitialTab=useCallback((requested?:Tab):Tab=>{
  if(requested&&VALID_TABS.includes(requested)){
   if(requested==='configuration'&&(!mayCash||!context.permissions.includes('cash.manage')))return mayCash?'own':'charges';
   if(requested==='all'&&(!mayCash||!context.permissions.includes('cash.read_all')))return mayCash?'own':'charges';
   if(requested==='own'&&!mayCash)return 'charges';
   return requested;
  }
  return mayCash?'own':'charges';
 },[context.permissions,mayCash]);
 const [tab,setTab]=useState<Tab>(()=>resolveInitialTab(navState?.tab)),[scope,setScope]=useState<'own'|'all'>(()=>navState?.tab==='all'?'all':'own'),[page,setPage]=useState(1),[configPage,setConfigPage]=useState(1),[unitFilter,setUnitFilter]=useState<string|null>(navState?.office_id===office?navState.configuration_unit_id??null:null),[revision,setRevision]=useState(0),[financialRevision,setFinancialRevision]=useState(0);
 const [returnTo,setReturnTo]=useState(navState?.return_to);
 const [preselectedCharge,setPreselectedCharge]=useState(navState?.preselected_charge);
 useEffect(()=>{
  if(navState?.tab)setTab(resolveInitialTab(navState.tab));
  if(navState?.office_id===office&&navState.configuration_unit_id){setConfigPage(1);setUnitFilter(navState.configuration_unit_id);}
  if(navState?.return_to)setReturnTo(navState.return_to);
  if(navState?.preselected_charge)setPreselectedCharge(navState.preselected_charge);
 },[location.key,office,navState?.office_id,navState?.tab,navState?.configuration_unit_id,navState?.return_to,navState?.preselected_charge,resolveInitialTab]);
 const [size,setSize]=useState<3|5>(()=>matchMedia('(max-width:900px)').matches?3:5);
 const [data,setData]=useState<CashDashboard>(),[configuration,setConfiguration]=useState<CashConfiguration>(),[openingOptions,setOpeningOptions]=useState<CashConfiguration>(),[issues,setIssues]=useState<Partial<Record<Issue['source'],CashError>>>({}),[feedback,setFeedback]=useState(''),[blocked,setBlocked]=useState(false),[busy,setBusy]=useState(false),[reading,setReading]=useState(false),[configReading,setConfigReading]=useState(false),[referencesReading,setReferencesReading]=useState(false);
 const alive=useRef(true),mutation=useRef<AbortController|null>(null),dashboardRead=useRef<AbortController|null>(null),configRead=useRef<AbortController|null>(null),referencesRead=useRef<AbortController|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort();dashboardRead.current?.abort();configRead.current?.abort();referencesRead.current?.abort();};},[]);
 useEffect(()=>{const m=matchMedia('(max-width:900px)'),resize=()=>{setSize(m.matches?3:5);setPage(1);};m.addEventListener('change',resize);return()=>m.removeEventListener('change',resize);},[]);
 const fail=useCallback((cause:unknown,source:Issue['source']='command')=>{const e=cashError(cause);setIssues(old=>({...old,[source]:e}));if([401,403,404].includes(e.status)){dashboardRead.current?.abort();configRead.current?.abort();referencesRead.current?.abort();setReading(false);setConfigReading(false);setReferencesReading(false);setData(undefined);setConfiguration(undefined);setOpeningOptions(undefined);setFeedback('');if(e.status!==404)setBlocked(true);}},[]);
 useEffect(()=>{
  if(blocked||mutation.current||!mayCash)return;const c=new AbortController();dashboardRead.current=c;setReading(true);
  void (filters.unit_id||filters.status!=='all'||filters.query?cashApi.filteredDashboard(office,scope,page,size,filters,c.signal):cashApi.dashboard(office,scope,page,size,c.signal)).then(v=>{if(!c.signal.aborted){setData(v);setIssues(previous=>{const next={...previous};delete next.dashboard;return next;});}}).catch(cause=>{if(!c.signal.aborted)fail(cause,'dashboard');}).finally(()=>{if(!c.signal.aborted)setReading(false);});return()=>c.abort();
 },[office,scope,page,size,revision,financialRevision,blocked,fail,filters,mayCash]);
 useEffect(()=>{
  if(blocked||!mayCash)return;
  const controller=new AbortController();
  referencesRead.current=controller;
  setReferencesReading(true);
  void loadAllCashConfigurationPages(office,null,controller.signal).then(value=>{
   if(controller.signal.aborted)return;
   setOpeningOptions(value);
   setIssues(previous=>{const next={...previous};delete next.references;return next;});
  }).catch(cause=>{
   if(controller.signal.aborted)return;
   setOpeningOptions(undefined);
   fail(cause,'references');
  }).finally(()=>{if(!controller.signal.aborted)setReferencesReading(false);});
  return()=>controller.abort();
 },[office,revision,blocked,fail,mayCash]);
 useEffect(()=>{
  if(blocked||!mayCash||tab!=='configuration'){setConfigReading(false);return;}
  const controller=new AbortController();
  configRead.current=controller;
  setConfigReading(true);
  void cashApi.configuration(office,configPage,unitFilter,controller.signal).then(value=>{
   if(controller.signal.aborted)return;
   setConfiguration(value);
   setIssues(previous=>{const next={...previous};delete next.configuration;return next;});
  }).catch(cause=>{if(!controller.signal.aborted)fail(cause,'configuration');})
   .finally(()=>{if(!controller.signal.aborted)setConfigReading(false);});
  return()=>controller.abort();
 },[office,tab,configPage,unitFilter,revision,blocked,fail,mayCash]);
 useEffect(()=>{const refresh=()=>{if(!mutation.current&&document.visibilityState==='visible')setRevision(n=>n+1);};window.addEventListener('focus',refresh);return()=>window.removeEventListener('focus',refresh);},[]);
 async function command<T>(work:(signal:AbortSignal)=>Promise<T>,apply:(v:T)=>void){
  if(blocked||mutation.current)return false;const c=new AbortController();mutation.current=c;dashboardRead.current?.abort();setReading(false);setBusy(true);setIssues({});setFeedback('');
  try{const v=await work(c.signal);if(!c.signal.aborted&&alive.current){apply(v);return true;}return false;}
  catch(cause){if(!c.signal.aborted&&alive.current)fail(cause);return false;}
  finally{if(alive.current&&mutation.current===c){mutation.current=null;setBusy(false);}}
 }
 const open=(input:CashOpen)=>command(signal=>cashApi.open(office,input,signal),v=>{setData(v);setPage(1);setScope('own');setTab('own');setFeedback(input.cash_account_id?'Seu caixa foi aberto. O fundo em espécie não é receita.':'Seu caixa sem espécie foi aberto.');});
 const configure=(input:CashConfigure,key:string)=>command(signal=>cashApi.configure(office,input,key,signal),()=>{setRevision(n=>n+1);setFeedback('Configuração financeira registrada.');});
 const canAll=(data?.can_read_all??true)&&context.permissions.includes('cash.read_all'),canManage=(data?.can_manage??true)&&context.permissions.includes('cash.manage');
 const canCharges=context.permissions.includes('requests.read')&&context.permissions.includes('charges.read'),canExpenses=mayCash&&['expenses.read','cash.transfer'].some(permission=>context.permissions.includes(permission)),canReports=context.permissions.includes('finance.reports.read')&&context.permissions.includes('cash.read');
 const canQuick=['own','all'].includes(tab)&&!statement&&quickRequiredPermissions.every(permission=>context.permissions.includes(permission));
 const canRecordPayment=context.permissions.includes('cash.open')&&context.permissions.includes('charges.read')&&context.permissions.includes('requests.read');
 const shown=data?.scope===scope?data:undefined,controlsBusy=busy||statementBusy;
 const readiness=evaluateCashSetupReadiness(openingOptions??configuration,data?.sessions??[]);
 const openOwnSession=readiness.open_own_session;
 function changeTab(next:Tab){if(mutation.current||statementBusy)return;setTab(next);setStatement(undefined);setAutoOpenRecord(false);setFeedback('');setIssues({});if(next==='own'||next==='all'){setScope(next);setPage(1);}}
 function openManualPaymentInCash(){
  if(!openOwnSession)return;
  setStatement(openOwnSession.id);
  setAutoOpenRecord(true);
 }
 function goBackToOrigin(){
  if(!returnTo)return;
  navigate(returnTo.pathname,{state:{office_id:returnTo.office_id,request_id:returnTo.request_id,open_manual_payment:true}});
 }
 return <OperationLayout busy={busy||statementBusy} contextActions={<>{canQuick&&<Link to={paths.quick} aria-disabled={controlsBusy||undefined} onClick={event=>{if(controlsBusy)event.preventDefault();}}>Atendimento rápido</Link>}{statement&&closureTools?.sessionId===statement&&<><p>Conferência do caixa</p><button type="button" disabled={controlsBusy} onClick={()=>closureAction('view')}>Ver conferências</button>{closureTools.canAdjust&&<button type="button" disabled={controlsBusy} onClick={()=>closureAction('adjust')}>Ajustar conferência anterior</button>}</>}</>}><div className="cash-main team-main">
  <OperationHeading context={context} showRole={false} title="Caixa" description="Operação individual, recebimentos e conferência financeira."/>
  {contexts.length>1&&<label className="team-field team-office">Escritório<select disabled={controlsBusy} value={office} onChange={e=>onOffice(e.target.value)}>{contexts.map(c=><option value={c.office_id} key={c.office_id}>{c.office_name}</option>)}</select></label>}
  {returnTo&&<div className="jn-return-banner" role="region" aria-label="Retorno para o atendimento de origem">
   <div>
    <strong>Fluxo guiado para pagamento manual{preselectedCharge?` · ${preselectedCharge.protocol}`:''}</strong>
    <p className="customer-note">{readiness.ready_to_record?'Configuração concluída e caixa aberto. Você já pode voltar para informar o pagamento ou registrar agora no Caixa.':readiness.setup_complete?'Configuração financeira concluída. Abra seu Caixa individual abaixo e depois volte para concluir o pagamento.':MANUAL_PAYMENT_SETUP_GUIDANCE}</p>
   </div>
   <div className="account-actions">
    <button type="button" className={readiness.ready_to_record?'primary-button':'secondary-button'} disabled={controlsBusy} onClick={goBackToOrigin}><ArrowLeft size={16} aria-hidden="true"/>{returnTo.label}</button>
    {readiness.ready_to_record&&openOwnSession&&canRecordPayment&&!statement&&<button type="button" className="secondary-button" disabled={controlsBusy} onClick={openManualPaymentInCash}><Banknote size={16} aria-hidden="true"/>Informar pagamento agora</button>}
   </div>
  </div>}
  {feedback&&<p role="status" className="form-feedback">{feedback}</p>}{Object.entries(issues).filter(([source])=>blocked||tab!=='configuration'||!['configuration','references'].includes(source)).map(([source,error])=><p key={source} role="alert" className="form-feedback error">{error.message}</p>)}
  {!blocked&&['requests.read','charges.read','charges.create','cash.open'].every(p=>context.permissions.includes(p))&&<DocumentCashQueue office={office} disabled={controlsBusy} onChanged={()=>setFinancialRevision(x=>x+1)} onDenied={status=>fail(new CashError(status))}/>}
  {blocked?<Link className="secondary-button" to={paths.account}>Verificar meu acesso</Link>:<>
   <div className="team-toolbar cash-toolbar"><div role="tablist" aria-label="Área do caixa" className="team-tabs">
    {mayCash&&<button role="tab" aria-selected={tab==='own'} disabled={controlsBusy} onClick={()=>changeTab('own')}>Meu caixa</button>}
    {canAll&&mayCash&&<button role="tab" aria-selected={tab==='all'} disabled={controlsBusy} onClick={()=>changeTab('all')}>Consolidação</button>}
    {canManage&&mayCash&&<button role="tab" aria-selected={tab==='configuration'} disabled={controlsBusy} onClick={()=>changeTab('configuration')}>Configuração</button>}
    {canCharges&&<button role="tab" aria-selected={tab==='charges'} disabled={controlsBusy} onClick={()=>changeTab('charges')}>Cobranças</button>}
    <button role="tab" aria-selected={tab==='approvals'} disabled={controlsBusy} onClick={()=>changeTab('approvals')}>Autorizações</button>
    {canExpenses&&<button role="tab" aria-selected={tab==='expenses'} disabled={controlsBusy} onClick={()=>changeTab('expenses')}>Despesas e movimentações</button>}
    {canReports&&<button role="tab" aria-selected={tab==='reports'} disabled={controlsBusy} onClick={()=>changeTab('reports')}>Relatórios financeiros</button>}
   </div><button className="operation-icon-button" disabled={controlsBusy||reading||configReading||referencesReading} aria-label="Atualizar caixa" title="Atualizar caixa" onClick={()=>{setIssues({});setRevision(n=>n+1);}}><RefreshCw size={19} aria-hidden="true"/></button></div>
   {tab==='approvals'?<ApprovalsPanel office={office} activeSessionId={openOwnSession?.id??null} highlightApprovalId={navState?.approval_id} onChanged={()=>setFinancialRevision(x=>x+1)} onOpenCash={mayCash?()=>changeTab('own'):undefined}/>:['charges','expenses','reports'].includes(tab)?(tab==='charges'&&canCharges?<ChargesPage embedded office={office}/>:tab==='expenses'&&canExpenses?<ExpensesPage embedded office={office}/>:tab==='reports'&&canReports?<ReportsPage embedded office={office}/>:null):statement?<CashStatement closureIntent={closureIntent} onClosureTools={setClosureTools} office={office} sessionId={statement} configuration={openingOptions} preselectedCharge={preselectedCharge} autoOpenRecord={autoOpenRecord} onAutoOpenConsumed={()=>setAutoOpenRecord(false)} onBack={()=>{setStatement(undefined);setAutoOpenRecord(false);}} onBusy={setStatementBusy} onChanged={()=>setFinancialRevision(x=>x+1)}/>:tab==='configuration'?(
    !canManage?<div className="cash-setup-notice" role="alert"><p className="customer-note">Seu perfil não possui permissão para alterar a configuração financeira deste escritório.</p></div>:
    (issues.configuration||issues.references)?<div className="cash-setup-notice" role="alert"><p className="form-feedback error">{(issues.configuration??issues.references)?.message}</p><button type="button" className="secondary-button" disabled={configReading} onClick={()=>{setIssues({});setRevision(n=>n+1);}}>Tentar novamente</button></div>:
    !configuration||!openingOptions?<p className="customer-note">Carregando configuração financeira...</p>:
    <CashConfigurationPanel key={office} data={configuration} references={openingOptions} sessions={data?.sessions??[]} busy={busy||referencesReading||configReading} size={size} onSave={configure} onClear={()=>{setIssues({});setFeedback('');}} onPage={setConfigPage} onUnit={id=>{setUnitFilter(id);setConfigPage(1);}} pending={configReading} onGoOpenCash={()=>changeTab('own')}/>
   ):<>
    {tab==='own'&&canRecordPayment&&openingOptions&&<div className="jn-manual-cash-banner">
     <div>
      <strong>Informar pagamento manualmente</strong>
      <p className="customer-note">{(!readiness.setup_complete||openOwnSession&&!readiness.ready_to_record)?MANUAL_PAYMENT_SETUP_GUIDANCE:openOwnSession?`Caixa aberto em ${openOwnSession.unit_name}. Informe pagamentos presenciais, Pix manual, boleto, cartão avulso ou transferência diretamente no extrato.`:'Abra seu caixa individual abaixo para informar ou solicitar a confirmação de pagamentos manuais.'}</p>
     </div>
     <div className="account-actions">
      {(!readiness.setup_complete||openOwnSession&&!readiness.ready_to_record)?(canManage&&<button type="button" className="primary-button" disabled={controlsBusy} onClick={()=>changeTab('configuration')}><Settings size={17} aria-hidden="true"/>Configurar financeiro</button>):openOwnSession?<button type="button" className="primary-button" disabled={controlsBusy} onClick={openManualPaymentInCash}><Banknote size={17} aria-hidden="true"/>Informar pagamento manualmente</button>:null}
     </div>
    </div>}
    {tab==='own'&&shown&&openingOptions&&shown.can_open&&<CashOpeningForm canManage={canManage} onConfigure={id=>{setConfigPage(1);setUnitFilter(id??null);changeTab('configuration');}} configuration={openingOptions} sessions={shown.sessions} busy={busy||referencesReading} onOpen={open} onClear={()=>{setIssues({});setFeedback('');}}/>}
    {tab==='own'&&shown&&!shown.can_open&&<p className="customer-note">Você pode consultar seu caixa. A abertura exige autorização do escritório.</p>}
    <form className="cash-list-filters" onSubmit={e=>{e.preventDefault();setFilters({...filterDraft,query:filterDraft.query.trim()});setPage(1);}}><label className="team-field">Unidade dos caixas<select value={filterDraft.unit_id??''} disabled={controlsBusy} onChange={e=>setFilterDraft(v=>({...v,unit_id:e.target.value||null}))}><option value="">Todas as unidades</option>{openingOptions?.units.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label><label className="team-field">Situação<select value={filterDraft.status} disabled={controlsBusy} onChange={e=>setFilterDraft(v=>({...v,status:e.target.value as CashFilters['status']}))}><option value="all">Todos</option><option value="open">Abertos</option><option value="closed">Fechados</option></select></label><label className="team-field">Operador ou conta<input value={filterDraft.query} maxLength={120} onChange={e=>setFilterDraft(v=>({...v,query:e.target.value}))}/></label><button className="secondary-button" disabled={busy||reading}>Filtrar caixas</button></form>
    {shown?.summary&&<dl className="cash-totals"><div><dt>Caixas no filtro</dt><dd>{shown.summary.open} abertos · {shown.summary.closed} fechados</dd></div><div><dt>Saldo histórico em espécie</dt><dd>{cashMoney(shown.summary.numerario_cents)}</dd></div><div><dt>Recebimentos líquidos</dt><dd>{cashMoney(shown.summary.received_cents)}</dd></div></dl>}
    {shown&&<><CashSessions data={shown} size={size} onStatement={setStatement}/><nav className="team-pagination" aria-label="Paginação de caixas"><button className="team-text-button" disabled={busy||reading||shown.page<=1} onClick={()=>setPage(shown.page-1)}>Anterior</button><span>{shown.page}/{Math.max(1,Math.ceil(shown.total/size))} · {shown.total} caixas</span><button className="team-text-button" disabled={busy||reading||shown.page*size>=shown.total} onClick={()=>setPage(shown.page+1)}>Próxima</button></nav></>}
   </>}

  </>}
 </div></OperationLayout>;
}
