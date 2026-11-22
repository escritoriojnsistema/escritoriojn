import type {
  DiscountApprovalRequestInput,
  EligibleApprover,
  ExecuteApprovedPaymentInput,
  FinancialApprovalDecisionInput,
  FinancialApprovalItem,
  FinancialApprovalKind,
  ManualPaymentApprovalRequestInput,
} from '../../../shared/financialApprovals';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class FinancialApprovalsError extends Error {
  constructor(
    public status: number,
    public code?: string,
    serverMessage?: string,
  ) {
    super(
      serverMessage ||
        (status === 401
          ? 'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.'
          : status === 403
            ? 'Seu acesso não permite solicitar ou decidir esta autorização.'
            : status === 404
              ? 'Autorização ou cobrança não disponível no seu escopo.'
              : status === 409
                ? 'A cobrança foi alterada ou a autorização expirou/já foi utilizada. Atualize a tela.'
                : status === 422
                  ? 'Confira os valores, o aprovador e a justificativa informada.'
                  : 'Serviço de autorizações indisponível no momento.'),
    );
  }
}

async function callApprovals<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new FinancialApprovalsError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;

  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new FinancialApprovalsError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();

    const response = await authenticatedFetch(
      `/api/financial-approvals${path}`,
      {
        method: 'POST',
        body: JSON.stringify(body),
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${data.session.access_token}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(25_000),
          ...(signal ? [signal] : []),
        ]),
      },
      data.session,
    );
    const result: unknown = await response.json();
    signal?.throwIfAborted();
    const current = await supabase.auth.getSession();
    signal?.throwIfAborted();
    if (
      changedSession ||
      current.error ||
      !current.data.session ||
      current.data.session.user.id !== data.session.user.id ||
      sessionScope(current.data.session) !== started
    ) {
      throw new FinancialApprovalsError(401);
    }

    if (!response.ok) {
      const errObj =
        result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object'
          ? (result.error as { code?: unknown; message?: unknown })
          : undefined;
      throw new FinancialApprovalsError(
        response.status,
        typeof errObj?.code === 'string' ? errObj.code : undefined,
        typeof errObj?.message === 'string' ? errObj.message : undefined,
      );
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data) {
      throw new FinancialApprovalsError(503);
    }
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new FinancialApprovalsError(401);
    throw cause instanceof FinancialApprovalsError ? cause : new FinancialApprovalsError(503);
  } finally {
    unsubscribe?.();
  }
}

export const financialApprovalsApi = {
  approvers: (office_id: string, kind: FinancialApprovalKind, signal?: AbortSignal) =>
    callApprovals<{ items: EligibleApprover[]; backend_ready: boolean }>(
      '/approvers',
      { office_id, kind },
      signal,
    ),
  list: (
    office_id: string,
    scope: 'all' | 'assigned_to_me' | 'requested_by_me',
    kind: FinancialApprovalKind | 'all',
    page: number,
    signal?: AbortSignal,
  ) =>
    callApprovals<{
      items: FinancialApprovalItem[];
      total: number;
      page: number;
      page_size: number;
      backend_ready: boolean;
    }>('/list', { office_id, scope, kind, page }, signal),
  requestManualPayment: (input: ManualPaymentApprovalRequestInput, signal?: AbortSignal) =>
    callApprovals<FinancialApprovalItem>('/manual-payment/request', input, signal),
  requestDiscount: (input: DiscountApprovalRequestInput, signal?: AbortSignal) =>
    callApprovals<FinancialApprovalItem>('/discount/request', input, signal),
  decide: (approval_id: string, input: FinancialApprovalDecisionInput, signal?: AbortSignal) =>
    callApprovals<FinancialApprovalItem>(`/${approval_id}/decide`, input, signal),
  executePayment: (approval_id: string, input: ExecuteApprovedPaymentInput, signal?: AbortSignal) =>
    callApprovals<FinancialApprovalItem>(`/${approval_id}/execute-payment`, input, signal),
};
