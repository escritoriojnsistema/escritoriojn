import type {
  CheckoutIntent,
  CheckoutMethod,
  ClientCheckoutSummary,
  TerminalSaleMode,
} from '../../../shared/paymentCheckout';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class PaymentCheckoutError extends Error {
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
            ? 'Seu acesso não permite realizar esta cobrança.'
            : status === 404
              ? 'Cobrança ou transação não encontrada no seu escopo.'
              : status === 409
                ? 'A cobrança foi atualizada. Recarregue antes de iniciar novo pagamento.'
                : code === 'PROVIDER_NOT_CONFIGURED'
                  ? 'Provedor não configurado para este escritório.'
                  : 'Não foi possível comunicar com o serviço de pagamentos no momento.'),
    );
  }
}

async function callCheckout<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new PaymentCheckoutError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;

  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new PaymentCheckoutError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();

    const response = await authenticatedFetch(
      `/api/payment-checkout${path}`,
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
      throw new PaymentCheckoutError(401);
    }

    if (!response.ok) {
      const errObj =
        result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object'
          ? (result.error as { code?: unknown; message?: unknown })
          : undefined;
      throw new PaymentCheckoutError(
        response.status,
        typeof errObj?.code === 'string' ? errObj.code : undefined,
        typeof errObj?.message === 'string' ? errObj.message : undefined,
      );
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data) {
      throw new PaymentCheckoutError(503);
    }
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new PaymentCheckoutError(401);
    throw cause instanceof PaymentCheckoutError ? cause : new PaymentCheckoutError(503);
  } finally {
    unsubscribe?.();
  }
}

export const paymentCheckoutApi = {
  clientSummary: (office_id: string, charge_id: string, signal?: AbortSignal) =>
    callCheckout<ClientCheckoutSummary>('/client/summary', { office_id, charge_id }, signal),
  createClientIntent: (
    input: {
      office_id: string;
      charge_id: string;
      expected_charge_version: number;
      method: CheckoutMethod;
      installments_count: number;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callCheckout<CheckoutIntent>('/client/intent', input, signal),
  intentStatus: (office_id: string, intent_id: string, signal?: AbortSignal) =>
    callCheckout<CheckoutIntent>('/intent/status', { office_id, intent_id }, signal),
  staffGeneratePix: (
    input: {
      office_id: string;
      charge_id: string;
      expected_charge_version: number;
      amount_cents: number;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callCheckout<CheckoutIntent>('/staff/pix', input, signal),
  staffStartTerminal: (
    input: {
      office_id: string;
      charge_id: string;
      expected_charge_version: number;
      terminal_id: string;
      sale_mode: TerminalSaleMode;
      installments_count: number;
      amount_cents: number;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callCheckout<CheckoutIntent>('/staff/card-terminal', input, signal),
};
