import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { isAccessResponse, type AccessContext } from '../../../shared/access';
import { rememberRecovery, restoreRecovery, clearRecovery } from './recovery';
import { supabase } from './browser';
import { sessionScope } from './sessionScope';
type AccessState = { status: 'loading' | 'signedOut' | 'expired' | 'authorized' | 'denied' | 'unavailable'; contexts: AccessContext[] };
const initial: AccessState = { status: 'loading', contexts: [] };
const AuthContext = createContext({ ...initial, sessionKey: '', recovery: false, refresh: () => {}, endRecovery: () => {}, logout: async () => false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<AccessState>(initial);
  const [verifiedScope, setVerifiedScope] = useState<string>();
  const [recovery, setRecovery] = useState(false);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(n => n + 1), []);
  useEffect(() => {
    if (!supabase) { setSession(null); return; }
    // SDK callbacks stay synchronous: SDK operations inside them can deadlock its lock.
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'PASSWORD_RECOVERY' && next) { rememberRecovery(next); setRecovery(true); }
      else if (next) setRecovery(restoreRecovery(next));
      if (event === 'SIGNED_OUT') { clearRecovery(); setRecovery(false); setAccess({ status: 'signedOut', contexts: [] }); }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    window.addEventListener('focus', refresh);
    const timer = window.setInterval(refresh, 60_000);
    return () => { window.removeEventListener('focus', refresh); window.clearInterval(timer); };
  }, [refresh]);
  useEffect(() => {
    if (session === undefined) return;
    if (!session) { setAccess({ status: 'signedOut', contexts: [] }); return; }
    const controller = new AbortController();
    const scope = sessionScope(session);
    // Keep a verified environment while the SAME session is checked quietly.
    // A different session stays hidden until its own successful verification.
    void (async () => {
      try {
        const response = await fetch('/api/auth/context', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (controller.signal.aborted) return;
        if (response.status === 401) { setVerifiedScope(scope); setAccess({ status: 'expired', contexts: [] }); return; }
        if (response.status === 403) { setVerifiedScope(scope); setAccess({ status: 'denied', contexts: [] }); return; }
        const body: unknown = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        setVerifiedScope(scope);
        setAccess(isAccessResponse(body) && body.data.user.id === session.user.id ? { status: 'authorized', contexts: body.data.contexts } : { status: 'unavailable', contexts: [] });
      } catch { if (!controller.signal.aborted) { setVerifiedScope(scope); setAccess({ status: 'unavailable', contexts: [] }); } }
    })();
    return () => controller.abort();
  }, [session?.access_token, session === undefined, revision]);
  async function logout() {
    if (!supabase) return false;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return false;
    setRecovery(false); setAccess({ status: 'signedOut', contexts: [] }); return true;
  }
  const sessionKey = session ? sessionScope(session) : '';
  const visible = session === undefined || (session && sessionKey !== verifiedScope) ? initial : !session ? { status: 'signedOut' as const, contexts: [] } : access;
  return <AuthContext.Provider value={{ ...visible, sessionKey, recovery, refresh, logout, endRecovery: () => { clearRecovery(); setRecovery(false); } }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
