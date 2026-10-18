import { createClient } from '@supabase/supabase-js';
import { validPublicConnection } from '../../../shared/connection';
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const supabase = validPublicConnection(url, key) ? createClient(url, key, {
  auth: {
    flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: false,
    // Match each email to its own SDK verifier, including concurrent requests.
    experimental: { appendPkceFlowIdToRedirects: true },
  },
}) : null;
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
