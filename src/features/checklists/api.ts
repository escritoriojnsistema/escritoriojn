import type {ChecklistDefinition,ChecklistModel,ChecklistView,ChecklistState,ChecklistNotices} from '../../../shared/checklists';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class ChecklistsError extends Error {
  constructor(public status: number, public code?: string) {
    super(status===401?'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.':status===403?'Seu acesso não permite esta operação. Verifique com o proprietário.':status===404?'Registro indisponível no seu escopo. Confira a seleção.':code==='CHECKLIST_FILE_NOT_READY'?'O arquivo ainda não permite validação. Quarentena não é aprovação antimalware.':status===409?'O registro mudou ou a decisão não é permitida. Atualize antes de repetir.':status===422?'Confira os itens, o arquivo e o motivo (5 a 500 caracteres).':'Não foi possível concluir. Confira sua conexão e tente novamente.');
  }
}
async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new ChecklistsError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new ChecklistsError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/checklists${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new ChecklistsError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new ChecklistsError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new ChecklistsError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new ChecklistsError(401);
    throw cause instanceof ChecklistsError ? cause : new ChecklistsError(503);
  } finally { unsubscribe?.(); }
}
export const checklistsApi={
 model:(office_id:string,service_id:string,signal?:AbortSignal)=>request<ChecklistModel>('/model','POST',{office_id,service_id},signal),
 publish:(office_id:string,service_id:string,expected_version:number,definition:ChecklistDefinition,reason:string,signal?:AbortSignal)=>request<ChecklistModel>('/model/publish','POST',{office_id,service_id,expected_version,definition,reason},signal),
 view:(office_id:string,request_id:string,item_id:string|null,signal?:AbortSignal)=>request<ChecklistView>('/view','POST',{office_id,request_id,item_id},signal),
 apply:(office_id:string,request_id:string,item_id:string,signal?:AbortSignal)=>request<ChecklistView>('/apply','POST',{office_id,request_id,item_id},signal),
 update:(office_id:string,entry_id:string,expected_version:number,status:ChecklistState,file_id:string|null,reason:string,signal?:AbortSignal)=>request<ChecklistView>('/entries/update','POST',{office_id,entry_id,expected_version,status,file_id,reason},signal),
 notify:(office_id:string,instance_id:string,signal?:AbortSignal)=>request<{ok:true}>('/notify','POST',{office_id,instance_id},signal),
 notices:(office_id:string,page:number,size:number,unread_only:boolean,signal?:AbortSignal)=>request<ChecklistNotices>('/notifications','POST',{office_id,page,size,unread_only},signal),
 read:(office_id:string,id:string,signal?:AbortSignal)=>request<{ok:true}>('/notifications/read','POST',{office_id,id},signal),
};
export const checklistsError=(cause:unknown)=>cause instanceof ChecklistsError?cause:new ChecklistsError(503);
