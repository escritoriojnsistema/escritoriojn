import {useEffect,useRef,useState,type FormEvent,type ReactNode} from 'react';
import type {CashConfiguration} from '../../../shared/cash';
import {cashAmountToCents,cashInteger} from '../../../shared/cash';
import type {FinanceCharge,FinanceCharges,FinanceStatement} from '../../../shared/finance';
import type {Payment,PaymentOperation,PaymentsPage} from '../../../shared/payments';
import {validPaymentOperation} from '../../../shared/payments';
import {useAuth} from '../auth/AuthProvider';
import {cashApi,cashError,type CashError} from './api';
import {cashMoney} from './CashSessions';

type Props={
 office:string;statement:FinanceStatement;configuration?:CashConfiguration;disabled:boolean;
 onBusy:(busy:boolean)=>void;onEditing:(editing:boolean)=>void;
 onChanged:(statement:FinanceStatement)=>void;onRefresh:()=>void;onUnavailable:(error:CashError)=>void;
 hidden?:boolean;onCorrect?:()=>void;actions?:ReactNode;
};
type AllocationDraft={charge:FinanceCharge;amount:string};
type Editor={kind:'record'}|{kind:'confirm'|'reject'|'settle';payment:Payment};
const paymentNames:Record<Payment['status'],string>={pending:'Pendente de confirmação',confirmed:'Confirmado',rejected:'Rejeitado',partially_reversed:'Alocação estornada parcialmente',reversed:'Alocação estornada integralmente'};
const methodNames:Record<Payment['payment_type'],string>={cash:'Dinheiro',pix:'PIX',card:'Cartão',transfer:'Transferência'};
const moneyInput=(cents:number)=>`${Math.trunc(cents/100)},${String(cents%100).padStart(2,'0')}`;
const knownMoney=(cents:number|null)=>cents===null?'Sem informação':cashMoney(cents);
const dateLabel=(date:string)=>date.split('-').reverse().join('/');

export function CashPaymentsPanel({office,statement,configuration,disabled,onBusy,onEditing,onChanged,onRefresh,onUnavailable,hidden=false,onCorrect,actions}:Props){
 const auth=useAuth(),context=auth.contexts.find(c=>c.office_id===office&&c.role_code!=='client'),s=statement.session;
 const [editor,setEditor]=useState<Editor>(),[pickerOpen,setPickerOpen]=useState(true),[allocations,setAllocations]=useState<AllocationDraft[]>([]),[methodId,setMethodId]=useState('');
 const [status,setStatus]=useState<'confirmed'|'pending'>('confirmed'),[presented,setPresented]=useState(''),[fee,setFee]=useState(''),[settlement,setSettlement]=useState<'pending'|'settled'>('pending'),[settledOn,setSettledOn]=useState(''),[reference,setReference]=useState(''),[evidence,setEvidence]=useState('');
 const [query,setQuery]=useState(''),[search,setSearch]=useState(''),[chargePage,setChargePage]=useState(1),[searchRevision,setSearchRevision]=useState(0),[candidates,setCandidates]=useState<FinanceCharges>(),[chargeReading,setChargeReading]=useState(false),[chargeError,setChargeError]=useState<CashError>();
 const [history,setHistory]=useState<PaymentsPage>(statement.payments??{items:[],total:0,page:1}),[historyReady,setHistoryReady]=useState(!!statement.payments),[historyReading,setHistoryReading]=useState(false),[historyError,setHistoryError]=useState<CashError>();
 const [busy,setBusy]=useState(false),[error,setError]=useState<CashError>(),[feedback,setFeedback]=useState(''),[validation,setValidation]=useState('');
 const mutation=useRef<AbortController|null>(null),historyRead=useRef<AbortController|null>(null),chargeRead=useRef<AbortController|null>(null),alive=useRef(true);
 const attempt=useRef<{signature:string;operation:PaymentOperation}|undefined>(undefined),restoreFocus=useRef(false);
 const callbacks=useRef({onBusy,onEditing,onUnavailable});callbacks.current={onBusy,onEditing,onUnavailable};
 const amountFocus=useRef<HTMLInputElement>(null),pickerFocus=useRef<HTMLInputElement>(null);
 const openButton=useRef<HTMLButtonElement>(null),editorHeading=useRef<HTMLHeadingElement>(null),panelHeading=useRef<HTMLHeadingElement>(null);
 const correctButton=useRef<HTMLButtonElement>(null),wasHidden=useRef(false);
 const hasAuthority=s.is_self&&['cash.open','charges.read','requests.read'].every(p=>context?.permissions.includes(p));
 const canRecord=hasAuthority&&s.status==='open'&&s.can_operate&&statement.can_receive;
 const locked=disabled||busy;
 const methods=configuration?.units.some(u=>u.id===s.unit_id&&u.active)?configuration.payment_methods.filter(m=>m.active&&m.unit_id===s.unit_id&&configuration.accounts.some(a=>a.id===m.destination_account_id&&a.unit_id===s.unit_id&&a.active&&(m.type==='cash'?a.type==='cash'&&a.id===s.cash_account_id:a.type!=='cash'))):[];
 const method=methods.find(m=>m.id===methodId)||(methodId===''?methods[0]:undefined);
 const total=allocations.reduce((sum,a)=>sum+(cashAmountToCents(a.amount)??0),0),totalValid=allocations.length>0&&cashInteger(total,1)&&allocations.every(a=>{const n=cashAmountToCents(a.amount);return n!==null&&cashInteger(n,1)&&n<=a.charge.balance_cents;});
 const presentedCents=cashAmountToCents(presented),feeCents=cashAmountToCents(fee);

 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort();historyRead.current?.abort();chargeRead.current?.abort();callbacks.current.onBusy(false);callbacks.current.onEditing(false);};},[]);
 useEffect(()=>{if(hidden){historyRead.current?.abort();chargeRead.current?.abort();setHistoryReading(false);setChargeReading(false);}else if(wasHidden.current){correctButton.current?.focus();if(!historyReady&&!statement.payments)loadHistory(1);}wasHidden.current=hidden;},[hidden]);
 useEffect(()=>{if(editor)editorHeading.current?.focus();else if(restoreFocus.current){restoreFocus.current=false;(openButton.current??panelHeading.current)?.focus();}},[editor]);
 useEffect(()=>{if(editor?.kind==='record'){if(pickerOpen)pickerFocus.current?.focus();else amountFocus.current?.focus();}},[editor?.kind,pickerOpen,allocations.length]);
 useEffect(()=>{if(statement.payments){historyRead.current?.abort();setHistoryReading(false);setHistory(statement.payments);setHistoryReady(true);setHistoryError(undefined);}else if(!hidden)loadHistory(1);},[statement]);
 function loadHistory(nextPage:number){
  historyRead.current?.abort();const c=new AbortController();historyRead.current=c;setHistoryReading(true);
  void cashApi.payments(office,s.id,nextPage,c.signal).then(v=>{if(!c.signal.aborted&&alive.current){setHistory(v);setHistoryReady(true);setHistoryError(undefined);}}).catch(cause=>{if(!c.signal.aborted&&alive.current){const e=cashError(cause);setHistoryError(e);if([401,403,404].includes(e.status))callbacks.current.onUnavailable(e);}}).finally(()=>{if(!c.signal.aborted&&alive.current)setHistoryReading(false);});
 }
 useEffect(()=>()=>historyRead.current?.abort(),[office,s.id]);
 useEffect(()=>{
  if(editor?.kind!=='record')return;
  const c=new AbortController();chargeRead.current=c;setChargeReading(true);setCandidates(undefined);setChargeError(undefined);
  void cashApi.eligibleCharges(office,search,chargePage,c.signal).then(v=>{if(!c.signal.aborted){setCandidates(v);}}).catch(cause=>{if(!c.signal.aborted){const e=cashError(cause);setChargeError(e);if([401,403,404].includes(e.status))callbacks.current.onUnavailable(e);}}).finally(()=>{if(!c.signal.aborted)setChargeReading(false);});
  return()=>c.abort();
 },[office,editor?.kind,search,chargePage,searchRevision]);

 function clearEditor(focus=false){
  setEditor(undefined);onEditing(false);setPickerOpen(true);setAllocations([]);setMethodId('');setStatus('confirmed');setPresented('');setFee('');setSettlement('pending');setSettledOn('');setReference('');setEvidence('');setQuery('');setSearch('');setChargePage(1);setCandidates(undefined);setChargeError(undefined);setValidation('');attempt.current=undefined;
  restoreFocus.current=focus;
 }
 function start(next:Editor){if(locked||mutation.current)return;clearEditor();setError(undefined);setFeedback('');setEditor(next);onEditing(true);}
 function addCharge(id:string){
  if(locked||allocations.length>=10||allocations.some(a=>a.charge.id===id))return;
  const charge=candidates?.items.find(c=>c.id===id&&c.balance_cents>0&&c.status==='open');
  if(charge){setAllocations(old=>[...old,{charge,amount:moneyInput(charge.balance_cents)}]);setPickerOpen(false);}
 }
 function searchCharges(){if(locked)return;setSearch(query.trim());setChargePage(1);setSearchRevision(n=>n+1);}
 async function submit(event:FormEvent){
  event.preventDefault();if(locked||mutation.current||!editor||!hasAuthority)return;
  let details:Omit<Extract<PaymentOperation,{kind:'record'}>,'session_id'|'expected_version'|'idempotency_key'|'evidence'>|{kind:'confirm'|'reject';payment_id:string}|{kind:'settle';payment_id:string;settled_on:string};
  if(editor.kind==='record'){
   if(!canRecord||!method||!totalValid||allocations.length>10){setValidation('Selecione de uma a dez cobranças e informe valores positivos até o saldo disponível.');return;}
   if(method.type==='cash'&&(presentedCents===null||!cashInteger(presentedCents,1)||presentedCents<total)){setValidation('Informe o valor apresentado em dinheiro, igual ou maior que o valor aplicado.');return;}
   if(method.type==='card'&&(feeCents===null||!cashInteger(feeCents)||feeCents>total)){setValidation('Informe a taxa do cartão, de zero até o valor bruto.');return;}
   details={kind:'record',payment_method_id:method.id,status,allocations:allocations.map(a=>({charge_id:a.charge.id,expected_charge_version:a.charge.version,amount_cents:cashAmountToCents(a.amount)!})),presented_cents:method.type==='cash'?presentedCents:null,fee_cents:method.type==='card'?feeCents!:0,settlement:method.type==='card'?settlement:'not_applicable',settled_on:method.type==='card'&&settlement==='settled'?settledOn:null,external_reference:reference.trim()||null};
  }else{
   if(editor.kind==='confirm'&&!canRecord)return;
   details=editor.kind==='settle'?{kind:'settle',payment_id:editor.payment.id,settled_on:settledOn}:{kind:editor.kind,payment_id:editor.payment.id};
  }
  const payload={...details,session_id:s.id,evidence:evidence.trim()};
  const signature=JSON.stringify(payload);
  const operation=attempt.current?.signature===signature?attempt.current.operation:{...payload,expected_version:s.version,idempotency_key:crypto.randomUUID()} as PaymentOperation;
  if(!validPaymentOperation(operation)){setValidation('Confira a evidência (5 a 500 caracteres), os valores e a data de liquidação, quando aplicável.');return;}
  attempt.current={signature,operation};
  const c=new AbortController();mutation.current=c;historyRead.current?.abort();chargeRead.current?.abort();setHistoryReading(false);setChargeReading(false);setBusy(true);onBusy(true);setError(undefined);setValidation('');setFeedback('');
  try{
   const value=await cashApi.payment(office,operation,c.signal);
   if(c.signal.aborted||!alive.current)return;
   clearEditor();if(value.payments){setHistory(value.payments);setHistoryReady(true);setHistoryError(undefined);}
   onChanged(value);
   setFeedback(operation.kind==='record'&&operation.status==='pending'?'Pagamento pendente registrado. Nenhum saldo foi aplicado.':operation.kind==='reject'?'Pagamento rejeitado. O histórico foi preservado.':operation.kind==='settle'?'Liquidação manual registrada.':'Pagamento confirmado e saldos atualizados.');
  }catch(cause){
   if(c.signal.aborted||!alive.current)return;
   const e=cashError(cause);setError(e);
   if([401,403,404].includes(e.status)){clearEditor();setHistory({items:[],total:0,page:1});setHistoryReady(false);onUnavailable(e);}
   else if(e.status===409){clearEditor();loadHistory(1);onRefresh();setFeedback('O estado mudou. Confira o extrato atualizado e selecione novamente as cobranças ou a decisão.');}
  }finally{if(alive.current&&mutation.current===c){mutation.current=null;setBusy(false);onBusy(false);}}
 }

 const actionTitle=editor?.kind==='record'?'Registrar recebimento':editor?.kind==='confirm'?'Confirmar pagamento':editor?.kind==='reject'?'Rejeitar pagamento':'Registrar liquidação';
 if(hidden)return null;
 return <section className="cash-payments" aria-label="Recebimentos e pagamentos">
  {!editor&&<div className="team-section-heading"><h3 ref={panelHeading} tabIndex={-1}>Pagamentos</h3><div className="account-actions">{canRecord&&<button ref={openButton} type="button" className="primary-button" disabled={locked} onClick={()=>start({kind:'record'})}>Registrar recebimento</button>}{onCorrect&&<button ref={correctButton} type="button" className="secondary-button" disabled={locked} onClick={onCorrect}>Corrigir pagamento</button>}{actions}<button type="button" className="team-text-button" disabled={locked||historyReading} onClick={()=>loadHistory(history.page)}>Atualizar pagamentos</button></div></div>}
  {error&&<p className="form-feedback error" role="alert">{error.message}</p>}{feedback&&<p className="form-feedback" role="status">{feedback}</p>}
  {editor&&<form className="finance-operation cash-payment-editor" onSubmit={submit} noValidate onKeyDown={event=>{if(event.key==='Escape'&&!locked){event.preventDefault();clearEditor(true);setError(undefined);}}}>
   <h4 ref={editorHeading} tabIndex={-1}>{actionTitle}</h4>
   <fieldset disabled={locked}>
    {editor.kind==='record'?<>
     {(pickerOpen||allocations.length===0)&&<div className="cash-charge-picker" id="cash-charge-picker"><div className="cash-list-filters"><label className="team-field">Buscar cobrança<input ref={pickerFocus} value={query} maxLength={120} placeholder="Protocolo ou atendimento" onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();searchCharges();}}}/></label><button type="button" className="secondary-button" disabled={chargeReading} onClick={searchCharges}>Buscar cobrança</button></div>
     {chargeError&&<p className="form-feedback error" role="alert">{chargeError.message}</p>}
     <label className="team-field">Cobrança<select value="" disabled={chargeReading||allocations.length>=10||!candidates} onChange={e=>addCharge(e.target.value)}><option value="">Selecione para adicionar ao recebimento</option>{candidates?.items.filter(c=>c.balance_cents>0&&c.status==='open'&&!allocations.some(a=>a.charge.id===c.id)).map(c=><option key={c.id} value={c.id}>{c.protocol} · {cashMoney(c.balance_cents)} em aberto</option>)}</select></label>
     {candidates&&<><p className="customer-note">{allocations.length}/10 cobranças selecionadas. Valores parciais são permitidos.{!candidates.items.length&&' Nenhuma cobrança pendente sob sua responsabilidade neste filtro.'}</p><nav className="team-pagination" aria-label="Cobranças disponíveis"><button type="button" className="team-text-button" disabled={chargeReading||chargePage<=1} onClick={()=>setChargePage(n=>n-1)}>Anterior</button><span>{candidates.total} cobranças · {candidates.page}/{Math.max(1,Math.ceil(candidates.total/5))}</span><button type="button" className="team-text-button" disabled={chargeReading||chargePage*5>=candidates.total} onClick={()=>setChargePage(n=>n+1)}>Próxima</button></nav></>}
     </div>}
     {allocations.length>0&&allocations.length<10&&<button type="button" className="team-text-button cash-add-charge" aria-expanded={pickerOpen} aria-controls="cash-charge-picker" onClick={()=>setPickerOpen(v=>!v)}>{pickerOpen?'Concluir seleção':'Adicionar cobrança'}</button>}
     <ul className="cash-allocation-list" aria-label="Cobranças selecionadas">{allocations.map(({charge,amount},index)=><li key={charge.id}><div><strong>{charge.protocol}</strong><span className="customer-note">Saldo {cashMoney(charge.balance_cents)}</span></div><label className="team-field">Valor para {charge.protocol} (R$)<input ref={index===allocations.length-1?amountFocus:undefined} inputMode="decimal" maxLength={14} value={amount} onChange={e=>setAllocations(old=>old.map(a=>a.charge.id===charge.id?{...a,amount:e.target.value}:a))}/></label><button type="button" className="team-text-button" aria-label={`Remover ${charge.protocol}`} onClick={()=>{setAllocations(old=>old.filter(a=>a.charge.id!==charge.id));if(allocations.length===1)setPickerOpen(true);}}>Remover</button></li>)}</ul>
     <div className="cash-config-grid cash-receipt-fields">
      <label className="team-field">Forma de pagamento<select value={method?.id??''} onChange={e=>{setMethodId(e.target.value);setPresented('');setFee('');setSettlement('pending');setSettledOn('');}}>{!methods.length&&<option value="">Configure uma forma ativa para esta unidade</option>}{methods.map(m=><option key={m.id} value={m.id}>{m.name} · {configuration?.accounts.find(a=>a.id===m.destination_account_id)?.name}</option>)}</select></label>
      <label className="team-field">Confirmação do pagamento<select value={status} onChange={e=>setStatus(e.target.value as typeof status)}><option value="confirmed">Confirmado manualmente</option><option value="pending">Pendente de confirmação</option></select></label>
      {method?.type==='cash'&&<label className="team-field">Valor apresentado (R$)<input inputMode="decimal" maxLength={14} value={presented} onChange={e=>setPresented(e.target.value)}/></label>}
      {method?.type==='card'&&<><label className="team-field">Taxa do cartão (R$)<input inputMode="decimal" maxLength={14} value={fee} onChange={e=>setFee(e.target.value)}/></label><label className="team-field">Liquidação do cartão<select value={settlement} onChange={e=>setSettlement(e.target.value as typeof settlement)}><option value="pending">Pendente de liquidação</option><option value="settled">Liquidado manualmente</option></select></label>{settlement==='settled'&&<label className="team-field">Data de liquidação<input type="date" value={settledOn} onChange={e=>setSettledOn(e.target.value)}/></label>}</>}
     </div>
     <dl className="cash-totals cash-payment-totals" aria-label="Resumo do recebimento"><div><dt>{method?.type==='card'?'Valor bruto':'Valor aplicado'}</dt><dd>{totalValid?cashMoney(total):'Confira os valores'}</dd></div>{method?.type==='cash'&&<><div><dt>Valor apresentado</dt><dd>{presentedCents===null?'Informe o valor':cashMoney(presentedCents)}</dd></div><div><dt>Troco</dt><dd>{totalValid&&presentedCents!==null&&presentedCents>=total?cashMoney(presentedCents-total):'Confira os valores'}</dd></div></>}{method?.type==='card'&&<><div><dt>Taxa</dt><dd>{feeCents===null?'Informe a taxa':cashMoney(feeCents)}</dd></div><div><dt>Valor líquido</dt><dd>{totalValid&&feeCents!==null&&feeCents<=total?cashMoney(total-feeCents):'Confira os valores'}</dd></div></>}</dl>
     <p className="customer-note">{status==='pending'?'A pendência não reserva saldo, não quita cobranças e não entra nos recebimentos confirmados.':'Confirme somente após conferir o pagamento recebido.'} {method?.type==='cash'?'Somente o valor aplicado entra no saldo em espécie.':method?.type==='card'?'A taxa é um custo separado e não reduz o valor pago na cobrança. Liquidação conferida manualmente.':'PIX e transferências não alteram o saldo em espécie.'}</p>
     <details className="cash-payment-reference"><summary>Referência externa (opcional)</summary><label className="team-field">Referência externa<input value={reference} maxLength={120} onChange={e=>setReference(e.target.value)}/></label></details>
    </>:<><p className="customer-note">{editor.payment.method_name} · {cashMoney(editor.payment.amount_cents)} · {paymentNames[editor.payment.status]}</p>{editor.kind==='settle'&&<label className="team-field">Data de liquidação<input type="date" value={settledOn} onChange={e=>setSettledOn(e.target.value)}/></label>}<p className="customer-note">{editor.kind==='confirm'?'Confira o recebimento. Todas as cobranças serão verificadas novamente antes da confirmação.':editor.kind==='reject'?'Informe a razão da rejeição. O registro pendente permanece no histórico sem aplicar saldo.':'Registre a data e a conferência da liquidação efetiva do cartão.'}</p></>}
    <label className="team-field cash-evidence">Evidência da operação<textarea value={evidence} minLength={5} maxLength={500} rows={2} placeholder="Descreva a conferência realizada" onChange={e=>setEvidence(e.target.value)}/></label>
   </fieldset>
   {validation&&<p className="form-feedback error" role="alert">{validation}</p>}
   <div className="account-actions"><button className="primary-button" disabled={locked||editor.kind==='record'&&chargeReading}>{editor.kind==='record'?(status==='pending'?'Registrar pendência':'Confirmar recebimento'):actionTitle}</button><button type="button" className="secondary-button" disabled={locked} onClick={()=>{clearEditor(true);setError(undefined);}}>Cancelar</button></div>
  </form>}
  {!editor&&s.status==='closed'&&hasAuthority&&<p className="customer-note">Caixa fechado: novos recebimentos e confirmações estão bloqueados. Pendências podem ser rejeitadas e cartões confirmados podem ter sua liquidação registrada.</p>}
  {!editor&&historyError&&<p className="form-feedback error" role="alert">{historyError.message}</p>}
  {!editor&&!!history.destinations?.length&&<section className="cash-payment-destinations" aria-label="Totais por destino"><h4>Totais por destino</h4><p className="customer-note">Toda a sessão · recebimentos confirmados e devoluções.</p><ul>{history.destinations.map((destination,index)=><li key={`${destination.account_name}:${destination.payment_type}:${index}`}><strong>{destination.account_name} · {methodNames[destination.payment_type]}</strong><dl className="cash-totals cash-destination-totals"><div><dt>Recebido bruto</dt><dd>{cashMoney(destination.received_cents)}</dd></div><div><dt>Devolvido</dt><dd>{cashMoney(destination.returned_cents)}</dd></div><div><dt>Taxas</dt><dd>{knownMoney(destination.fee_cents)}</dd></div><div><dt>Após taxas e devoluções</dt><dd>{knownMoney(destination.net_cents)}</dd></div>{destination.payment_type==='card'&&<div><dt>Liquidado</dt><dd>{knownMoney(destination.settled_cents)}</dd></div>}</dl></li>)}</ul></section>}
  {!editor&&historyReady&&(!history.items.length?<p className="team-empty">Nenhum pagamento registrado neste caixa.</p>:<ul className="cash-payment-history" aria-label="Histórico de pagamentos">{history.items.map(payment=><li key={payment.id}>
   <div className="cash-session-heading"><strong>{payment.method_name} · {cashMoney(payment.amount_cents)}</strong><span className={`cash-payment-status cash-payment-${payment.status}`}>{paymentNames[payment.status]}</span></div>
   <p className="customer-note">{new Date(payment.created_at).toLocaleString('pt-BR')} · {payment.account_name}{payment.legacy&&' · Registro anterior'}</p>
   <ul className="cash-payment-allocation-summary">{payment.allocations.map(a=><li key={a.id??a.charge_id}>{a.protocol} · Original {cashMoney(a.amount_cents)}{a.reversed_cents!==undefined&&` · Estornado ${cashMoney(a.reversed_cents)}`}{a.refunded_cents!==undefined&&` · Devolvido ${cashMoney(a.refunded_cents)}`}{a.pending_refund_cents!==undefined&&` · Devolução pendente ${cashMoney(a.pending_refund_cents)}`}</li>)}</ul>
   {(payment.reversed_cents!==undefined||payment.refunded_cents!==undefined||payment.pending_refund_cents!==undefined)&&<dl className="cash-totals cash-payment-corrections" aria-label="Estornos e devoluções do pagamento">{payment.reversed_cents!==undefined&&<div><dt>Estornado da quitação</dt><dd>{cashMoney(payment.reversed_cents)}</dd></div>}{payment.refunded_cents!==undefined&&<div><dt>Devolvido efetivamente</dt><dd>{cashMoney(payment.refunded_cents)}</dd></div>}{payment.pending_refund_cents!==undefined&&<div><dt>Devolução pendente</dt><dd>{cashMoney(payment.pending_refund_cents)}</dd></div>}</dl>}
   {payment.status==='pending'&&<p className="customer-note">Sem efeito nos saldos até a confirmação.</p>}
   {payment.payment_type==='cash'&&<dl className="cash-totals cash-payment-totals"><div><dt>Aplicado no recebimento original</dt><dd>{cashMoney(payment.amount_cents)}</dd></div><div><dt>Apresentado</dt><dd>{knownMoney(payment.presented_cents)}</dd></div><div><dt>Troco</dt><dd>{knownMoney(payment.change_cents)}</dd></div></dl>}
   {payment.payment_type==='card'&&<><dl className="cash-totals cash-payment-totals"><div><dt>Bruto</dt><dd>{cashMoney(payment.amount_cents)}</dd></div><div><dt>Taxa</dt><dd>{knownMoney(payment.fee_cents)}</dd></div><div><dt>Líquido</dt><dd>{knownMoney(payment.net_cents)}</dd></div></dl><p className="customer-note">{payment.settlement==='settled'?`Liquidado em ${payment.settled_on?dateLabel(payment.settled_on):'data sem informação'}`:payment.settlement==='pending'?'Pendente de liquidação':'Liquidação: sem informação'}</p></>}
   <details className="cash-payment-reference"><summary>Detalhes do pagamento</summary><p>Referência lógica: {payment.reference}</p><p>Evidência: {payment.evidence??'Sem informação'}</p>{payment.external_reference&&<p>Referência externa: {payment.external_reference}</p>}<p>Registro de controle interno, sem emissão de nota fiscal.</p></details>
   {!editor&&hasAuthority&&<div className="account-actions">{payment.status==='pending'&&<>{canRecord&&<button type="button" className="team-text-button" disabled={locked} onClick={()=>start({kind:'confirm',payment})}>Confirmar pagamento</button>}<button type="button" className="team-text-button" disabled={locked} onClick={()=>start({kind:'reject',payment})}>Rejeitar pagamento</button></>}{payment.payment_type==='card'&&payment.settlement==='pending'&&['confirmed','partially_reversed','reversed'].includes(payment.status)&&<button type="button" className="team-text-button" disabled={locked} onClick={()=>start({kind:'settle',payment})}>Registrar liquidação</button>}</div>}
  </li>)}</ul>)}
  {!editor&&historyReady&&<nav className="team-pagination" aria-label="Paginação de pagamentos"><button type="button" className="team-text-button" disabled={locked||historyReading||history.page<=1} onClick={()=>loadHistory(history.page-1)}>Anterior</button><span>{history.total} pagamentos · {history.page}/{Math.max(1,Math.ceil(history.total/5))}</span><button type="button" className="team-text-button" disabled={locked||historyReading||history.page*5>=history.total} onClick={()=>loadHistory(history.page+1)}>Próxima</button></nav>}
 </section>;
}
