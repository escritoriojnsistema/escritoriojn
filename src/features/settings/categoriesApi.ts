import type { CategoriesState, CategoryCommand } from '../../../shared/categories';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class CategoriesError extends Error {
  constructor(public status: number, public code?: string) {
    super(status === 401 ? 'Sua sessão expirou. Entre novamente para continuar.'
      : status === 403 ? 'Seu acesso não permite esta operação em categorias.'
      : status === 404 ? 'A categoria não está mais disponível. Atualize a lista.'
      : code === 'CATEGORY_IN_USE' ? 'O histórico desta categoria foi preservado. Atualize a lista para conferir o estado atual.'
      : status === 409 ? 'A categoria mudou ou este nome já existe. Atualize a lista e confira os dados.'
      : status === 422 ? 'Confira o nome, a categoria, a versão e o motivo.'
      : 'Não foi possível confirmar a operação. Tente novamente com os mesmos dados.');
  }
}
async function request(path: string, body: unknown, signal?: AbortSignal): Promise<CategoriesState> {
  if (!supabase) throw new CategoriesError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new CategoriesError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true; controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/categories${path}`, {
      method: 'POST', body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new CategoriesError(401);
    if (!response.ok) {
      const code = result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object' && 'code' in result.error ? String(result.error.code) : undefined;
      throw new CategoriesError(response.status, code);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new CategoriesError(503);
    return result.data as CategoriesState;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new CategoriesError(401);
    throw cause instanceof CategoriesError ? cause : new CategoriesError(503);
  } finally { unsubscribe?.(); }
}
export const categoriesApi = {
  state: (office_id: string, signal?: AbortSignal) => request('/state', { office_id }, signal),
  command: (office_id: string, command: CategoryCommand, idempotency_key: string, signal?: AbortSignal) => request('/command', { office_id, command, idempotency_key }, signal),
};
export const categoriesError = (cause: unknown) => cause instanceof CategoriesError ? cause : new CategoriesError(503);
