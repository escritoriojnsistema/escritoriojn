import {useEffect,useState} from 'react';
import type {PublicReviewPage} from '../../../shared/editorialReview';
import {reviewStatuses} from '../../../shared/editorialReview';
import {commercialRequest,CommercialError} from '../documentCommercial/api';
import {RequestsError} from './api';

export function RequestReviewStatus({office,requestId,onFailure}:{office:string;requestId:string;onFailure:(failure:RequestsError)=>void}){
 return <ReviewSummary key={`${office}:${requestId}`} office={office} requestId={requestId} onFailure={onFailure}/>;
}
function ReviewSummary({office,requestId,onFailure}:{office:string;requestId:string;onFailure:(failure:RequestsError)=>void}){
 const [data,setData]=useState<PublicReviewPage>(),[page,setPage]=useState(1),[size,setSize]=useState(()=>matchMedia('(max-width:900px)').matches?3:5),[revision,setRevision]=useState(0),[pending,setPending]=useState(false),[error,setError]=useState<CommercialError>();
 const blocked=error?.status===401||error?.status===403||error?.status===404;
 useEffect(()=>{const media=matchMedia('(max-width:900px)'),resize=()=>{setSize(media.matches?3:5);setPage(1);};media.addEventListener('change',resize);return()=>media.removeEventListener('change',resize);},[]);
 useEffect(()=>{
  if(blocked)return;const c=new AbortController();setPending(true);
  void commercialRequest<PublicReviewPage>('/request-reviews',{office_id:office,request_id:requestId,page,size},c.signal,'/api/document-workflow').then(value=>{if(c.signal.aborted)return;setData(value);setError(undefined);}).catch(cause=>{
   if(c.signal.aborted)return;const failure=cause instanceof CommercialError?cause:new CommercialError(503);setError(failure);
   if([401,403,404].includes(failure.status)){setData(undefined);onFailure(new RequestsError(failure.status));}
  }).finally(()=>{if(!c.signal.aborted)setPending(false);});return()=>c.abort();
 },[office,requestId,page,size,revision,blocked]);
 return <section className="service-section" aria-labelledby="request-review-title"><h2 id="request-review-title">Revisão dos documentos</h2>
  {error&&<p className="form-feedback error" role="alert">{error.message}</p>}
  {!blocked&&<>{error&&<button type="button" className="team-text-button" disabled={pending} onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button>}
   {data&&<>{data.items.length?<ul className="request-history" aria-label="Revisão dos documentos">{data.items.map((item,index)=><li key={`${data.page}:${index}`}><strong>{item.title}</strong><p>Revisão {item.revision} · {reviewStatuses[item.status]}</p><small>{new Date(item.updated_at).toLocaleString('pt-BR')}</small></li>)}</ul>:<p className="customer-note">Nenhum documento em revisão neste atendimento.</p>}
    {data.total>0&&<nav className="team-pagination" aria-label="Paginação da revisão dos documentos"><button type="button" className="team-text-button" disabled={pending||page<=1} onClick={()=>setPage(n=>n-1)}>Anterior</button><span>{data.page}/{Math.max(1,Math.ceil(data.total/data.page_size))} · {data.total} documentos</span><button type="button" className="team-text-button" disabled={pending||data.page*data.page_size>=data.total} onClick={()=>setPage(n=>n+1)}>Próxima</button></nav>}
    {data.total>0&&<p className="customer-note">A revisão não confirma pagamento, assinatura ou entrega.</p>}
   </>}
  </>}
 </section>;
}
