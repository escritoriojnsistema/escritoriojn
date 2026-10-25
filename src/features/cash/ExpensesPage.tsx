import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {RefreshCw} from 'lucide-react';
import type {AccessContext} from '../../../shared/access';
import type {CashDashboard} from '../../../shared/cash';
import {cashAmountToCents} from '../../../shared/cash';
import type {Expense,ExpenseOperation,Finance17Page,TransferOperation} from '../../../shared/expenses';
import {validExpenseOperation,validTransferOperation} from '../../../shared/expenses';
import type {FinanceSession} from '../../../shared/finance';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {OperationHeading,OperationLayout} from '../operation/OperationLayout';
import {OperationalFeedback} from '../operation/OperationalAccess';
import {cashApi,cashError,type CashError} from './api';
import {cashMoney} from './CashSessions';
import '../team/team.css';
import '../customers/customers.css';
import './cash.css';
type Editor={kind:'create'}|{kind:'approve'|'pay';expense:Expense}|{kind:'movement'};
const names={pending:'Aguardando aprovação',approved:'Aprovada',paid:'Paga'};
const movementNames={sangria:'Sangria',reforco:'Reforço',transfer:'Transferência'};
export default function ExpensesPage(){
 const auth=useAuth(),[office,setOffice]=useState('');
 const contexts=auth.contexts.filter(c=>c.role_code!=='client'&&c.permissions.includes('cash.read')&&['expenses.read','cash.transfer'].some(p=>c.permissions.includes(p)));
 const context=contexts.find(c=>c.office_id===office)??contexts[0];
 if(auth.status==='loading')return <OperationalFeedback status="loading"/>;
 if(auth.status==='signedOut'||auth.status==='expired')return <Navigate replace to={paths.team}/>;
 if(auth.status!=='authorized'||!context)return <OperationalFeedback status={auth.status==='unavailable'?'unavailable':'denied'}/>;
 return <ExpensesWorkspace key={JSON.stringify([auth.sessionKey,context.office_id,context.role_code,[...context.permissions].sort()])} context={context} contexts={contexts} onOffice={setOffice}/>;
}
function ExpensesWorkspace({context,contexts,onOffice}:{context:AccessContext;contexts:AccessContext[];onOffice:(id:string)=>void}){
 const office=context.office_id,mayRead=context.permissions.includes('expenses.read'),mayTransfer=context.permissions.includes('cash.transfer');
 const [tab,setTab]=useState<'expenses'|'transfers'>(mayRead?'expenses':'transfers'),[data,setData]=useState<Finance17Page>(),[dashboard,setDashboard]=useState<CashDashboard>(),[session,setSession]=useState<FinanceSession>(),[sessionId,setSessionId]=useState(''),[sessionPage,setSessionPage]=useState(1),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [editor,setEditor]=useState<Editor>(),[category,setCategory]=useState(''),[payee,setPayee]=useState(''),[description,setDescription]=useState(''),[date,setDate]=useState(''),[amount,setAmount]=useState(''),[evidence,setEvidence]=useState(''),[reason,setReason]=useState(''),[kind,setKind]=useState<TransferOperation['kind']>('sangria'),[source,setSource]=useState(''),[destination,setDestination]=useState(''),[account,setAccount]=useState('');
 const [busy,setBusy]=useState(false),[reading,setReading]=useState(false),[error,setError]=useState<CashError>(),[sessionError,setSessionError]=useState<CashError>(),[feedback,setFeedback]=useState('');
 const alive=useRef(true),mutation=useRef<AbortController|null>(null),read=useRef<AbortController|null>(null),heading=useRef<HTMLHeadingElement>(null),attempt=useRef<{signature:string;operation:ExpenseOperation|TransferOperation}|undefined>(undefined);
 const blocked=[error?.status,sessionError?.status].some(s=>s===401||s===403);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort();read.current?.abort();};},[]);
 function fail(cause:unknown,fromSession=false){const e=cashError(cause);if(fromSession)setSessionError(e);else setError(e);if([401,403].includes(e.status)){read.current?.abort();setData(undefined);setSession(undefined);setDashboard(undefined);reset();}else if(e.status===404){setData(undefined);setSession(undefined);reset();}}
 useEffect(()=>{
  if(blocked)return;const c=new AbortController();
  void cashApi.dashboard(office,'own',sessionPage,5,c.signal).then(v=>{if(!c.signal.aborted){setDashboard(v);setSessionError(undefined);setSessionId(old=>v.sessions.some(s=>s.id===old)?old:(v.sessions.find(s=>s.status==='open')?.id??''));}}).catch(e=>{if(!c.signal.aborted)fail(e,true);});return()=>c.abort();
 },[office,sessionPage,blocked]);
 useEffect(()=>{
  if(blocked||!dashboard||mutation.current)return;const c=new AbortController();read.current=c;setReading(true);
  void Promise.all([cashApi.finance17(office,sessionId||null,page,c.signal),sessionId?cashApi.statement(office,sessionId,1,c.signal):Promise.resolve(undefined)]).then(([v,s])=>{if(!c.signal.aborted){setData(v);setSession(s?.session);setError(undefined);}}).catch(e=>{if(!c.signal.aborted)fail(e);}).finally(()=>{if(!c.signal.aborted)setReading(false);});return()=>c.abort();
 },[office,sessionId,page,revision,dashboard,blocked]);
 useEffect(()=>{if(editor)heading.current?.focus();},[editor?.kind]);
 function reset(){setEditor(undefined);setCategory('');setPayee('');setDescription('');setDate('');setAmount('');setEvidence('');setReason('');setSource('');setDestination('');setAccount('');setKind('sangria');attempt.current=undefined;}
 function start(value:Editor){if(busy||reading||blocked)return;reset();setFeedback('');setError(undefined);setEditor(value);}
 const ownOpen=session?.is_self&&session.status==='open'&&session.can_operate&&context.permissions.includes('cash.open');
 const accounts=(data?.accounts??[]).filter(a=>a.unit_id===session?.unit_id);
 const cashAccount=session?.cash_account_id??dashboard?.sessions.find(s=>s.id===sessionId)?.cash_account_id;
 async function submit(event:FormEvent){
  event.preventDefault();if(busy||mutation.current||blocked||!editor||!data)return;
  const cents=cashAmountToCents(amount),base={evidence:evidence.trim()};let details:Record<string,unknown>;
  if(editor.kind==='create')details={...base,kind:'create',category:category.trim(),payee:payee.trim(),description:description.trim(),due_date:date,amount_cents:cents};
  else if(editor.kind==='approve')details={...base,kind:'approve',expense_id:editor.expense.id,expected_version:editor.expense.version};
  else if(editor.kind==='pay'){if(!ownOpen||!session)return;details={...base,kind:'pay',expense_id:editor.expense.id,expected_version:editor.expense.version,session_id:session.id,expected_session_version:session.version,account_id:account};}
  else {if(!ownOpen||!session)return;details={...base,kind,session_id:session.id,expected_session_version:session.version,source_account_id:kind==='sangria'?cashAccount:source,destination_account_id:kind==='reforco'?cashAccount:destination,amount_cents:cents,reason:reason.trim()};}
  const signature=JSON.stringify(details),operation=attempt.current?.signature===signature?attempt.current.operation:{...details,idempotency_key:crypto.randomUUID()};
  const movement=editor.kind==='movement';if(!(movement?validTransferOperation(operation):validExpenseOperation(operation))){setFeedback('Confira os campos, o valor positivo, as contas distintas e a evidência (5 a 500 caracteres).');return;}
  attempt.current={signature,operation:operation as ExpenseOperation|TransferOperation};const c=new AbortController();mutation.current=c;read.current?.abort();setReading(false);setBusy(true);setError(undefined);setFeedback('');
  try{
   if(movement){const result=await cashApi.transfer(office,operation as TransferOperation,c.signal);if(c.signal.aborted||!alive.current)return;setData(old=>old?{...old,transfers:[result.transfer,...old.transfers].slice(0,5),transfers_total:old.transfers_total+1}:old);}
   else {const result=await cashApi.expense(office,operation as ExpenseOperation,c.signal);if(c.signal.aborted||!alive.current)return;setData(old=>old?{...old,expenses:editor.kind==='create'?[result.expense,...old.expenses].slice(0,5):old.expenses.map(e=>e.id===result.expense.id?result.expense:e),total:old.total+(editor.kind==='create'?1:0)}:old);}
   reset();setPage(1);setFeedback(movement?'Movimentação registrada com saída e entrada vinculadas, sem nova receita.':'Despesa registrada. Histórico e comprovantes preservados.');setRevision(n=>n+1);
  }catch(cause){if(!c.signal.aborted&&alive.current){const e=cashError(cause);fail(e);if(e.status===409){reset();setRevision(n=>n+1);setFeedback('O estado mudou. Confira os dados atualizados e selecione novamente a operação.');}}}
  finally{if(alive.current){mutation.current=null;setBusy(false);}}
 }
 return <OperationLayout busy={busy}><div className="cash-main team-main expense-main">
  <OperationHeading context={context} showRole={false} title="Despesas e movimentações" description="Contas a pagar, saídas e transferências vinculadas."/>
  {contexts.length>1&&!editor&&<label className="team-field team-office">Escritório<select disabled={busy} value={office} onChange={e=>onOffice(e.target.value)}>{contexts.map(c=><option value={c.office_id} key={c.office_id}>{c.office_name}</option>)}</select></label>}
  {error&&<p role="alert" className="form-feedback error">{error.message}</p>}{sessionError&&<p role="alert" className="form-feedback error">{sessionError.message}</p>}{feedback&&<p role="status" className="form-feedback">{feedback}</p>}
  {blocked?<Link className="secondary-button" to={paths.account}>Verificar meu acesso</Link>:<>
   {!editor&&<div className="team-toolbar"><div className="team-tabs" role="tablist" aria-label="Área financeira">{mayRead&&<button role="tab" aria-selected={tab==='expenses'} disabled={busy} onClick={()=>{setTab('expenses');setPage(1);}}>Despesas</button>}{mayTransfer&&<button role="tab" aria-selected={tab==='transfers'} disabled={busy} onClick={()=>{setTab('transfers');setPage(1);}}>Movimentação</button>}</div><button className="operation-icon-button" aria-label="Atualizar despesas e movimentos" disabled={busy||reading} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={18} aria-hidden="true"/></button></div>}
   {(!editor||editor.kind==='pay'||editor.kind==='movement')&&<section className="expense-session" aria-label="Sessão para saídas">{editor&&session?<p className="customer-note">{session.unit_name} · Espécie {cashMoney(session.cash_cents)}</p>:<><label className="team-field">Meu caixa<select disabled={busy||!!editor} value={sessionId} onChange={e=>{setSessionId(e.target.value);setPage(1);setSession(undefined);}}><option value="">Sem caixa selecionado</option>{dashboard?.sessions.map(s=><option key={s.id} value={s.id}>{s.unit_name} · {s.status==='open'?'Aberto':'Fechado'} · {s.account_name}</option>)}</select></label>{session&&<p className="customer-note">Espécie disponível: <strong>{cashMoney(session.cash_cents)}</strong>. Somente seu caixa aberto permite saídas. A conta de origem precisa ter fundos registrados nesta sessão.</p>}{dashboard&&dashboard.total>5&&!editor&&<nav className="team-pagination" aria-label="Páginas dos meus caixas"><button disabled={busy||reading||sessionPage===1} onClick={()=>setSessionPage(n=>n-1)}>Anterior</button><span>{sessionPage}/{Math.ceil(dashboard.total/5)}</span><button disabled={busy||reading||sessionPage*5>=dashboard.total} onClick={()=>setSessionPage(n=>n+1)}>Próxima</button></nav>}</>}</section>}
   {editor?<form className="finance-operation expense-editor" onSubmit={submit} onKeyDown={e=>{if(e.key==='Escape'&&!busy)reset();}} noValidate>
    <h2 ref={heading} tabIndex={-1}>{editor.kind==='create'?'Nova despesa':editor.kind==='approve'?'Aprovar despesa':editor.kind==='pay'?'Pagar despesa':'Nova movimentação'}</h2>
    {(editor.kind==='approve'||editor.kind==='pay')&&<p className="customer-note">{editor.expense.payee} · {editor.expense.description} · {cashMoney(editor.expense.amount_cents)}</p>}
    <fieldset disabled={busy}><div className="cash-config-grid expense-fields">
     {editor.kind==='create'&&<><label className="team-field">Categoria<input maxLength={120} value={category} onChange={e=>setCategory(e.target.value)}/></label><label className="team-field">Favorecido<input maxLength={120} value={payee} onChange={e=>setPayee(e.target.value)}/></label><label className="team-field expense-wide">Descrição<input maxLength={300} value={description} onChange={e=>setDescription(e.target.value)}/></label><label className="team-field">Vencimento<input type="date" min="1900-01-01" max="9999-12-31" value={date} onChange={e=>setDate(e.target.value)}/></label></>}
     {editor.kind==='movement'&&<><label className="team-field">Tipo de movimentação<select value={kind} onChange={e=>{setKind(e.target.value as TransferOperation['kind']);setSource('');setDestination('');}}><option value="sangria">Sangria</option><option value="reforco">Reforço</option><option value="transfer">Transferência entre contas</option></select></label>{kind!=='sangria'&&<label className="team-field">Conta de origem<select value={source} onChange={e=>setSource(e.target.value)}><option value="">Selecione</option>{accounts.filter(a=>kind!=='reforco'||a.id!==cashAccount).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}{kind!=='reforco'&&<label className="team-field">Conta de destino<select value={destination} onChange={e=>setDestination(e.target.value)}><option value="">Selecione</option>{accounts.filter(a=>a.id!==(kind==='sangria'?cashAccount:source)).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}</>}
     {(editor.kind==='create'||editor.kind==='movement')&&<label className="team-field">Valor (R$)<input inputMode="decimal" maxLength={14} value={amount} onChange={e=>setAmount(e.target.value)}/></label>}
     {editor.kind==='pay'&&<label className="team-field expense-wide">Conta de pagamento<select value={account} onChange={e=>setAccount(e.target.value)}><option value="">Selecione</option>{accounts.filter(a=>a.type!=='cash'||a.id===cashAccount).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>}
     {editor.kind==='movement'&&<label className="team-field">Motivo<textarea rows={2} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
     <label className={`team-field ${editor.kind==='movement'?'':'expense-wide'}`}>Comprovante / evidência<textarea rows={2} maxLength={500} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Referência do comprovante e conferência realizada"/></label>
    </div></fieldset>
    <div className="account-actions"><button className="primary-button" disabled={busy}>{editor.kind==='create'?'Registrar despesa':editor.kind==='approve'?'Confirmar aprovação':editor.kind==='pay'?'Confirmar pagamento da despesa':'Confirmar movimentação'}</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{reset();setFeedback('');}}>Cancelar</button></div>
    <p className="customer-note">{editor.kind==='movement'?'Registre somente uma transferência já realizada e conferida. Nenhum valor é enviado automaticamente.':editor.kind==='create'?'O registro fica pendente até aprovação. O comprovante textual não confirma pagamento.':'Confira o comprovante antes de confirmar. A decisão e a evidência serão preservadas.'}</p>
   </form>:data&&<section aria-label={tab==='expenses'?'Contas a pagar':'Transferências'}>
    <div className="team-section-heading"><h2>{tab==='expenses'?'Contas a pagar':'Movimentações'}</h2>{tab==='expenses'&&data.can_create&&<button className="primary-button" disabled={busy||reading} onClick={()=>start({kind:'create'})}>Nova despesa</button>}{tab==='transfers'&&data.can_transfer&&<button className="primary-button" disabled={busy||reading||!ownOpen} onClick={()=>start({kind:'movement'})}>Nova movimentação</button>}</div>
    {data.accounts_total>data.accounts.length&&<p className="form-feedback">{data.accounts.length} de {data.accounts_total} contas disponíveis. Consulte a configuração do Caixa para a conta que não aparece.</p>}
    {tab==='expenses'?(!data.expenses.length?<p className="team-empty">Nenhuma conta a pagar registrada.</p>:<ul className="finance-ledger" aria-label="Despesas registradas">{data.expenses.map(e=><li key={e.id}><div className="cash-session-heading"><strong>{e.payee} · {cashMoney(e.amount_cents)}</strong><span>{names[e.status]}</span></div><p className="customer-note">{e.category} · Vencimento {e.due_date.split('-').reverse().join('/')} · {e.description}</p><details><summary>Comprovantes e histórico</summary><p>Registro: {e.evidence}</p>{e.approval_evidence&&<p>Aprovação: {e.approval_evidence} · {e.approved_at&&new Date(e.approved_at).toLocaleString('pt-BR')}</p>}{e.payment_evidence&&<p>Pagamento: {e.payment_evidence} · {e.paid_at&&new Date(e.paid_at).toLocaleString('pt-BR')}</p>}</details>{e.status==='pending'&&data.can_approve&&<button className="team-text-button" disabled={busy||reading} onClick={()=>start({kind:'approve',expense:e})}>Aprovar despesa</button>}{e.status==='approved'&&data.can_pay&&<button className="team-text-button" disabled={busy||reading||!ownOpen} onClick={()=>start({kind:'pay',expense:e})}>Pagar despesa</button>}</li>)}</ul>):(!data.transfers.length?<p className="team-empty">Nenhuma movimentação registrada neste caixa.</p>:<ul className="finance-ledger" aria-label="Movimentações registradas">{data.transfers.map(t=><li key={t.id}><div className="cash-session-heading"><strong>{movementNames[t.kind]}</strong><span>{cashMoney(t.amount_cents)}</span></div><p className="customer-note">{t.source_account_name} → {t.destination_account_name} · {new Date(t.created_at).toLocaleString('pt-BR')}</p><details><summary>Comprovante da movimentação</summary><p>{t.reason}</p><p>{t.evidence}</p><small>Referência vinculada: {t.id}</small></details></li>)}</ul>)}
    <nav className="team-pagination" aria-label="Paginação financeira"><button className="team-text-button" disabled={busy||reading||page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>{tab==='expenses'?data.total:data.transfers_total} registros · {page}/{Math.max(1,Math.ceil((tab==='expenses'?data.total:data.transfers_total)/5))}</span><button className="team-text-button" disabled={busy||reading||page*5>=(tab==='expenses'?data.total:data.transfers_total)} onClick={()=>setPage(n=>n+1)}>Próxima</button></nav>
   </section>}
  </>}
 </div></OperationLayout>;
}
