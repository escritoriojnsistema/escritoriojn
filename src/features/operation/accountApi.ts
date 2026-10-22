import type {AccountData,AccountInput} from '../../../shared/account';
import type {RequestDetail} from '../../../shared/requests';
import {supabase,callbackUrl,authError} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';
export class AccountError extends Error {constructor(public status:number,public code?:string){super(status===401?'Sua sessão expirou. Entre novamente.':status===403?'Seu acesso não permite esta alteração.':status===409?'Os dados mudaram ou já estão em uso. Reabra e confira antes de enviar.':status===422?'Confira nome, CPF e e-mail.':'Não foi possível concluir. Confira sua conexão e tente novamente.');}}
async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new AccountError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new AccountError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/account${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new AccountError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new AccountError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new AccountError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new AccountError(401);
    throw cause instanceof AccountError ? cause : new AccountError(503);
  } finally { unsubscribe?.(); }
}

export const accountApi={
 read:(office_id:string,signal?:AbortSignal)=>request<AccountData>('/read','POST',{office_id},signal),
 save:(office_id:string,expected_version:string,input:AccountInput,signal?:AbortSignal)=>request<AccountData>('/save','POST',{office_id,expected_version,input},signal),
 create:(office_id:string,expected_version:string,input:AccountInput,idempotency_key:string,signal?:AbortSignal)=>request<RequestDetail>('/corrections','POST',{office_id,expected_version,input,idempotency_key},signal),
 apply:(office_id:string,request_id:string,expected_version:number,input:AccountInput,signal?:AbortSignal)=>request<RequestDetail>('/apply','POST',{office_id,request_id,expected_version,input},signal),
};
export async function confirmAccountEmail(email:string,expectedScope:string,client:boolean,signal?:AbortSignal){
 if(!supabase)throw new AccountError(503);
 signal?.throwIfAborted();
 const before=await supabase.auth.getSession();
 if(!before.data.session||sessionScope(before.data.session)!==expectedScope)throw new AccountError(401);
 signal?.throwIfAborted();
 const {error}=await supabase.auth.updateUser({email},{emailRedirectTo:callbackUrl(client?'client':'team')});
 signal?.throwIfAborted();
 const after=await supabase.auth.getSession();
 if(!after.data.session||sessionScope(after.data.session)!==expectedScope)throw new AccountError(401);
 if(error)throw new Error(authError(error));
}
