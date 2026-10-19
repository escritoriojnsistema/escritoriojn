import type { CustomerDetail, CustomerInput, CustomerPage, CustomerSearch } from '../../../shared/customers';
import { supabase } from '../auth/browser';
import { sessionScope } from '../auth/sessionScope';

export class CustomersError extends Error {
  constructor(public status: number, public code?: string) {
    super(status === 401 ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.'
      : status === 403 ? 'Seu acesso não permite esta operação. Verifique com o proprietário.'
      : status === 404 ? 'Esta ficha não está disponível. Volte à lista e confira seu acesso.'
      : code === 'CUSTOMER_DUPLICATE' ? 'Este CPF ou CNPJ já está cadastrado neste escritório. Confira a ficha existente.'
      : status === 409 ? 'A ficha mudou desde a consulta. Reabra a ficha antes de alterar novamente.'
      : status === 422 ? 'Confira os dados da ficha e tente novamente.'
      : 'Serviço indisponível no momento. Confira sua conexão e tente novamente.');
  }
}
async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new CustomersError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new CustomersError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await fetch(`/api/customers${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    });
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new CustomersError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new CustomersError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new CustomersError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new CustomersError(401);
    throw cause instanceof CustomersError ? cause : new CustomersError(503);
  } finally { unsubscribe?.(); }
}
export const customersApi = {
  search: (body: CustomerSearch, signal?: AbortSignal) => request<CustomerPage>('/search', 'POST', body, signal),
  create: (office_id: string, customer: CustomerInput, signal?: AbortSignal) => request<CustomerDetail>('', 'POST', { office_id, customer }, signal),
  detail: (office_id: string, id: string, signal?: AbortSignal) => request<CustomerDetail>(`/${id}/detail`, 'POST', { office_id }, signal),
  update: (office_id: string, id: string, customer: CustomerInput, version: number, signal?: AbortSignal) => request<CustomerDetail>(`/${id}`, 'PATCH', { office_id, customer, version }, signal),
};
export const customersError = (cause: unknown) => cause instanceof CustomersError ? cause : new CustomersError(503);
