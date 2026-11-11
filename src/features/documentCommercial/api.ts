import type {TemplateFolderCommand,TemplateFolderState} from '../../../shared/modelCommercial';
import type {TemplatePage} from '../../../shared/templates';
import {supabase} from '../auth/browser';
import {sessionScope} from '../auth/sessionScope';
import {authenticatedFetch} from '../auth/authenticatedFetch';
export class CommercialError extends Error {
 constructor(public status:number){super(status===401?'Sua sessão foi encerrada. Entre novamente.':status===403?'Seu acesso não permite esta operação.':status===404?'Registro não encontrado.':status===409?'Os dados mudaram ou a operação exige conferência. Atualize antes de continuar.':status===429?'Limite de pedidos atingido. Consulte suas solicitações e tente novamente mais tarde.':status===422?'Confira os campos informados.':'Serviço indisponível. Repita a mesma tentativa.');}
}
export async function commercialRequest<T>(path:string,body:unknown,signal?:AbortSignal,base='/api/document-commercial',blob=false):Promise<T>{
 if(!supabase)throw new CommercialError(503);
 const c=new AbortController();let changed=false;let unsubscribe:(()=>void)|undefined;
 try{signal?.throwIfAborted();const {data,error}=await supabase.auth.getSession();if(error||!data.session)throw new CommercialError(401);const session=data.session,scope=sessionScope(session);
 const listener=supabase.auth.onAuthStateChange((_event,next)=>{if(!next||sessionScope(next)!==scope){changed=true;c.abort();}});unsubscribe=()=>listener.data.subscription.unsubscribe();
 const res=await authenticatedFetch(base+path,{method:'POST',cache:'no-store',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.any([c.signal,AbortSignal.timeout(25000),...(signal?[signal]:[])])},session);
 const result:unknown=blob&&res.ok?await res.blob():await res.json();signal?.throwIfAborted();const current=await supabase.auth.getSession();if(changed||current.error||!current.data.session||sessionScope(current.data.session)!==scope)throw new CommercialError(401);
 if(!res.ok)throw new CommercialError(res.status);
 if(blob)return result as T;
 if(!result||typeof result!=='object'||!('data'in result))throw new CommercialError(503);
 return result.data as T;
 }catch(e){if(signal?.aborted)throw e;throw changed?new CommercialError(401):e instanceof CommercialError?e:new CommercialError(503);}finally{unsubscribe?.();}
}
export const commercialApi={
 folders:(office_id:string,signal?:AbortSignal)=>commercialRequest<TemplateFolderState>('/folders',{office_id},signal),
 folderCommand:(office_id:string,command:TemplateFolderCommand,idempotency_key:string,signal?:AbortSignal)=>commercialRequest<TemplateFolderState>('/folder-command',{office_id,command,idempotency_key},signal),
 templates:(office_id:string,folder_id:string|null,unfiled:boolean,state:'draft'|'approved',query:string,page:number,size:number,signal?:AbortSignal)=>commercialRequest<TemplatePage>('/templates-search',{office_id,folder_id,unfiled,archived:false,state,query,page,size},signal),
};
