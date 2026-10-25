import {useEffect,useRef,useState} from 'react';
import type {PaymentReceipt} from '../../../shared/expenses';
import {cashApi,cashError,type CashError} from './api';
import {cashMoney} from './CashSessions';
type Props={office:string;paymentId:string;onBack:()=>void;onBusy:(v:boolean)=>void;onUnavailable:(e:CashError)=>void};
// Presentation1 consumes only the immutable snapshot stored when first issued.
export function PaymentReceiptPanel({office,paymentId,onBack,onBusy,onUnavailable}:Props){
 const [data,setData]=useState<PaymentReceipt>(),[error,setError]=useState<CashError>(),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0);
 const key=useRef(crypto.randomUUID()),callbacks=useRef({onBusy,onUnavailable});callbacks.current={onBusy,onUnavailable};
 const heading=useRef<HTMLHeadingElement>(null);
 useEffect(()=>{const c=new AbortController();setBusy(true);callbacks.current.onBusy(true);setError(undefined);
  void cashApi.receipt(office,paymentId,key.current,c.signal).then(v=>{if(!c.signal.aborted)setData(v);}).catch(cause=>{if(!c.signal.aborted){const e=cashError(cause);setError(e);if([401,403,404].includes(e.status)){setData(undefined);callbacks.current.onUnavailable(e);}}}).finally(()=>{if(!c.signal.aborted){setBusy(false);callbacks.current.onBusy(false);}});
  return()=>{c.abort();callbacks.current.onBusy(false);};
 },[office,paymentId,revision]);
 useEffect(()=>{if(data)heading.current?.focus();},[data]);
 const s=data?.snapshot;
 return <section className="receipt-view" aria-label="Consulta do recibo"><div className="account-actions receipt-controls"><button type="button" className="secondary-button" disabled={busy} onClick={onBack}>Voltar aos pagamentos</button>{data&&<button type="button" className="primary-button" disabled={busy} onClick={()=>window.print()}>Imprimir recibo</button>}{error&&![401,403,404].includes(error.status)&&<button type="button" className="secondary-button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button>}</div>
  {error&&<p role="alert" className="form-feedback error">{error.message}</p>}
  {data&&s&&<article className="payment-receipt" aria-label="Recibo de recebimento"><p className="eyebrow">{s.office_name}</p><h2 ref={heading} tabIndex={-1}>Recibo {data.number}</h2><p>{s.description}</p><dl className="receipt-fields"><div><dt>Valor recebido</dt><dd>{cashMoney(s.amount_cents)}</dd></div>{s.payer_name&&<div><dt>Pagador</dt><dd>{s.payer_name}</dd></div>}<div><dt>Meio de recebimento</dt><dd>{s.method_name}</dd></div><div><dt>Recebimento confirmado</dt><dd>{new Date(s.confirmed_at).toLocaleString('pt-BR',{timeZone:'UTC'})} UTC</dd></div><div><dt>Operador</dt><dd>{s.operator_name}</dd></div><div><dt>Referência do pagamento</dt><dd>{s.payment_reference}</dd></div></dl><ul className="receipt-allocations">{s.allocations.map((a,i)=><li key={`${a.protocol}:${i}`}>{a.protocol} · {cashMoney(a.amount_cents)}</li>)}</ul><p className="customer-note">Comprova o recebimento original. Estornos e devoluções posteriores permanecem no histórico financeiro. Não substitui nota fiscal.</p><p className="customer-note">Emitido em {new Date(data.issued_at).toLocaleString('pt-BR',{timeZone:'UTC'})} UTC · Versão {data.version}. Reimpressão conserva número e conteúdo.</p></article>}
 </section>;
}
