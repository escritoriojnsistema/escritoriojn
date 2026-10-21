import type {AccountNotices,NotificationFilter,NotificationRead} from '../../../shared/notifications';
import {supabase} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';
export class NotificationsError extends Error {constructor(public status:number){super(status===401?'Sua sessão expirou. Entre novamente.':status===403?'Seu acesso mudou. Verifique sua conta.':'Não foi possível atualizar as notificações. Tente novamente.');}}
async function request<T>(path: string, method: 'POST' | 'PATCH', body: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new NotificationsError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;
  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new NotificationsError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();
    const response = await authenticatedFetch(`/api/notifications${path}`, {
      method, body: JSON.stringify(body), cache: 'no-store',
      headers: { Authorization: `Bearer ${data.session.access_token}`, 'Content-Type': 'application/json' },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25_000), ...(signal ? [signal] : [])]),
    }, data.session);
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (changedSession || current.error || !current.data.session || current.data.session.user.id !== data.session.user.id || sessionScope(current.data.session) !== started) throw new NotificationsError(401);
    if (!response.ok) {
      throw new NotificationsError(response.status);
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data || typeof result.data !== 'object') throw new NotificationsError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new NotificationsError(401);
    throw cause instanceof NotificationsError ? cause : new NotificationsError(503);
  } finally { unsubscribe?.(); }
}
export const notificationsApi={
 summary:(office_id:string,signal?:AbortSignal)=>request<{unread:number}>('/summary','POST',{office_id},signal),
 search:(office_id:string,query:string,read:NotificationRead,kind:NotificationFilter,page:number,size:number,signal?:AbortSignal)=>request<AccountNotices>('/search','POST',{office_id,query,read,kind,page,size},signal),
 read:(office_id:string,id:string,signal?:AbortSignal)=>request<{ok:true}>('/read','POST',{office_id,id},signal),
};
export const noticesChanged=()=>window.dispatchEvent(new Event('jn:notices-changed'));
