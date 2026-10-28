import { projectAccessContexts, uuidPattern } from '../../../shared/access';
import { paths } from '../../app/routes';
import { createPortalClient, onBrowserSessionEnded, supabase } from './browser';
import { guardAdoption } from './sessionStorage';
import { rememberVerifiedPortal } from './verifiedPortalContext';
import { sessionScope } from './sessionScope';

export class PortalAccessError extends Error {}

export async function portalLogin(email: string, password: string, team: boolean, invite: string | null, signal: AbortSignal): Promise<string> {
  const attempt = createPortalClient();
  if (!supabase || !attempt) throw new PortalAccessError('Não foi possível verificar seu acesso. Tente novamente em instantes.');
  const superseded = new AbortController();
  const current = AbortSignal.any([signal, superseded.signal]);
  let adoptingToken: string | null = null;
  let adopted = false;
  let cancelHandoff = () => {};
  let previousScope: string | undefined;
  // Abort an outstanding attempt if another tab/flow changes the main session.
  // SDK callbacks only signal cancellation; no nested SDK operations/locks.
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'INITIAL_SESSION' && !(event === 'SIGNED_IN' && session?.access_token === adoptingToken)) superseded.abort();
  });
  const unsubscribeEnd = onBrowserSessionEnded(ended => { if (ended.scope === previousScope) superseded.abort(); });
  try {
    const previousSession = (await supabase.auth.getSession()).data.session;
    const previousToken = previousSession?.access_token ?? null;
    previousScope = previousSession ? sessionScope(previousSession) : undefined;
    current.throwIfAborted();
    const { data, error } = await attempt.auth.signInWithPassword({ email, password });
    if (error) throw error;
    current.throwIfAborted();
    if (!data.session) throw new PortalAccessError('Não foi possível verificar seu acesso. Tente novamente em instantes.');
    const invitation = team && invite && uuidPattern.test(invite) ? invite : null;
    if (!invitation) {
      let allowed = false;
      let denied = false;
      try {
        // This isolated SDK owns the provider session from signInWithPassword.
        // PostgREST verifies its JWT; RLS checks the live session and authority.
        // Main-session adoption still performs the official SDK getUser below.
        const { data: rows, error: contextError } = await attempt.rpc('my_access_context')
          .abortSignal(AbortSignal.any([current, AbortSignal.timeout(12_000)]));
        current.throwIfAborted();
        const contexts = contextError ? null : projectAccessContexts(rows, data.session.user.id, team ? 'team' : 'client');
        denied = contexts !== null && contexts.length === 0;
        allowed = contexts !== null && contexts.length > 0;
        if (allowed) cancelHandoff = rememberVerifiedPortal(data.session, team ? 'team' : 'client', { data: { user: { id: data.session.user.id }, contexts } });
      } catch { current.throwIfAborted(); }
      if (!allowed) throw new PortalAccessError(denied ? 'Este portal não está disponível para esta conta. Use o portal correto.' : 'Não foi possível verificar seu acesso. Tente novamente em instantes.');
    }
    current.throwIfAborted();
    adoptingToken = data.session.access_token;
    const { error: adoptionError } = await guardAdoption(adoptingToken, { signal: current, previousToken }, () => supabase!.auth.setSession({ access_token: data.session!.access_token, refresh_token: data.session!.refresh_token }));
    if (adoptionError) throw adoptionError;
    adopted = true;
    current.throwIfAborted();
    // Pending invite recipients are authorized by the invitation API itself.
    return invitation ? `${paths.invitation}?id=${encodeURIComponent(invitation)}` : team ? paths.panel : paths.clientPanel;
  } finally {
    listener.subscription.unsubscribe();
    unsubscribeEnd();
    if (!adopted) {
      cancelHandoff();
      try { await attempt.auth.signOut({ scope: 'local' }); } catch { /* Only the isolated attempt is affected. */ }
    }
    await attempt.auth.dispose();
  }
}
