import type { Session } from '@supabase/supabase-js';
import { isAccessResponse, type AccessContext } from '../../../shared/access';
import { sessionScope } from './sessionScope';
export type Portal = 'team' | 'client';
type Verification = { uid: string; scope: string; token: string; refresh: string; portal: Portal; contexts: AccessContext[]; until: number; timer: ReturnType<typeof setTimeout> };
let pending: Verification | undefined;
function clear() { if (pending) clearTimeout(pending.timer); pending = undefined; }
export function rememberVerifiedPortal(session: Session, portal: Portal, body: unknown): () => void {
  clear();
  if (!isAccessResponse(body) || body.data.user.id !== session.user.id
    || !body.data.contexts.every(context => portal === 'client' ? context.role_code === 'client' : context.role_code !== 'client')) return () => {};
  const entry: Verification = {
    uid: session.user.id, scope: sessionScope(session), token: session.access_token, refresh: session.refresh_token, portal,
    contexts: structuredClone(body.data.contexts), until: Date.now() + 15_000, timer: setTimeout(clear, 15_000),
  };
  pending = entry;
  return () => { if (pending === entry) clear(); };
}
export function consumeVerifiedPortal(session: Session, portal: Portal): AccessContext[] | undefined {
  const verified = pending;
  clear();
  if (verified && verified.until > Date.now() && verified.uid === session.user.id && verified.scope === sessionScope(session)
    && verified.token === session.access_token && verified.refresh === session.refresh_token && verified.portal === portal) return verified.contexts;
}
