import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import type { CreateInvitation, InvitationState, InvitationVerification, SetDelegation, SetMember, TeamDashboard } from '../../../shared/team';

export class TeamError extends Error {
  constructor(public status: number) {
    super(status === 401 ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.' : status === 403 ? 'Seu acesso não permite esta operação. Verifique com o proprietário.' : status === 409 ? 'Os dados mudaram ou esta operação não está mais disponível. Atualize a lista.' : status === 410 ? 'Este convite não está disponível. Solicite um novo convite ao escritório.' : status === 422 ? 'Confira os dados preenchidos e tente novamente.' : status === 429 ? 'Muitas tentativas. Aguarde antes de tentar novamente.' : 'Serviço indisponível no momento. Confira sua conexão e tente novamente.');
  }
}
async function request<T>(path: string, method = 'GET', body?: unknown, signal?: AbortSignal): Promise<T> {
  if (!supabase) throw new TeamError(503);
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new TeamError(401);
    const response = await authenticatedFetch(`/api/team${path}`, {
      method, headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }), cache: 'no-store',
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25_000)]) : AbortSignal.timeout(25_000),
    }, data.session);
    if (!response.ok) throw new TeamError(response.status);
    const result: unknown = await response.json();
    if (!result || typeof result !== 'object' || !('data' in result)) throw new TeamError(503);
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    throw cause instanceof TeamError ? cause : new TeamError(503);
  }
}
export const teamApi = {
  dashboard: (office: string, kind: 'members' | 'invitations', page: number, query: string, status: string, signal?: AbortSignal) => request<TeamDashboard>(`?${new URLSearchParams({ office_id: office, kind, page: String(page), query, status })}`, 'GET', undefined, signal),
  invite: (body: CreateInvitation) => request<{ id: string; expires_at: string; delivery: 'sent' | 'failed' | 'pending' }>('/invitations', 'POST', body),
  send: (id: string, office_id: string) => request<{ delivery: 'sent' | 'failed' | 'pending' }>(`/invitations/${id}/send`, 'POST', { office_id }),
  revokeInvitation: (id: string, office_id: string) => request(`/invitations/${id}/revoke`, 'POST', { office_id }),
  member: (id: string, body: SetMember) => request(`/members/${id}`, 'PATCH', body),
  delegation: (id: string, body: SetDelegation) => request(`/delegations/${id}`, 'PUT', body),
  revokeDelegation: (id: string, office_id: string) => request(`/delegations/${id}/revoke`, 'POST', { office_id }),
  state: (id: string, signal?: AbortSignal) => request<InvitationState>(`/invitations/${id}/state`, 'GET', undefined, signal),
  verify: (id: string, body: { full_name: string; cpf: string; role_code: string }) => request<InvitationVerification>(`/invitations/${id}/verify`, 'POST', body),
  accept: (id: string) => request<{ office_id: string; role_code: string }>(`/invitations/${id}/accept`, 'POST', {}),
};
export function teamError(cause: unknown) { return cause instanceof TeamError ? cause : new TeamError(503); }
export function deliveryMessage(delivery: string) {
  return delivery === 'sent' ? 'E-mail de convite enviado. A pessoa ainda precisa conferir os dados e aceitar.' : delivery === 'failed' ? 'Convite criado, mas o e-mail não pôde ser enviado. Use Reenviar na aba Convites.' : 'Convite criado. O envio do e-mail ainda não foi confirmado. Confira a aba Convites antes de reenviar.';
}
