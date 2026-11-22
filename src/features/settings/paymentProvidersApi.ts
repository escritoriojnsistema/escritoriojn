import type {
  CheckoutMethod,
  PaymentProvidersState,
  ProviderEnvironment,
} from '../../../shared/paymentCheckout';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class PaymentProvidersError extends Error {
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
            ? 'Somente super administradores e administradores autorizados podem alterar bancos e pagamentos.'
            : status === 409
              ? 'As configurações foram alteradas em outra sessão. Recarregue antes de salvar.'
              : status === 422
                ? 'Confira os dados preenchidos antes de salvar.'
                : 'Não foi possível comunicar com o servidor de configurações de pagamento.'),
    );
  }
}

async function callProviders<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  if (!supabase) throw new PaymentProvidersError(503);
  const controller = new AbortController();
  let changedSession = false;
  let unsubscribe: (() => void) | undefined;

  try {
    signal?.throwIfAborted();
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.access_token) throw new PaymentProvidersError(401);
    const started = sessionScope(data.session);
    const subscription = supabase.auth.onAuthStateChange((_event, next) => {
      if (!next || next.user.id !== data.session!.user.id || sessionScope(next) !== started) {
        changedSession = true;
        controller.abort();
      }
    });
    unsubscribe = () => subscription.data.subscription.unsubscribe();

    const response = await authenticatedFetch(
      `/api/payment-providers${path}`,
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
      throw new PaymentProvidersError(401);
    }

    if (!response.ok) {
      const errObj =
        result && typeof result === 'object' && 'error' in result && result.error && typeof result.error === 'object'
          ? (result.error as { code?: unknown; message?: unknown })
          : undefined;
      throw new PaymentProvidersError(
        response.status,
        typeof errObj?.code === 'string' ? errObj.code : undefined,
        typeof errObj?.message === 'string' ? errObj.message : undefined,
      );
    }
    if (!result || typeof result !== 'object' || !('data' in result) || !result.data) {
      throw new PaymentProvidersError(503);
    }
    return result.data as T;
  } catch (cause) {
    if (signal?.aborted) throw cause;
    if (changedSession) throw new PaymentProvidersError(401);
    throw cause instanceof PaymentProvidersError ? cause : new PaymentProvidersError(503);
  } finally {
    unsubscribe?.();
  }
}

export const paymentProvidersApi = {
  state: (office_id: string, signal?: AbortSignal) =>
    callProviders<PaymentProvidersState>('/state', { office_id }, signal),
  saveProvider: (
    input: {
      office_id: string;
      provider_id: string | null;
      provider_code: string;
      institution_label: string;
      environment: ProviderEnvironment;
      enabled_methods: CheckoutMethod[];
      receiving_account_id: string | null;
      financial_unit_id: string | null;
      credential_ref: string | null;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callProviders<PaymentProvidersState>('/provider/save', input, signal),
  validateProvider: (office_id: string, provider_id: string, signal?: AbortSignal) =>
    callProviders<PaymentProvidersState>('/provider/validate', { office_id, provider_id }, signal),
  savePix: (
    input: {
      office_id: string;
      provider_id: string | null;
      enabled: boolean;
      dynamic_qr_enabled: boolean;
      copy_paste_enabled: boolean;
      expiration_minutes: number;
      reconciliation_enabled: boolean;
      refund_enabled: boolean;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callProviders<PaymentProvidersState>('/pix/save', input, signal),
  saveCards: (
    input: {
      office_id: string;
      provider_id: string | null;
      enabled: boolean;
      credit_enabled: boolean;
      debit_enabled: boolean;
      installments_enabled: boolean;
      max_installments: number;
      min_installment_cents: number;
      fee_policy_note: string | null;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callProviders<PaymentProvidersState>('/cards/save', input, signal),
  saveTerminal: (
    input: {
      office_id: string;
      terminal_id: string | null;
      provider_id: string | null;
      label: string;
      manufacturer: string;
      model: string;
      provider_name: string;
      connection_mode: 'cloud_api' | 'local_agent_connector';
      unit_id: string | null;
      idempotency_key: string;
    },
    signal?: AbortSignal,
  ) => callProviders<PaymentProvidersState>('/terminal/save', input, signal),
  testTerminal: (office_id: string, terminal_id: string, signal?: AbortSignal) =>
    callProviders<PaymentProvidersState>('/terminal/test', { office_id, terminal_id }, signal),
  deactivateTerminal: (
    office_id: string,
    terminal_id: string,
    idempotency_key: string,
    signal?: AbortSignal,
  ) =>
    callProviders<PaymentProvidersState>(
      '/terminal/deactivate',
      { office_id, terminal_id, idempotency_key },
      signal,
    ),
};
