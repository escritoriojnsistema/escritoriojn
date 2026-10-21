import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Search, X } from 'lucide-react';
import type { AttachmentRequestOption, AttachmentRequestPage } from '../../../shared/attachments';
import { paths } from '../../app/routes';
import { attachmentsApi, attachmentsError, type AttachmentsError } from './api';

export function AttachmentRequestPicker({office,size,value,client,busy,onSelect,onFailure,label='solicitação'}:{office:string;size:number;value?:AttachmentRequestOption;client:boolean;busy:boolean;onSelect:(value:AttachmentRequestOption)=>void;onFailure:(error:AttachmentsError)=>void;label?:string}){
 const [open,setOpen]=useState(false),[input,setInput]=useState(''),[query,setQuery]=useState(''),[page,setPage]=useState(1),[revision,setRevision]=useState(0);
 const [data,setData]=useState<AttachmentRequestPage>(),[error,setError]=useState<AttachmentsError>(),[pending,setPending]=useState(false);
 useEffect(()=>{const timer=setTimeout(()=>{setQuery(input.trim());setPage(1);},300);return()=>clearTimeout(timer);},[input]);
 useEffect(()=>{
  const controller=new AbortController();setPending(true);setError(undefined);
  void attachmentsApi.requests(office,query,page,size,controller.signal).then(result=>{if(!controller.signal.aborted)setData(result);}).catch(cause=>{if(!controller.signal.aborted){const failure=attachmentsError(cause);setError(failure);if(failure.status===401||failure.status===403)onFailure(failure);}}).finally(()=>{if(!controller.signal.aborted)setPending(false);});
  return()=>controller.abort();
 },[office,query,page,size,revision,onFailure]);
 return <div className="attachment-request-picker">
  <div className="request-picker-current"><span>{value?.label??'Escolha um atendimento existente'}</span><button type="button" className="team-text-button" disabled={busy} aria-expanded={open} onClick={()=>setOpen(v=>!v)}>Selecionar {label}</button></div>
  {error&&<div><p role="alert" className="form-feedback error">{error.message}</p><button type="button" className="team-text-button" onClick={()=>setRevision(n=>n+1)}>Tentar seleção novamente</button></div>}
  {data&&!data.total&&!query&&<p className="customer-note">Nenhuma solicitação disponível para anexar. Abra um atendimento no fluxo de solicitações. <Link to={client?paths.clientRequests:paths.requests}>{client?'Ir para minhas solicitações':'Ir para solicitações'}</Link></p>}
  {open&&<section className="request-options" aria-label={`Escolher ${label}`}>
   <div className="customer-search"><label className="team-field">Buscar {label}<input type="search" maxLength={120} value={input} onChange={e=>setInput(e.target.value)}/></label><button type="button" className="operation-icon-button" aria-label={`Buscar ${label}`} onClick={()=>{setQuery(input.trim());setPage(1);setRevision(n=>n+1);}}><Search size={18} aria-hidden="true"/></button><button type="button" className="operation-icon-button" aria-label={`Fechar seleção de ${label}`} onClick={()=>setOpen(false)}><X size={18} aria-hidden="true"/></button></div>
   {data&&<><ul className="request-option-list">{data.items.map(option=><li key={option.id}><span>{option.label}{option.closed?' · encerrado':''}</span><button type="button" className="team-text-button" disabled={pending||busy} aria-label={`Escolher ${option.label}`} onClick={()=>{onSelect(option);setOpen(false);}}>Escolher</button></li>)}</ul>{!data.items.length&&query&&<p className="customer-note">Nenhum resultado. Ajuste a busca.</p>}<nav className="team-pagination" aria-label={`Paginação de ${label}`}><button type="button" className="team-text-button" disabled={pending||page<=1} onClick={()=>setPage(p=>p-1)}><ArrowLeft size={16} aria-hidden="true"/>Anterior</button><span>{data.page}/{Math.max(1,Math.ceil(data.total/data.page_size))} · {data.total} opções</span><button type="button" className="team-text-button" disabled={pending||page*data.page_size>=data.total} onClick={()=>setPage(p=>p+1)}>Próxima<ArrowRight size={16} aria-hidden="true"/></button></nav></>}
  </section>}
 </div>;
}
