import { createClient, type Session } from '@supabase/supabase-js';
import { validPublicConnection } from '../../../shared/connection';
import { endStoredSession, sessionStorage, type SessionEndReason } from './sessionStorage';
import { sessionScope } from './sessionScope';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const connected = validPublicConnection(url, key);
export const authStorageKey = connected ? `sb-${new URL(url).hostname.split('.')[0]}-auth-token` : '';
const boundedFetch: typeof fetch = (input, init) => fetch(input, { ...init, signal: AbortSignal.any([AbortSignal.timeout(12_000), ...(init?.signal ? [init.signal] : [])]) });
// Warm only the validated public provider origin while the user fills the form.
// The hint contains no credentials, account identifiers or invitation values.
if (connected) {
  const origin = new URL(url).origin;
  if (![...document.querySelectorAll<HTMLLinkElement>('link[rel="preconnect"]')].some(link => link.href === `${origin}/` || link.href === origin)) {
    const hint = document.createElement('link');
    hint.rel = 'preconnect'; hint.href = origin; hint.crossOrigin = 'anonymous';
    document.head.append(hint);
  }
}
export const supabase = validPublicConnection(url, key) ? createClient(url, key, {
  auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storage: sessionStorage, storageKey: authStorageKey,
    // Match each email to its own SDK verifier, including concurrent requests.
    experimental: { appendPkceFlowIdToRedirects: true },
  },
  global: { fetch: boundedFetch },
}) : null;
const endedEvent = 'jn-auth-session-ended';
type SessionEnded = { scope: string; reason: SessionEndReason };
export function onBrowserSessionEnded(callback: (ended: SessionEnded) => void): () => void {
  const local = (event: Event) => callback((event as CustomEvent<SessionEnded>).detail);
  const otherTab = (event: StorageEvent) => {
    const prefix = `${authStorageKey}:ended:`;
    if (event.key?.startsWith(prefix) && (event.newValue === 'expired' || event.newValue === 'signedOut')) callback({ scope: event.key.slice(prefix.length), reason: event.newValue });
  };
  window.addEventListener(endedEvent, local); window.addEventListener('storage', otherTab);
  return () => { window.removeEventListener(endedEvent, local); window.removeEventListener('storage', otherTab); };
}
export async function endBrowserSession(expected: Session, reason: SessionEndReason = 'expired'): Promise<boolean> {
  if (!supabase) return false;
  const removed = await endStoredSession(authStorageKey, expected, reason);
  if (!removed) return false;
  window.dispatchEvent(new CustomEvent<SessionEnded>(endedEvent, { detail: { scope: sessionScope(expected), reason } }));
  // This is the same token-scoped /logout request used by SDK signOut. Passing
  // the captured user token avoids reading/revoking a concurrently adopted login.
  // Local termination succeeds even if provider revocation is unavailable.
  void supabase.auth.admin.signOut(expected.access_token, 'local').catch(() => {});
  return removed;
}
// A portal attempt owns its own in-memory session. Rejecting it must never sign
// out a different session opened in this browser or another tab meanwhile.
export function createPortalClient() {
  return validPublicConnection(url, key) ? createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: `jn-portal-${crypto.randomUUID()}` },
    global: { fetch: boundedFetch },
  }) : null;
}
export function callbackUrl(area?: 'team' | 'client') { return `${window.location.origin}/auth/callback${area ? `?area=${area}` : ''}`; }
export function authError(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
  const status = error && typeof error === 'object' && 'status' in error ? Number(error.status) : 0;
  if (code === 'invalid_credentials') return 'E-mail ou senha incorretos.';
  if (code === 'email_not_confirmed') return 'Confirme seu e-mail antes de entrar.';
  if (code === 'over_email_send_rate_limit' || status === 429) return 'Muitas tentativas. Aguarde antes de tentar novamente.';
  const message = error && typeof error === 'object' && 'message' in error ? String(error.message) : '';
  if ((status >= 500 && /sending.*email|smtp/i.test(message)) || code === 'email_address_invalid' || code === 'email_address_not_authorized' || code === 'email_provider_disabled') return 'Não foi possível enviar o e-mail. O escritório precisa verificar o serviço de envio.';
  if (code === 'weak_password' || code === 'same_password') return 'Use uma senha nova com pelo menos 8 caracteres.';
  return 'Serviço indisponível no momento. Tente novamente em instantes.';
}
