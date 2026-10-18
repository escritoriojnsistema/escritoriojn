import { isAccessResponse, uuidPattern } from '../../../shared/access';
import { paths } from '../../app/routes';
import { createPortalClient, supabase } from './browser';
import { guardAdoption } from './sessionStorage';

export class PortalAccessError extends Error {}

export async function portalLogin(email: string, password: string, team: boolean, invite: string | null, signal: AbortSignal): Promise<string> {
  const attempt = createPortalClient();
  if (!supabase || !attempt) throw new PortalAccessError('Não foi possível verificar seu acesso. Tente novamente em instantes.');
  const superseded = new AbortController();
  const current = AbortSignal.any([signal, superseded.signal]);
  let adoptingToken: string | null = null;
  let adopted = false;
  // Abort an outstanding attempt if another tab/flow changes the main session.
  // SDK callbacks only signal cancellation; no nested SDK operations/locks.
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (event !== 'INITIAL_SESSION' && !(event === 'SIGNED_IN' && session?.access_token === adoptingToken)) superseded.abort();
  });
  try {
    const previousToken = (await supabase.auth.getSession()).data.session?.access_token ?? null;
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
        const response = await fetch(`/api/auth/context?area=${team ? 'team' : 'client'}`, {
          headers: { Authorization: `Bearer ${data.session.access_token}` }, cache: 'no-store',
          signal: AbortSignal.any([current, AbortSignal.timeout(12_000)]),
        });
        denied = response.status === 403;
        const body: unknown = response.ok ? await response.json() : null;
        allowed = isAccessResponse(body) && body.data.user.id === data.session.user.id
          && body.data.contexts.every(context => team ? context.role_code !== 'client' : context.role_code === 'client');
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
    if (!adopted) {
      try { await attempt.auth.signOut({ scope: 'local' }); } catch { /* Only the isolated attempt is affected. */ }
    }
    await attempt.auth.dispose();
  }
}
