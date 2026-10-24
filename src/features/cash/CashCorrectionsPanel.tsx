import {useEffect,useRef,useState,type FormEvent} from 'react';
import {cashAmountToCents,cashInteger} from '../../../shared/cash';
import type {CorrectionKind,CorrectionOperation,CorrectionSource,CorrectionSources} from '../../../shared/corrections';
import {validCorrectionOperation} from '../../../shared/corrections';
import type {FinanceStatement} from '../../../shared/finance';
import {useAuth} from '../auth/AuthProvider';
import {cashApi,cashError,type CashError} from './api';
import {cashMoney} from './CashSessions';

type Props={office:string;statement:FinanceStatement;disabled:boolean;onBusy:(busy:boolean)=>void;onCancel:()=>void;onChanged:(value:FinanceStatement,message:string)=>void;onRefresh:()=>void;onUnavailable:(error:CashError)=>void};
const sourceKey=(source:CorrectionSource,kind:CorrectionKind)=>kind==='reverse'?source.allocation_id:source.reversal_id;
const inputMoney=(cents:number)=>`${Math.trunc(cents/100)},${String(cents%100).padStart(2,'0')}`;

export function CashCorrectionsPanel({office,statement,disabled,onBusy,onCancel,onChanged,onRefresh,onUnavailable}:Props){
 const auth=useAuth(),context=auth.contexts.find(c=>c.office_id===office&&c.role_code!=='client'),session=statement.session;
 const allowed=session.is_self&&session.status==='open'&&session.can_refund&&['cash.open','charges.adjust','charges.read','requests.read'].every(p=>context?.permissions.includes(p));
 const [kind,setKind]=useState<CorrectionKind>('reverse'),[source,setSource]=useState<CorrectionSource>(),[pickerOpen,setPickerOpen]=useState(true),[query,setQuery]=useState(''),[search,setSearch]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [sources,setSources]=useState<CorrectionSources>(),[reading,setReading]=useState(false),[readError,setReadError]=useState<CashError>();
 const [amount,setAmount]=useState(''),[reason,setReason]=useState(''),[evidence,setEvidence]=useState(''),[refundNow,setRefundNow]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<CashError>(),[validation,setValidation]=useState('');
 const read=useRef<AbortController|null>(null),mutation=useRef<AbortController|null>(null),alive=useRef(true),attempt=useRef<{signature:string;operation:CorrectionOperation}|undefined>(undefined);
 const heading=useRef<HTMLHeadingElement>(null),amountField=useRef<HTMLInputElement>(null),searchField=useRef<HTMLInputElement>(null);
 const callbacks=useRef({onBusy,onUnavailable});callbacks.current={onBusy,onUnavailable};
 const locked=disabled||busy,cents=cashAmountToCents(amount),paysMoney=kind==='refund'||refundNow;
 const submitLabel=kind==='refund'?'Registrar devolução efetiva':refundNow?'Estornar e registrar devolução':'Registrar estorno lógico';

 useEffect(()=>{alive.current=true;heading.current?.focus();return()=>{alive.current=false;read.current?.abort();mutation.current?.abort();callbacks.current.onBusy(false);};},[]);
 useEffect(()=>{if(source&&!pickerOpen)amountField.current?.focus();},[source,pickerOpen]);
 useEffect(()=>{
  if(!allowed)return;
  const c=new AbortController();read.current=c;setReading(true);setSources(undefined);setReadError(undefined);
  void cashApi.correctionSources(office,session.id,kind,search,page,c.signal).then(value=>{if(!c.signal.aborted){setSources(value);}}).catch(cause=>{if(!c.signal.aborted){const issue=cashError(cause);setReadError(issue);if([401,403,404].includes(issue.status))callbacks.current.onUnavailable(issue);}}).finally(()=>{if(!c.signal.aborted)setReading(false);});
  return()=>c.abort();
 },[office,session.id,kind,search,page,revision,allowed]);

 function clearSelection(){setSource(undefined);setPickerOpen(true);setAmount('');setRefundNow(false);attempt.current=undefined;setValidation('');}
 function changeKind(next:CorrectionKind){if(locked)return;clearSelection();setKind(next);setReason('');setEvidence('');setQuery('');setSearch('');setPage(1);setError(undefined);}
 function selectSource(key:string){const selected=sources?.items.find(item=>sourceKey(item,kind)===key);if(!selected||locked)return;setSource(selected);setAmount(inputMoney(selected.available_cents));setPickerOpen(false);setRefundNow(false);setValidation('');}
 function findSources(){if(locked||reading)return;setSearch(query.trim());setPage(1);setRevision(n=>n+1);}
 async function submit(event:FormEvent){
  event.preventDefault();if(locked||mutation.current||!allowed)return;
  if(!source||cents===null||!cashInteger(cents,1)||cents>source.available_cents){setValidation('Selecione a origem e informe um valor positivo até o limite disponível.');return;}
  if(paysMoney&&source.payment_type==='cash'&&cents>session.cash_cents){setValidation('O saldo em espécie do seu caixa é insuficiente para esta devolução.');return;}
  if(kind==='refund'&&!source.reversal_id){setValidation('Selecione o estorno com devolução pendente.');return;}
  const details={...(kind==='reverse'?{kind,allocation_id:source.allocation_id,refund_now:refundNow}:{kind,reversal_id:source.reversal_id!}),session_id:session.id,amount_cents:cents,reason:reason.trim(),evidence:evidence.trim()};
  const signature=JSON.stringify(details),operation=attempt.current?.signature===signature?attempt.current.operation:{...details,expected_version:session.version,idempotency_key:crypto.randomUUID()} as CorrectionOperation;
  if(!validCorrectionOperation(operation)){setValidation('Preencha motivo e evidência com 5 a 500 caracteres cada, sem quebras de linha.');return;}
  attempt.current={signature,operation};const c=new AbortController();mutation.current=c;read.current?.abort();setReading(false);setBusy(true);onBusy(true);setError(undefined);setValidation('');
  try{const value=await cashApi.correction(office,operation,c.signal);if(!c.signal.aborted&&alive.current){onBusy(false);onChanged(value,operation.kind==='refund'?'Devolução efetiva registrada. A alocação não foi estornada novamente.':operation.refund_now?'Estorno e devolução efetiva registrados juntos.':'Estorno lógico registrado. A devolução permanece pendente, sem saída de dinheiro.');}}
  catch(cause){if(!c.signal.aborted&&alive.current){const issue=cashError(cause);setError(issue);if([401,403,404].includes(issue.status)){clearSelection();setReason('');setEvidence('');setSources(undefined);onUnavailable(issue);}else if(issue.status===409){clearSelection();setSources(undefined);setRevision(n=>n+1);onRefresh();setValidation('O estado mudou. Confira os saldos atualizados e selecione a origem novamente.');}}}
  finally{if(alive.current&&mutation.current===c){mutation.current=null;setBusy(false);onBusy(false);}}
 }

 if(!allowed)return <p className="customer-note">A correção exige seu próprio caixa aberto nesta unidade e autorização para ajustar cobranças.</p>;
 return <form className="finance-operation cash-correction-editor" aria-label="Correção de pagamento" noValidate onSubmit={submit} onKeyDown={event=>{if(event.key==='Escape'&&!locked){event.preventDefault();onCancel();}}}>
  <h3 ref={heading} tabIndex={-1}>Corrigir pagamento</h3>
  {error&&<p role="alert" className="form-feedback error">{error.message}</p>}
  <fieldset disabled={locked}>
   <label className="team-field">Tipo de correção<select value={kind} onChange={event=>changeKind(event.target.value as CorrectionKind)}><option value="reverse">Estorno lógico da alocação</option><option value="refund">Devolução de valor já estornado</option></select></label>
   {pickerOpen&&<div className="cash-correction-picker"><div className="cash-list-filters"><label className="team-field">Buscar origem<input ref={searchField} value={query} maxLength={120} placeholder="Protocolo ou referência do pagamento" onChange={event=>setQuery(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'){event.preventDefault();findSources();}}}/></label><button type="button" className="secondary-button" disabled={reading} onClick={findSources}>Buscar origem</button></div>
    {readError&&<p role="alert" className="form-feedback error">{readError.message}</p>}
    <label className="team-field">Origem da correção<select value={source?sourceKey(source,kind)??'':''} disabled={reading||!sources} onChange={event=>selectSource(event.target.value)}><option value="">{kind==='reverse'?'Selecione uma alocação confirmada':'Selecione um estorno pendente de devolução'}</option>{sources?.items.map(item=><option key={sourceKey(item,kind)} value={sourceKey(item,kind)??''}>{item.protocol} · {item.method_name} · limite {cashMoney(item.available_cents)}</option>)}</select></label>
    {sources&&<>{sources.items.length===0&&<p className="customer-note">Nenhuma origem disponível neste filtro e sob sua responsabilidade.</p>}<nav className="team-pagination" aria-label="Origens da correção"><button type="button" className="team-text-button" disabled={reading||sources.page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>{sources.total} origens · {sources.page}/{Math.max(1,Math.ceil(sources.total/5))}</span><button type="button" className="team-text-button" disabled={reading||sources.page*5>=sources.total} onClick={()=>setPage(n=>n+1)}>Próxima</button></nav></>}
   </div>}
   {source&&<><div className="cash-correction-source"><div><strong>{source.protocol}</strong><span>{source.method_name} · {source.account_name}</span></div><button type="button" className="team-text-button" aria-expanded={pickerOpen} onClick={()=>{setPickerOpen(value=>!value);if(!pickerOpen)requestAnimationFrame(()=>searchField.current?.focus());}}>{pickerOpen?'Concluir seleção':'Trocar origem'}</button></div>
    <div className="cash-config-grid cash-correction-values"><label className="team-field">Valor da correção (R$)<input ref={amountField} value={amount} inputMode="decimal" maxLength={14} onChange={event=>setAmount(event.target.value)}/></label><p className="customer-note">Limite disponível: {cashMoney(source.available_cents)}{paysMoney&&source.payment_type==='cash'&&` · Espécie no seu caixa: ${cashMoney(session.cash_cents)}`}</p></div>
    <details className="cash-payment-reference"><summary>Histórico da origem</summary><dl className="cash-totals"><div><dt>Original</dt><dd>{cashMoney(source.original_cents)}</dd></div><div><dt>Estornado</dt><dd>{cashMoney(source.reversed_cents)}</dd></div><div><dt>Devolvido</dt><dd>{cashMoney(source.refunded_cents)}</dd></div><div><dt>Devolução pendente</dt><dd>{cashMoney(source.pending_refund_cents)}</dd></div>{source.reversal_cents!==null&&<div><dt>Estorno selecionado</dt><dd>{cashMoney(source.reversal_cents)}</dd></div>}</dl><p>Referência lógica: {source.reference}{source.legacy?' · Registro anterior':''}</p><p>Origem de {new Date(source.created_at).toLocaleString('pt-BR')}. A operação será registrada no seu caixa atual; o recebimento original será preservado.</p></details>
   </>}
   {kind==='reverse'&&<label className="team-check cash-correction-combined"><input type="checkbox" checked={refundNow} onChange={event=>setRefundNow(event.target.checked)}/><span>Já devolvi o valor e quero registrar a devolução junto ao estorno.</span></label>}
   <p className="customer-note">{kind==='refund'?'Registre somente após devolver o valor ao cliente. Esta saída não reduz a alocação novamente.':refundNow?'Esta confirmação registra o estorno da quitação e a devolução efetiva juntos. Descreva a devolução realizada na evidência.':'O estorno lógico retira a quitação e mantém uma devolução pendente. Nenhum dinheiro será registrado como devolvido.'} Cancelar um serviço ou ajustar a cobrança é uma decisão separada; esta operação não cria crédito reutilizável.</p>
   <div className="cash-config-grid cash-correction-notes"><label className="team-field">Motivo da correção<textarea value={reason} minLength={5} maxLength={500} rows={2} onChange={event=>setReason(event.target.value)}/></label><label className="team-field">Evidência da correção<textarea value={evidence} minLength={5} maxLength={500} rows={2} placeholder={paysMoney?'Descreva a devolução efetivamente realizada':'Descreva a conferência do estorno'} onChange={event=>setEvidence(event.target.value)}/></label></div>
  </fieldset>
  {validation&&<p role="alert" className="form-feedback error">{validation}</p>}
  <div className="account-actions"><button className="primary-button" disabled={locked||reading||!source}>{submitLabel}</button><button type="button" className="secondary-button" disabled={locked} onClick={onCancel}>Cancelar</button></div>
 </form>;
}
