import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLocation } from 'react-router-dom';
import { isAccessResponse, type AccessContext } from '../../../shared/access';
import { normalizePathname, paths } from '../../app/routes';
import { rememberRecovery, restoreRecovery, clearRecovery } from './recovery';
import { authStorageKey, endBrowserSession, onBrowserSessionEnded, supabase } from './browser';
import { sessionScope } from './sessionScope';
import { isEndedSession, type SessionEndReason } from './sessionStorage';
import { consumeVerifiedPortal } from './verifiedPortalContext';
type AccessState = { status: 'loading' | 'signedOut' | 'expired' | 'authorized' | 'denied' | 'unavailable'; contexts: AccessContext[] };
const initial: AccessState = { status: 'loading', contexts: [] };
const AuthContext = createContext({ ...initial, sessionKey: '', recovery: false, refresh: () => {}, endRecovery: () => {}, logout: async () => false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const currentSession = useRef<Session | null>(null);
  const endedReason = useRef<SessionEndReason>('signedOut');
  const [access, setAccess] = useState<AccessState>(initial);
  const [verifiedScope, setVerifiedScope] = useState<string>();
  const [recovery, setRecovery] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  const pathname = normalizePathname(useLocation().pathname);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    const unsubscribeEnd = onBrowserSessionEnded(ended => {
      if (!currentSession.current || sessionScope(currentSession.current) !== ended.scope) return;
      endedReason.current = ended.reason;
      currentSession.current = null;
      setSession(null); setVerifiedScope(undefined);
      clearRecovery(); setRecovery(false); setAccess({ status: ended.reason, contexts: [] });
    });
    // SDK callbacks stay synchronous: SDK operations inside them can deadlock its lock.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (next && isEndedSession(authStorageKey, next)) return;
      if (next || currentSession.current) endedReason.current = 'signedOut';
      currentSession.current = next;
      setSession(next);
      if (event === 'PASSWORD_RECOVERY' && next) { rememberRecovery(next); setRecovery(true); }
      else if (next) setRecovery(restoreRecovery(next));
      if (event === 'SIGNED_OUT') { clearRecovery(); setRecovery(false); setAccess({ status: 'signedOut', contexts: [] }); }
    });
    return () => { data.subscription.unsubscribe(); unsubscribeEnd(); };
  }, []);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setAccess({ status: endedReason.current, contexts: [] }); return; }
    const controller = new AbortController();
    const scope = sessionScope(session);
    const portal = [paths.client, paths.clientPanel].some(path => path === pathname) ? 'client' : 'team';
    const handoff = consumeVerifiedPortal(session, portal);
    if (handoff) {
      setVerifiedScope(scope); setAccess({ status: 'authorized', contexts: handoff });
      return;
    }
    // Keep a verified environment while the SAME session is checked quietly.
    // A different session stays hidden until its own successful verification.
    void (async () => {
      try {
        const response = await fetch('/api/auth/context', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (controller.signal.aborted || currentSession.current?.access_token !== session.access_token) return;
        if (response.status === 401) { await endBrowserSession(session); return; }
        if (response.status === 403) { setVerifiedScope(scope); setAccess({ status: 'denied', contexts: [] }); return; }
        const body: unknown = response.ok ? await response.json() : null;
        if (controller.signal.aborted || currentSession.current?.access_token !== session.access_token) return;
        setVerifiedScope(scope);
        setAccess(isAccessResponse(body) && body.data.user.id === session.user.id ? { status: 'authorized', contexts: body.data.contexts } : { status: 'unavailable', contexts: [] });
      } catch { if (!controller.signal.aborted && currentSession.current?.access_token === session.access_token) { setVerifiedScope(scope); setAccess({ status: 'unavailable', contexts: [] }); } }
    })();
    return () => controller.abort();
  }, [session?.access_token, session === undefined, revision]);
  async function logout() {
    if (!supabase) return false;
    const expected = currentSession.current;
    return expected ? endBrowserSession(expected, 'signedOut') : true;
  }
  const sessionKey = session ? sessionScope(session) : '';
  const visible = session === undefined || (session && sessionKey !== verifiedScope) ? initial : !session ? { status: endedReason.current, contexts: [] } : access;
  return <AuthContext.Provider value={{ ...visible, sessionKey, recovery, refresh, logout, endRecovery: () => { clearRecovery(); setRecovery(false); } }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
