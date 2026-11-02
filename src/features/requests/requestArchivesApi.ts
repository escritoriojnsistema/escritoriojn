import type {RequestArchiveDays,RequestArchiveFilters,RequestArchivePage,RequestArchivePolicy} from '../../../shared/requestArchives';
import {supabase} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';

export class RequestArchivesError extends Error {
 constructor(public status:number,public code?:string){super(status===401?'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.':status===403?'Seu acesso não permite gerenciar os arquivos de solicitações.':status===404?'A solicitação não está mais disponível no seu escopo.':status===409?'Os dados mudaram. Atualize e confira a seleção antes de tentar novamente.':code==='REQUEST_ARCHIVES_EXPORT_LIMIT'?'O relatório excede 1.000 solicitações ou 3 MB. Refine o período; nenhum PDF parcial foi entregue.':status===422?'Confira os filtros, o prazo e o motivo informado.':'Não foi possível concluir. Tente novamente com os mesmos dados.');}
}
export const requestArchivesError=(cause:unknown)=>cause instanceof RequestArchivesError?cause:new RequestArchivesError(503);
async function request<T>(path:string,body:unknown,signal?:AbortSignal,pdf=false):Promise<T>{
 if(!supabase)throw new RequestArchivesError(503);
 const controller=new AbortController();let changed=false;let unsubscribe:(()=>void)|undefined;
 try{
  signal?.throwIfAborted();const {data,error}=await supabase.auth.getSession();if(error||!data.session?.access_token)throw new RequestArchivesError(401);
  const started=sessionScope(data.session);const subscription=supabase.auth.onAuthStateChange((_e,next)=>{if(!next||next.user.id!==data.session!.user.id||sessionScope(next)!==started){changed=true;controller.abort();}});unsubscribe=()=>subscription.data.subscription.unsubscribe();
  const response=await authenticatedFetch(`/api/request-archives${path}`,{method:'POST',body:JSON.stringify(body),cache:'no-store',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(pdf?90_000:25_000),...(signal?[signal]:[])])},data.session);
  let result:unknown;
  if(!response.ok){const failure:unknown=await response.json();const code=failure&&typeof failure==='object'&&'error'in failure&&failure.error&&typeof failure.error==='object'&&'code'in failure.error?String(failure.error.code):undefined;throw new RequestArchivesError(response.status,code);}
  if(pdf){if(!response.headers.get('content-type')?.startsWith('application/pdf'))throw new RequestArchivesError(503);result=await response.blob();if((result as Blob).size>3_000_000)throw new RequestArchivesError(503);}
  else{const envelope:unknown=await response.json();if(!envelope||typeof envelope!=='object'||!('data'in envelope)||!envelope.data||typeof envelope.data!=='object')throw new RequestArchivesError(503);result=envelope.data;}
  signal?.throwIfAborted();const current=await supabase.auth.getSession();signal?.throwIfAborted();if(changed||current.error||!current.data.session||current.data.session.user.id!==data.session.user.id||sessionScope(current.data.session)!==started)throw new RequestArchivesError(401);
  return result as T;
 }catch(cause){if(signal?.aborted)throw cause;if(changed)throw new RequestArchivesError(401);throw requestArchivesError(cause);}finally{unsubscribe?.();}
}
export const requestArchivesApi={
 policy:(office_id:string,signal?:AbortSignal)=>request<RequestArchivePolicy>('/policy',{office_id},signal),
 setPolicy:(office_id:string,days:RequestArchiveDays,expected_version:number,idempotency_key:string,signal?:AbortSignal)=>request<RequestArchivePolicy>('/policy/set',{office_id,days,expected_version,idempotency_key},signal),
 search:(office_id:string,filters:RequestArchiveFilters,page:number,size:number,signal?:AbortSignal)=>request<RequestArchivePage>('/search',{office_id,...filters,page,size},signal),
 archive:(office_id:string,id:string,expected_version:number,reason:string,idempotency_key:string,signal?:AbortSignal)=>request<{request_id:string;archived:true}>(`/${id}/archive`,{office_id,expected_version,reason,idempotency_key},signal),
 report:(office_id:string,filters:RequestArchiveFilters,idempotency_key:string,signal?:AbortSignal)=>request<Blob>('/report',{office_id,...filters,idempotency_key},signal,true),
};
