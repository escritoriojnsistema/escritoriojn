import type { Session } from '@supabase/supabase-js';
import { endBrowserSession, supabase } from './browser';
import { sessionScope } from './sessionScope';

// A rejected old JWT may race a successful automatic refresh. Retry once with
// the newer token of the SAME provider session; never adopt another login or
// repeat an uncertain write after network/server errors.
export async function authenticatedFetch(path: string, init: RequestInit, expected: Session): Promise<Response> {
  let sent = expected;
  let response = await fetch(path, init);
  if (response.status !== 401) return response;
  init.signal?.throwIfAborted();
  const current = await supabase?.auth.getSession();
  const renewed = current?.data.session;
  init.signal?.throwIfAborted();
  if (renewed && !current?.error && renewed.access_token !== sent.access_token && sessionScope(renewed) === sessionScope(sent)) {
    sent = renewed;
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${sent.access_token}`);
    response = await fetch(path, {...init,headers});
  }
  if (response.status === 401) await endBrowserSession(sent);
  return response;
}
