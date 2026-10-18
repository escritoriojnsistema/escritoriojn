import { supabase } from '../auth/browser';
import { sessionScope } from '../auth/sessionScope';
import type { ArchiveEntry, AuditEvent, AuditExport, AuditFilters, GovernancePage } from '../../../shared/governance';
export class GovernanceError extends Error {
 constructor(public status: number, code?: string) { super(status === 401 ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.' : status === 403 ? 'Seu acesso não permite esta operação. Verifique com o proprietário.' : status === 409 ? 'O registro já mudou. Atualize a lista antes de continuar.' : code === 'EXPORT_LIMIT' ? 'Selecione filtros mais específicos. O limite é de 1000 eventos por exportação.' : status === 422 ? 'Confira os filtros e tente novamente.' : 'Serviço indisponível no momento. Confira sua conexão e tente novamente.'); }
}
async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
 if (!supabase) throw new GovernanceError(503);
 try {
  const {data,error}=await supabase.auth.getSession();if(error||!data.session?.access_token)throw new GovernanceError(401);
  const response=await fetch(`/api/governance${path}`,{method:body===undefined?'GET':'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)}),cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(25_000),...(signal?[signal]:[])])});
  const result:unknown=await response.json();
  if(!response.ok){const code=result&&typeof result==='object'&&'error' in result&&result.error&&typeof result.error==='object'&&'code' in result.error?String(result.error.code):undefined;throw new GovernanceError(response.status,code);}
  if(!result||typeof result!=='object'||!('data' in result)||!result.data||typeof result.data!=='object')throw new GovernanceError(503);
  signal?.throwIfAborted();
  const current=await supabase.auth.getSession();
  signal?.throwIfAborted();
  if(current.error||!current.data.session||current.data.session.user.id!==data.session.user.id
    ||sessionScope(current.data.session)!==sessionScope(data.session))throw new GovernanceError(401);
  return result.data as T;
 } catch(cause) {if(signal?.aborted)throw cause;throw cause instanceof GovernanceError?cause:new GovernanceError(503);}
}
export const governanceApi={
 audit:(office_id:string,page:number,size:number,filters:AuditFilters,signal?:AbortSignal)=>request<GovernancePage<AuditEvent>>(`/audit?${new URLSearchParams({office_id,page:String(page),size:String(size),...filters})}`,undefined,signal),
 export:(office_id:string,filters:AuditFilters,signal?:AbortSignal)=>request<AuditExport>('/audit/export',{office_id,...filters},signal),
 archives:(office_id:string,page:number,size:number,status:string,signal?:AbortSignal)=>request<GovernancePage<ArchiveEntry>>(`/archives?${new URLSearchParams({office_id,page:String(page),size:String(size),status})}`,undefined,signal),
 archive:(office_id:string,id:string,signal?:AbortSignal)=>request<{id:string}>(`/members/${id}/archive`,{office_id},signal),
 restore:(office_id:string,id:string,signal?:AbortSignal)=>request<{ok:true}>(`/archives/${id}/restore`,{office_id},signal),
};
export const governanceError=(cause:unknown)=>cause instanceof GovernanceError?cause:new GovernanceError(503);
