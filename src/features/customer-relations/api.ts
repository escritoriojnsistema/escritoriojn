import type { CustomerRelationsState, CustomerRelationsRequest, CustomerRelationCandidates, CustomerRelationCandidatesRequest, CustomerRelationCommand, CustomerMergePreview, CustomerMergePreviewRequest, CustomerMergeResult, CustomerMergeRequest } from '../../../shared/customerRelations';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';
import { CustomersError } from '../customers/api';
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
    const response = await authenticatedFetch(`/api/customer-relations${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
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
export const relationsApi = {
  state: (body: CustomerRelationsRequest, signal?: AbortSignal) => request<CustomerRelationsState>('/state', 'POST', body, signal),
  candidates: (body: CustomerRelationCandidatesRequest, signal?: AbortSignal) => request<CustomerRelationCandidates>('/candidates', 'POST', body, signal),
  command: (body: CustomerRelationCommand, signal?: AbortSignal) => request<CustomerRelationsState>('/command', 'POST', body, signal),
  preview: (body: CustomerMergePreviewRequest, signal?: AbortSignal) => request<CustomerMergePreview>('/merge/preview', 'POST', body, signal),
  merge: (body: CustomerMergeRequest, signal?: AbortSignal) => request<CustomerMergeResult>('/merge', 'POST', body, signal),
};
