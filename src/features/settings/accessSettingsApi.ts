import {accessPolicyState,type AccessAudience,type AccessPolicyState} from '../../../shared/sessionActivity';
import {supabase} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';
export class AccessSettingsError extends Error{
 constructor(public status:number){super(status===401?'Sua sessão expirou. Entre novamente para continuar.':status===403?'Seu acesso não permite gerenciar estas políticas.':status===409?'A política mudou. Atualize os prazos antes de salvar novamente.':status===422?'Informe um prazo inteiro entre 5 e 1440 minutos.':'Não foi possível consultar ou salvar os prazos. Tente novamente.');}
}
async function request(path:string,body:unknown,signal?:AbortSignal):Promise<AccessPolicyState>{
 if(!supabase)throw new AccessSettingsError(503);
 const controller=new AbortController();let unsubscribe:(()=>void)|undefined;
 try{
  const {data,error}=await supabase.auth.getSession();signal?.throwIfAborted();if(error||!data.session)throw new AccessSettingsError(401);
  const session=data.session,scope=sessionScope(session);
  const subscription=supabase.auth.onAuthStateChange((_event,next)=>{if(!next||sessionScope(next)!==scope)controller.abort();});unsubscribe=()=>subscription.data.subscription.unsubscribe();
  const response=await authenticatedFetch(`/api/access-settings${path}`,{method:'POST',headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(25000),...(signal?[signal]:[])])},session);
  if(!response.ok)throw new AccessSettingsError(response.status);
  const result:unknown=await response.json();signal?.throwIfAborted();controller.signal.throwIfAborted();
  const current=await supabase.auth.getSession();if(current.error||!current.data.session||sessionScope(current.data.session)!==scope)throw new AccessSettingsError(401);
  if(!result||typeof result!=='object'||!('data' in result))throw new AccessSettingsError(503);return accessPolicyState(result.data);
 }catch(cause){if(signal?.aborted)throw cause;throw cause instanceof AccessSettingsError?cause:new AccessSettingsError(503);}finally{unsubscribe?.();}
}
export const accessSettingsApi={
 state:(office_id:string,signal?:AbortSignal)=>request('/state',{office_id},signal),
 save:(office_id:string,audience:AccessAudience,idle_minutes:number,expected_revision:number,idempotency_key:string,signal?:AbortSignal)=>request('/policy',{office_id,audience,idle_minutes,expected_revision,idempotency_key},signal),
};
