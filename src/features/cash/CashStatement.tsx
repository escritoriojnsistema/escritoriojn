import {useCallback,useEffect,useRef,useState,type FormEvent} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,RefreshCw} from 'lucide-react';
import type {CashConfiguration} from '../../../shared/cash';
import {cashAmountToCents} from '../../../shared/cash';
import type {FinanceOperation,FinanceStatement} from '../../../shared/finance';
import {paths} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {noticesChanged} from '../notifications/api';
import {cashApi,cashError,CashError} from './api';
import {cashMoney} from './CashSessions';
import {CashPaymentsPanel} from './CashPaymentsPanel';
import {CashCorrectionsPanel} from './CashCorrectionsPanel';
const entryNames={received:'Pagamento recebido',refunded:'Reembolso',reversed:'Devolução com estorno (legado)',allocation_reversed:'Alocação estornada',refund_paid:'Devolução efetiva',reconciled:'Conciliação',closed:'Fechamento'};
type Mode='reconcile'|'close';
type Props={office:string;sessionId:string;configuration?:CashConfiguration;onBack:()=>void;onBusy:(busy:boolean)=>void;onChanged:()=>void};
export function CashStatement(props:Props){
 const auth=useAuth(),context=auth.contexts.find(c=>c.office_id===props.office&&c.role_code!=='client');
 const scope=JSON.stringify([auth.sessionKey,props.office,props.sessionId,context?.user_id,context?.role_code,[...(context?.permissions??[])].sort()]);
 return <CashStatementView key={scope} {...props}/>;
}
function CashStatementView({office,sessionId,configuration,onBack,onBusy,onChanged}:Props){
 const auth=useAuth(),context=auth.contexts.find(c=>c.office_id===office&&c.role_code!=='client');
 const viewId=sessionId;
 const [data,setData]=useState<FinanceStatement>(),[error,setError]=useState<CashError>(),[page,setPage]=useState(1),[revision,setRevision]=useState(0),[reading,setReading]=useState(false),[busy,setBusy]=useState(false),[feedback,setFeedback]=useState('');
 const [mode,setMode]=useState<Mode>(),[amount,setAmount]=useState(''),[reason,setReason]=useState(''),[paymentEditing,setPaymentEditing]=useState(false),[correctionEditing,setCorrectionEditing]=useState(false);
 const attempt=useRef<{signature:string;operation:FinanceOperation}|undefined>(undefined),mutation=useRef<AbortController|null>(null),alive=useRef(true),readAbort=useRef<AbortController|null>(null);
 const blocked=error?.status===401||error?.status===403;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort();readAbort.current?.abort();onBusy(false);};},[onBusy]);
 useEffect(()=>{if(blocked)return;const c=new AbortController();readAbort.current=c;setReading(true);void cashApi.statement(office,viewId,page,c.signal).then(v=>{if(!c.signal.aborted){setData(v);setError(undefined);}}).catch(cause=>{if(!c.signal.aborted){const e=cashError(cause);setError(e);if([401,403,404].includes(e.status))setData(undefined);}}).finally(()=>{if(!c.signal.aborted)setReading(false);});return()=>c.abort();},[office,viewId,page,revision,blocked]);
 const paymentBusy=useCallback((next:boolean)=>{if(next){readAbort.current?.abort();setReading(false);}setBusy(next);onBusy(next);},[onBusy]);
 const s=data?.session;
 const canOperate=s?.is_self&&s.status==='open'&&s.can_operate&&context?.permissions.includes('cash.open');
 const canRefund=s?.is_self&&s.status==='open'&&s.can_refund&&['cash.open','charges.adjust','charges.read','requests.read'].every(permission=>context?.permissions.includes(permission));
 const editing=paymentEditing||correctionEditing;
 function cancel(){setMode(undefined);setAmount('');setReason('');setFeedback('');attempt.current=undefined;}
 async function submit(e:FormEvent){
  e.preventDefault();if(busy||blocked||!s||!mode||!canOperate)return;
  const cents=cashAmountToCents(amount),target=s;
  if(cents===null||!target||reason.trim().length<5){setFeedback('Confira o valor, a seleção e o motivo (mínimo de cinco caracteres).');return;}
  const details={kind:mode,counted_cents:cents,reason:reason.trim()};
  const signature=JSON.stringify([target.id,details]);if(attempt.current?.signature!==signature)attempt.current={signature,operation:{...details,session_id:target.id,expected_version:target.version,idempotency_key:crypto.randomUUID()} as FinanceOperation};
  const c=new AbortController();mutation.current=c;readAbort.current?.abort();setReading(false);setBusy(true);onBusy(true);setError(undefined);setFeedback('');
  try{const v=await cashApi.operate(office,attempt.current.operation,c.signal);if(!c.signal.aborted){cancel();setData(v);setPage(1);setFeedback('Operação registrada e saldos atualizados.');onChanged();noticesChanged();}}
  catch(cause){if(!c.signal.aborted){const error=cashError(cause);setError(error);if([401,403,404].includes(error.status)){setData(undefined);}else if(error.status===409){cancel();setRevision(n=>n+1);setFeedback('O estado mudou. Confira o extrato atualizado e selecione novamente a operação.');}}}
  finally{if(alive.current){mutation.current=null;setBusy(false);onBusy(false);}}
 }
 return <section className="cash-statement" aria-label="Extrato e operações do caixa"><div className="team-section-heading"><button type="button" className="team-text-button" disabled={busy} onClick={onBack}><ArrowLeft size={17} aria-hidden="true"/>Voltar aos caixas</button><button type="button" className="operation-icon-button" aria-label="Atualizar extrato" disabled={busy||reading||blocked} onClick={()=>setRevision(n=>n+1)}><RefreshCw size={18} aria-hidden="true"/></button></div>
 {error&&<p className="form-feedback error" role="alert">{error.message}</p>}{feedback&&<p className="form-feedback" role="status">{feedback}</p>}
 {s&&!blocked&&<>{editing?<details className="cash-editing-summary"><summary>{s.unit_name} · Espécie {cashMoney(s.cash_cents)} · {s.status==='open'?'Caixa aberto':'Caixa fechado'}</summary> <dl className="cash-totals finance-totals"><div><dt>Fundo inicial</dt><dd>{cashMoney(s.opening_cents)}</dd></div><div><dt>Saldo em espécie</dt><dd>{cashMoney(s.cash_cents)}</dd></div><div><dt>Recebimentos brutos</dt><dd>{cashMoney(s.received_cents)}</dd></div><div><dt>Devoluções efetivas</dt><dd>{cashMoney(s.refunded_cents)}</dd></div><div><dt>Recebimentos digitais</dt><dd>{cashMoney(s.digital_cents)}</dd></div><div><dt>Recebido após devoluções</dt><dd>{cashMoney(s.received_cents-s.refunded_cents)}</dd></div></dl></details>:<><h2>{s.unit_name} · {s.status==='open'?'Caixa aberto':'Caixa fechado'}</h2><p className="customer-note">{s.is_self?'Minha operação':s.operator_name} · Abertura {new Date(s.opened_at).toLocaleString('pt-BR')}{s.closed_at&&` · Fechamento ${new Date(s.closed_at).toLocaleString('pt-BR')}`}</p>
 <dl className="cash-totals finance-totals"><div><dt>Fundo inicial</dt><dd>{cashMoney(s.opening_cents)}</dd></div><div><dt>Saldo em espécie</dt><dd>{cashMoney(s.cash_cents)}</dd></div><div><dt>Recebimentos brutos</dt><dd>{cashMoney(s.received_cents)}</dd></div><div><dt>Devoluções efetivas</dt><dd>{cashMoney(s.refunded_cents)}</dd></div><div><dt>Recebimentos digitais</dt><dd>{cashMoney(s.digital_cents)}</dd></div><div><dt>Recebido após devoluções</dt><dd>{cashMoney(s.received_cents-s.refunded_cents)}</dd></div></dl>
 <p className="customer-note">Registros manuais confirmados pelo operador. PIX, cartão e transferências permanecem fora do saldo em espécie.</p>
</>}
 {correctionEditing&&<CashCorrectionsPanel office={office} statement={data} disabled={busy||reading} onBusy={paymentBusy} onCancel={()=>setCorrectionEditing(false)} onChanged={(value,message)=>{setData(value);setPage(value.page);setCorrectionEditing(false);setFeedback(message);onChanged();noticesChanged();}} onRefresh={()=>setRevision(n=>n+1)} onUnavailable={issue=>{readAbort.current?.abort();setReading(false);setError(issue);setCorrectionEditing(false);setData(undefined);}}/>}
 {!editing&&(!s.is_self||s.status==='closed')&&<p className="customer-note">Para corrigir um pagamento deste histórico, volte aos caixas e use Corrigir pagamento no seu próprio caixa aberto da mesma unidade.</p>}
 <CashPaymentsPanel key={s.id} office={office} statement={data} configuration={configuration} disabled={busy||reading||!!mode||correctionEditing} hidden={correctionEditing} actions={canOperate&&!mode?<><button type="button" className="secondary-button" disabled={busy} onClick={()=>{cancel();setMode('reconcile');setAmount((s.cash_cents/100).toFixed(2).replace('.',','));}}>Conciliar caixa</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{cancel();setMode('close');setAmount((s.cash_cents/100).toFixed(2).replace('.',','));}}>Fechar caixa</button></>:undefined} onCorrect={canRefund&&!mode?()=>{setFeedback('');setCorrectionEditing(true);}:undefined} onBusy={paymentBusy} onEditing={setPaymentEditing} onChanged={value=>{setData(value);setPage(value.page);setFeedback('');onChanged();noticesChanged();}} onRefresh={()=>setRevision(n=>n+1)} onUnavailable={issue=>{readAbort.current?.abort();setReading(false);setError(issue);cancel();setData(undefined);}}/>

 {mode&&<form onSubmit={submit} className="finance-operation" noValidate><h3>{mode==='reconcile'?'Conferir espécie':'Encerrar caixa'}</h3>
  <fieldset disabled={busy}><div className="cash-config-grid"><label className="team-field">{mode==='reconcile'||mode==='close'?'Espécie contada (R$)':'Valor (R$)'}<input inputMode="decimal" maxLength={14} value={amount} onChange={e=>setAmount(e.target.value)}/></label><label className="team-field">Motivo da operação<textarea value={reason} maxLength={500} rows={2} onChange={e=>setReason(e.target.value)}/></label></div></fieldset>
  {(mode==='reconcile'||mode==='close')&&<p className="customer-note">Esperado: {cashMoney(s.cash_cents)} · Diferença: {cashAmountToCents(amount)===null?'Confira o valor':cashMoney(cashAmountToCents(amount)!-s.cash_cents)}. A diferença será registrada e não altera o saldo. {mode==='close'?'O caixa encerrado não aceita novos lançamentos.':''}</p>}
  <p className="customer-note">Confira o dinheiro físico antes de confirmar.</p><div className="account-actions"><button className="primary-button" disabled={busy}>Confirmar {mode==='reconcile'?'conciliação':'fechamento'}</button><button type="button" className="secondary-button" disabled={busy} onClick={cancel}>Cancelar</button></div>
 </form>}
 {!editing&&<><div className="team-section-heading"><h3>Extrato</h3></div>{!data.entries.length?<p className="team-empty">Nenhuma operação após a abertura.</p>:<ul className="finance-ledger">{data.entries.map(e=><li key={e.id}><div className="cash-session-heading"><strong>{entryNames[e.kind]}</strong><span>{cashMoney(e.amount_cents)}</span></div><p className="customer-note">{new Date(e.created_at).toLocaleString('pt-BR')}{e.protocol&&` · ${e.protocol}`}{e.payment_method_name&&` · ${e.payment_method_name}`}{e.account_name&&` · ${e.account_name}`}</p>{e.kind==='allocation_reversed'&&<p className="customer-note">Estorno lógico da quitação, sem registro de saída de dinheiro.</p>}{e.kind==='refund_paid'&&<p className="customer-note">Devolução efetiva, sem novo estorno da quitação.</p>}{e.counted_cents!==null&&<p className="customer-note">Contado {cashMoney(e.counted_cents)} · Esperado {cashMoney(e.expected_cents??0)} · Diferença {cashMoney(e.counted_cents-(e.expected_cents??0))}</p>}<details><summary>Detalhes da operação</summary><p>{e.reason}</p>{e.original_entry_id&&<small>Operação original: {e.original_entry_id}</small>}{e.request_id&&<Link className="team-text-button" to={paths.requests} state={{office_id:office,request_id:e.request_id}}>Consultar {e.protocol}</Link>}<small>Referência: {e.id}</small></details></li>)}</ul>}
 <nav className="team-pagination" aria-label="Paginação do extrato"><button type="button" className="team-text-button" disabled={busy||reading||page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</button><span>{data.total} operações · {page}/{Math.max(1,Math.ceil(data.total/5))}</span><button type="button" className="team-text-button" disabled={busy||reading||page*5>=data.total} onClick={()=>setPage(p=>p+1)}>Próxima</button></nav></>}</>}
 </section>;
}
