import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { useLocation } from 'react-router-dom';
import { isAccessResponse, type AccessContext } from '../../../shared/access';
import { rememberRecovery, restoreRecovery, clearRecovery } from './recovery';
import { supabase } from './browser';
type AccessState = { status: 'loading' | 'signedOut' | 'expired' | 'authorized' | 'denied' | 'unavailable'; contexts: AccessContext[] };
const initial: AccessState = { status: 'loading', contexts: [] };
const AuthContext = createContext({ ...initial, recovery: false, refresh: () => {}, endRecovery: () => {}, logout: async () => false });
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [access, setAccess] = useState<AccessState>(initial);
  const [verifiedToken, setVerifiedToken] = useState<string>();
  const [recovery, setRecovery] = useState(false);
  const [revision, setRevision] = useState(0);
  const { pathname } = useLocation();
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
    setAccess(initial);
    setVerifiedToken(session.access_token);
    void (async () => {
      try {
        const response = await fetch('/api/auth/context', { headers: { Authorization: `Bearer ${session.access_token}` }, cache: 'no-store', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]) });
        if (controller.signal.aborted) return;
        if (response.status === 401) { setAccess({ status: 'expired', contexts: [] }); return; }
        if (response.status === 403) { setAccess({ status: 'denied', contexts: [] }); return; }
        const body: unknown = response.ok ? await response.json() : null;
        if (controller.signal.aborted) return;
        setAccess(isAccessResponse(body) ? { status: 'authorized', contexts: body.data.contexts } : { status: 'unavailable', contexts: [] });
      } catch { if (!controller.signal.aborted) setAccess({ status: 'unavailable', contexts: [] }); }
    })();
    return () => controller.abort();
  }, [session?.access_token, session === undefined, pathname, revision]);
  async function logout() {
    if (!supabase) return false;
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) return false;
    setRecovery(false); setAccess({ status: 'signedOut', contexts: [] }); return true;
  }
  const visible = session === undefined || (session && session.access_token !== verifiedToken) ? initial : !session ? { status: 'signedOut' as const, contexts: [] } : access;
  return <AuthContext.Provider value={{ ...visible, recovery, refresh, logout, endRecovery: () => { clearRecovery(); setRecovery(false); } }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
