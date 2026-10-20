import type { ServiceDetail, ServiceInput, ServicePage, ServiceAdjustment, ServiceQuote } from '../../../shared/services';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class ServicesError extends Error {
  constructor(public status: number, public code?: string) {
    super(status === 401 ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.'
      : status === 403 ? 'Seu acesso não permite esta operação. Verifique com o proprietário.'
      : status === 404 ? 'Este serviço não está disponível. Volte à lista e confira seu acesso.'
      : code === 'SERVICE_DUPLICATE' ? 'Este código já existe no escritório. Confira o serviço cadastrado.'
      : code === 'SERVICE_NOT_EFFECTIVE' ? 'Este serviço ainda não possui versão vigente.'
      : status === 409 ? 'O catálogo mudou. Reabra o serviço antes de publicar outra versão.'
      : status === 422 ? 'Confira os dados, a vigência e os limites da política.'
      : 'Serviço indisponível no momento. Confira sua conexão e tente novamente.');
  }
}
async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new ServicesError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new ServicesError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/services${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new ServicesError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new ServicesError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new ServicesError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new ServicesError(401);
    throw cause instanceof ServicesError ? cause : new ServicesError(503);
  } finally { unsubscribe?.(); }
}
export const servicesApi = {
  search: (office_id: string, query: string, page: number, size: number, signal?: AbortSignal) => request<ServicePage>('/search','POST',{office_id,query,page,size},signal),
  detail: (office_id: string, id: string, page=1, signal?: AbortSignal) => request<ServiceDetail>(`/${id}/detail`,'POST',{office_id,page},signal),
  create: (office_id: string, service: ServiceInput, reason: string, signal?: AbortSignal) => request<ServiceDetail>('','POST',{office_id,service,reason},signal),
  publish: (office_id: string, id: string, service: ServiceInput, expected_version: number, reason: string, signal?: AbortSignal) => request<ServiceDetail>(`/${id}/versions`,'POST',{office_id,service,expected_version,reason},signal),
  quote: (office_id: string, id: string, quantity: number, adjustment: ServiceAdjustment, signal?: AbortSignal) => request<ServiceQuote>(`/${id}/quote`,'POST',{office_id,quantity,adjustment},signal),
};
export const servicesError=(cause:unknown)=>cause instanceof ServicesError?cause:new ServicesError(503);
