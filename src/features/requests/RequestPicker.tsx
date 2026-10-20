import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import type { RequestOption, RequestOptionKind, RequestOptions } from '../../../shared/requests';
import { requestsApi, requestsError, type RequestsError } from './api';

export function RequestPicker({office,kind,label,value,busy=false,onSelect,onFailure}:{office:string;kind:RequestOptionKind;label:string;value?:RequestOption;busy?:boolean;onSelect:(option:RequestOption)=>void;onFailure:(failure:RequestsError)=>void}){
 const [open,setOpen]=useState(false),[input,setInput]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1);
 const [data,setData]=useState<RequestOptions>(),[error,setError]=useState<RequestsError>(),[revision,setRevision]=useState(0),[pending,setPending]=useState(false);
 const size=matchMedia('(max-width: 900px)').matches?3:5;
 useEffect(()=>{const t=setTimeout(()=>{setQuery(input.trim());setPage(1);},300);return()=>clearTimeout(t);},[input]);
 useEffect(()=>{
  if(!open)return;const controller=new AbortController();setPending(true);setError(undefined);
  void requestsApi.options(office,kind,query,page,size,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(cause=>{if(!controller.signal.aborted){const failure=requestsError(cause);setError(failure);if(failure.status===401||failure.status===403)onFailure(failure);}}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[open,office,kind,query,page,size,revision,onFailure]);
 return <div className="request-picker">
  <div className="request-picker-current"><span>{value?.label??'Nenhum selecionado'}</span><button type="button" className="team-text-button" disabled={busy} onClick={()=>setOpen(v=>!v)} aria-expanded={open}>Selecionar {label}</button></div>
  {open&&<section className="request-options" aria-label={`Escolher ${label}`}>
   <div className="customer-search"><label className="team-field">Buscar {label}<input type="search" maxLength={120} value={input} onChange={e=>setInput(e.target.value)}/></label><button type="button" className="operation-icon-button" aria-label={`Buscar ${label}`} onClick={()=>{setQuery(input.trim());setPage(1);setRevision(n=>n+1);}}><Search size={18} aria-hidden="true"/></button><button type="button" className="operation-icon-button" aria-label={`Fechar seleção de ${label}`} onClick={()=>setOpen(false)}><X size={18} aria-hidden="true"/></button></div>
   {error?<div><p role="alert" className="form-feedback error">{error.message}</p><button type="button" className="team-text-button" onClick={()=>setRevision(n=>n+1)}>Tentar seleção novamente</button></div>:data&&<><ul className="request-option-list">{data.items.map(option=><li key={option.id}><span>{option.label}</span><button type="button" className="team-text-button" disabled={pending||busy} aria-label={`Escolher ${option.label}`} onClick={()=>{onSelect(option);setOpen(false);}}>Escolher</button></li>)}</ul>{!data.items.length&&<p className="customer-note">Nenhum resultado. Ajuste a busca.</p>}<nav className="team-pagination" aria-label={`Paginação de ${label}`}><button type="button" className="team-text-button" disabled={pending||page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={16} aria-hidden="true"/>Anterior</button><span>{data.page}/{Math.max(1,Math.ceil(data.total/data.page_size))} · {data.total} opções</span><button type="button" className="team-text-button" disabled={pending||page*data.page_size>=data.total} onClick={()=>setPage(p=>p+1)}>Próxima<ArrowRight size={16} aria-hidden="true"/></button></nav></>}
  </section>}
 </div>;
}
