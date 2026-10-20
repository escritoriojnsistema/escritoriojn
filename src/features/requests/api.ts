import type { CreateRequestInput, RequestDetail, RequestPage, RequestOptions, RequestOptionKind, RequestMutation, RequestMutationResult, RequestFilterStatus } from '../../../shared/requests';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class RequestsError extends Error {
  constructor(public status: number, public code?: string) {
    super(status === 401 ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.'
      : status === 403 ? 'Seu acesso não permite esta operação. Verifique com o proprietário.'
      : status === 404 ? 'Esta solicitação não está disponível. Volte à lista e confira seu acesso.'
      : code === 'REQUEST_IDEMPOTENCY_CONFLICT' ? 'Esta abertura já foi registrada com outros dados. Confira a lista antes de iniciar outra.'
      : code === 'SERVICE_NOT_EFFECTIVE' ? 'Um serviço não possui versão vigente. Confira o catálogo.'
      : status === 409 ? 'A solicitação mudou. Reabra o atendimento antes de alterar novamente.'
      : status === 422 ? 'Confira os dados, participantes e limites de cada serviço.'
      : 'Atendimento indisponível no momento. Confira sua conexão e tente novamente.');
  }
}
async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new RequestsError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new RequestsError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/requests${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new RequestsError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new RequestsError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new RequestsError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new RequestsError(401);
    throw cause instanceof RequestsError ? cause : new RequestsError(503);
  } finally { unsubscribe?.(); }
}
export const requestsApi = {
 search:(office_id:string,query:string,scope:'mine'|'queue',status:RequestFilterStatus,page:number,size:number,signal?:AbortSignal)=>request<RequestPage>('/search','POST',{office_id,query,scope,status,page,size},signal),
 options:(office_id:string,kind:RequestOptionKind,query:string,page:number,size:number,signal?:AbortSignal)=>request<RequestOptions>('/options','POST',{office_id,kind,query,page,size},signal),
 detail:(office_id:string,id:string,page=1,signal?:AbortSignal)=>request<RequestDetail>(`/${id}/detail`,'POST',{office_id,page},signal),
 create:(office_id:string,input:CreateRequestInput,idempotency_key:string,signal?:AbortSignal)=>request<RequestDetail>('','POST',{office_id,request:input,idempotency_key},signal),
 mutate:(office_id:string,id:string,expected_version:number,mutation:RequestMutation,signal?:AbortSignal)=>request<RequestMutationResult>(`/${id}/actions`,'POST',{office_id,expected_version,mutation},signal),
};
export const requestsError=(cause:unknown)=>cause instanceof RequestsError?cause:new RequestsError(503);
