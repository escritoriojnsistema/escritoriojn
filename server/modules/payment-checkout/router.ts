import { createClient } from '@supabase/supabase-js';
import { Router, json, type Request, type Response } from 'express';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import { positive } from '../requests/validation.js';
import { validPublicConnection } from '../../../shared/connection.js';
import {
  checkoutMethods,
  clientPaymentStates,
  isValidWebhookEnvelope,
  terminalOperationStates,
  terminalSaleModes,
  type CheckoutIntent,
  type CheckoutMethod,
  type ClientCheckoutSummary,
  type ClientPaymentState,
  type SettlementStage,
  type TerminalOperationState,
} from '../../../shared/paymentCheckout.js';
import { isValidIdempotencyKey } from '../../../shared/requestDeletion.js';
import {
  resolveProviderWebhookSecret,
  verifyCronBearer,
  verifyWebhookHmac,
} from './webhookSecurity.js';

export const paymentCheckoutRouter = Router();

paymentCheckoutRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.vary('Authorization');
  next();
});

const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

const STATUS_MAP: Record<string, number> = {
  AUTH_REQUIRED: 401,
  CHECKOUT_FORBIDDEN: 403,
  CASH_FORBIDDEN: 403,
  CHARGES_FORBIDDEN: 403,
  CHARGE_NOT_FOUND: 404,
  INTENT_NOT_FOUND: 404,
  TERMINAL_NOT_FOUND: 404,
  CHARGE_CONFLICT: 409,
  PAYMENT_CONFLICT: 409,
  CHECKOUT_VALIDATION: 422,
  METHOD_UNSUPPORTED: 422,
  PROVIDER_NOT_CONFIGURED: 503,
  PROVIDER_UNAVAILABLE: 503,
};

function mapSafeError(res: Response, error: { code?: string; message?: string }) {
  if (error.code && RPC_MISSING_CODES.has(error.code)) {
    errorResponse(
      res,
      503,
      'PROVIDER_NOT_CONFIGURED',
      'Provedor de pagamento ainda não configurado para este escritório.',
    );
    return;
  }
  const msg = error.message ?? '';
  const status = STATUS_MAP[msg];
  if (status && error.code === `PT${status}`) {
    const safeMessages: Record<number, string> = {
      401: 'Entre novamente para continuar.',
      403: 'Seu acesso não permite realizar esta cobrança.',
      404: 'Cobrança ou transação não encontrada no seu escopo.',
      409: 'A cobrança foi alterada ou já existe uma transação ativa com os mesmos dados.',
      422: 'Meio de pagamento ou valor inválido para esta cobrança.',
      503: 'Provedor de pagamento indisponível ou não configurado no momento.',
    };
    errorResponse(res, status, msg, safeMessages[status] ?? 'Não foi possível concluir a operação.');
    return;
  }
  errorResponse(res, 503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível comunicar com o serviço de pagamentos.');
}

function projectIntent(raw: unknown): CheckoutIntent {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid intent');
  }
  const d = raw as Record<string, unknown>;
  const method = checkoutMethods.includes(d.method as CheckoutMethod)
    ? (d.method as CheckoutMethod)
    : 'pix_qr';
  const state = clientPaymentStates.includes(d.state as ClientPaymentState)
    ? (d.state as ClientPaymentState)
    : 'communication_error';
  const terminalState =
    typeof d.terminal_state === 'string' &&
    terminalOperationStates.includes(d.terminal_state as TerminalOperationState)
      ? (d.terminal_state as TerminalOperationState)
      : null;
  const validStages: SettlementStage[] = ['none', 'authorized', 'captured', 'settled', 'refunded', 'disputed'];
  const stage: SettlementStage = validStages.includes(d.settlement_stage as SettlementStage)
    ? (d.settlement_stage as SettlementStage)
    : 'none';

  return {
    id: String(d.id ?? ''),
    charge_id: String(d.charge_id ?? ''),
    office_id: String(d.office_id ?? ''),
    method,
    state,
    amount_cents: Number.isSafeInteger(d.amount_cents) ? Number(d.amount_cents) : 0,
    installments_count: Number.isSafeInteger(d.installments_count) ? Math.max(1, Number(d.installments_count)) : 1,
    installment_amount_cents: Number.isSafeInteger(d.installment_amount_cents)
      ? Number(d.installment_amount_cents)
      : null,
    provider_label: typeof d.provider_label === 'string' ? d.provider_label : null,
    pix_qr_payload: typeof d.pix_qr_payload === 'string' ? d.pix_qr_payload : null,
    pix_copy_paste: typeof d.pix_copy_paste === 'string' ? d.pix_copy_paste : null,
    expires_at: typeof d.expires_at === 'string' ? d.expires_at : null,
    checkout_url:
      typeof d.checkout_url === 'string' && /^https:\/\//i.test(d.checkout_url) ? d.checkout_url : null,
    terminal_id: typeof d.terminal_id === 'string' ? d.terminal_id : null,
    terminal_state: terminalState,
    settlement_stage: stage,
    authorization_code: typeof d.authorization_code === 'string' ? d.authorization_code : null,
    provider_reference: typeof d.provider_reference === 'string' ? d.provider_reference : null,
    safe_message: typeof d.safe_message === 'string' ? d.safe_message : null,
    updated_at: typeof d.updated_at === 'string' ? d.updated_at : new Date().toISOString(),
  };
}

function projectClientSummary(raw: unknown): ClientCheckoutSummary {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid summary');
  }
  const d = raw as Record<string, unknown>;
  const c = (d.charge && typeof d.charge === 'object' ? d.charge : {}) as Record<string, unknown>;
  const paymentState = clientPaymentStates.includes(d.payment_state as ClientPaymentState)
    ? (d.payment_state as ClientPaymentState)
    : 'provider_unconfigured';

  return {
    office_id: String(d.office_id ?? ''),
    charge: {
      charge_id: String(c.charge_id ?? ''),
      request_id: String(c.request_id ?? ''),
      protocol: String(c.protocol ?? ''),
      service_summary: String(c.service_summary ?? ''),
      channel: (c.channel === 'presencial' || c.channel === 'whatsapp' ? c.channel : 'portal'),
      original_cents: Number.isSafeInteger(c.original_cents) ? Number(c.original_cents) : 0,
      approved_discount_cents: Number.isSafeInteger(c.approved_discount_cents) ? Number(c.approved_discount_cents) : 0,
      authorized_surcharge_cents: Number.isSafeInteger(c.authorized_surcharge_cents) ? Number(c.authorized_surcharge_cents) : 0,
      card_fee_cents: Number.isSafeInteger(c.card_fee_cents) ? Number(c.card_fee_cents) : 0,
      final_cents: Number.isSafeInteger(c.final_cents) ? Number(c.final_cents) : 0,
      paid_cents: Number.isSafeInteger(c.paid_cents) ? Number(c.paid_cents) : 0,
      balance_cents: Number.isSafeInteger(c.balance_cents) ? Number(c.balance_cents) : 0,
      charge_status: String(c.charge_status ?? 'open'),
      charge_version: Number.isSafeInteger(c.charge_version) ? Number(c.charge_version) : 1,
      installments: Array.isArray(c.installments)
        ? c.installments.map((item) => {
            const row = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
            return {
              number: Number.isSafeInteger(row.number) ? Number(row.number) : 1,
              amount_cents: Number.isSafeInteger(row.amount_cents) ? Number(row.amount_cents) : 0,
              due_date: typeof row.due_date === 'string' ? row.due_date : null,
              status: String(row.status ?? 'pending'),
            };
          })
        : [],
      receipt:
        c.receipt && typeof c.receipt === 'object'
          ? {
              id: String((c.receipt as Record<string, unknown>).id ?? ''),
              number: String((c.receipt as Record<string, unknown>).number ?? ''),
              issued_at: String((c.receipt as Record<string, unknown>).issued_at ?? ''),
              amount_cents: Number((c.receipt as Record<string, unknown>).amount_cents ?? 0),
            }
          : null,
    },
    payment_state: paymentState,
    provider_configured: Boolean(d.provider_configured),
    provider_message: typeof d.provider_message === 'string' ? d.provider_message : null,
    available_methods: Array.isArray(d.available_methods)
      ? d.available_methods.filter((m): m is CheckoutMethod => checkoutMethods.includes(m as CheckoutMethod))
      : [],
    max_installments: Number.isSafeInteger(d.max_installments) ? Math.max(1, Number(d.max_installments)) : 1,
    min_installment_cents: Number.isSafeInteger(d.min_installment_cents) ? Number(d.min_installment_cents) : 2000,
    active_intent: d.active_intent ? projectIntent(d.active_intent) : null,
    recent_intents: Array.isArray(d.recent_intents) ? d.recent_intents.map(projectIntent) : [],
  };
}

function createServiceRoleClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const publishable = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !serviceKey || serviceKey.length < 20) return null;
  // Validate URL format via canonical public connection check when publishable key is present,
  // or require strict https/loopback http URL directly for server-only worker runs.
  const urlAllowed = publishable
    ? validPublicConnection(url, publishable)
    : /^https:\/\/|^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/i.test(url);
  if (!urlAllowed) return null;
  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: AbortSignal.any([AbortSignal.timeout(8000), ...(init?.signal ? [init.signal] : [])]),
        }),
    },
  });
}

type RawBodyRequest = Request & { rawBody?: Buffer };

/**
 * Webhook intake contract (server-side only, NO browser session).
 * Enforces strict HMAC-SHA256 verification over exact rawBody bytes, optional timestamp
 * anti-replay check, envelope validation, and idempotent service_role persistence.
 */
paymentCheckoutRouter.post(
  '/webhooks/:provider',
  (req, res, next) => {
    if (!req.is('application/json')) {
      errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
      return;
    }
    next();
  },
  json({
    limit: '64kb',
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buf);
    },
  }),
  async (req, res) => {
    const provider = String(req.params.provider ?? '').trim();
    if (!/^[a-z0-9_-]{2,48}$/i.test(provider)) {
      errorResponse(res, 404, 'WEBHOOK_PROVIDER_INVALID', 'Provedor de webhook inválido.');
      return;
    }
    const signature = req.get('x-jn-webhook-signature') ?? req.get('x-webhook-signature');
    if (!signature || signature.trim().length < 16) {
      errorResponse(res, 401, 'WEBHOOK_SIGNATURE_REQUIRED', 'Assinatura criptográfica obrigatória.');
      return;
    }
    if (!isValidWebhookEnvelope(req.body)) {
      errorResponse(res, 422, 'WEBHOOK_ENVELOPE_INVALID', 'Envelope de evento de pagamento inválido.');
      return;
    }

    const secret = resolveProviderWebhookSecret(provider);
    if (!secret) {
      errorResponse(
        res,
        503,
        'WEBHOOK_PERSISTENCE_PENDING',
        'Recepção de webhooks aguardando validação de credenciais e persistência do provedor.',
      );
      return;
    }

    const rawBody = (req as RawBodyRequest).rawBody ?? Buffer.from(JSON.stringify(req.body), 'utf8');
    const timestampHeader = req.get('x-jn-webhook-timestamp') ?? req.get('x-webhook-timestamp') ?? null;
    const verification = verifyWebhookHmac({
      rawBody,
      signatureHeader: signature,
      timestampHeader,
      secret,
    });
    if (!verification.ok) {
      errorResponse(
        res,
        401,
        verification.code,
        verification.code === 'WEBHOOK_TIMESTAMP_EXPIRED'
          ? 'Carimbo de data/hora do webhook fora da janela de segurança.'
          : 'Assinatura criptográfica do webhook inválida.',
      );
      return;
    }

    const serviceClient = createServiceRoleClient();
    if (!serviceClient) {
      errorResponse(
        res,
        503,
        'WEBHOOK_PERSISTENCE_PENDING',
        'Serviço de persistência de webhooks indisponível no momento.',
      );
      return;
    }

    const envelope = req.body as Record<string, unknown>;
    const amountCents =
      typeof envelope.amount_cents === 'number' && Number.isSafeInteger(envelope.amount_cents) && envelope.amount_cents > 0
        ? envelope.amount_cents
        : null;
    const authCode =
      typeof envelope.authorization_code === 'string' && envelope.authorization_code.trim().length > 0
        ? envelope.authorization_code.trim().slice(0, 64)
        : null;

    try {
      const { data, error } = await serviceClient.rpc('payment_webhook_ingest', {
        p_provider_code: provider,
        p_event_id: String(envelope.event_id),
        p_provider_reference: String(envelope.resource_ref),
        p_event_type: String(envelope.event_type),
        p_payload_sha256: verification.payloadSha256,
        p_amount_cents: amountCents,
        p_authorization_code: authCode,
      });
      if (error) {
        errorResponse(res, 503, 'WEBHOOK_INGEST_UNAVAILABLE', 'Não foi possível registrar o evento de pagamento.');
        return;
      }
      const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
      res.json({
        data: {
          status: typeof d.status === 'string' ? d.status : 'processed',
          event_id: typeof d.event_id === 'string' ? d.event_id : String(envelope.event_id),
          intent_id: typeof d.intent_id === 'string' ? d.intent_id : null,
          state: typeof d.state === 'string' ? d.state : null,
          settlement_stage: typeof d.settlement_stage === 'string' ? d.settlement_stage : null,
        },
      });
    } catch {
      errorResponse(res, 503, 'WEBHOOK_INGEST_UNAVAILABLE', 'Não foi possível registrar o evento de pagamento.');
    }
  },
);

/**
 * Scheduled maintenance endpoint (Vercel Cron GET or authenticated worker POST).
 * Protected via constant-time Bearer secret; expires stale payment intents and financial approvals.
 */
async function handleCronReconcile(req: Request, res: Response) {
  const expectedSecret = process.env.PAYMENT_RECONCILIATION_CRON_SECRET ?? process.env.CRON_SECRET;
  const authCheck = verifyCronBearer(req.get('Authorization'), expectedSecret);
  if (!authCheck.ok) {
    errorResponse(
      res,
      authCheck.status,
      authCheck.code,
      authCheck.status === 503
        ? 'Rotina de conciliação não configurada neste ambiente.'
        : 'Autorização de conciliação inválida.',
    );
    return;
  }

  const serviceClient = createServiceRoleClient();
  if (!serviceClient) {
    errorResponse(res, 503, 'RECONCILIATION_UNAVAILABLE', 'Conexão de manutenção indisponível.');
    return;
  }

  try {
    const { data, error } = await serviceClient.rpc('payment_maintenance_sweep');
    if (error) {
      errorResponse(res, 503, 'RECONCILIATION_UNAVAILABLE', 'Não foi possível concluir a rotina de manutenção.');
      return;
    }
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    res.json({
      data: {
        expired_intents: Number.isSafeInteger(d.expired_intents) ? Number(d.expired_intents) : 0,
        expired_approvals: Number.isSafeInteger(d.expired_approvals) ? Number(d.expired_approvals) : 0,
        ran_at: typeof d.ran_at === 'string' ? d.ran_at : new Date().toISOString(),
      },
    });
  } catch {
    errorResponse(res, 503, 'RECONCILIATION_UNAVAILABLE', 'Não foi possível concluir a rotina de manutenção.');
  }
}

paymentCheckoutRouter.get('/cron/reconcile', handleCronReconcile);
paymentCheckoutRouter.post('/cron/reconcile', handleCronReconcile);

// Authenticated routes below
paymentCheckoutRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) {
    res.locals.checkoutAuth = auth;
    next();
  }
});

paymentCheckoutRouter.use(
  (req, res, next) => {
    if (!req.is('application/json')) {
      errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
      return;
    }
    next();
  },
  json({ limit: '16kb' }),
);

/**
 * POST /api/payment-checkout/client/summary
 * Returns client charge checkout readiness, breakdown, and active intent.
 */
paymentCheckoutRouter.post('/client/summary', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'charge_id']) ||
    !uuid(b.office_id) ||
    !uuid(b.charge_id)
  ) {
    errorResponse(res, 422, 'CHECKOUT_VALIDATION', 'Informe o escritório e a cobrança.');
    return;
  }

  try {
    const { client } = res.locals.checkoutAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('client_payment_checkout_summary', {
      p_office_id: b.office_id,
      p_charge_id: b.charge_id,
    });
    if (error) {
      if (error.code && RPC_MISSING_CODES.has(error.code)) {
        res.json({
          data: {
            office_id: b.office_id,
            charge: {
              charge_id: b.charge_id,
              request_id: '',
              protocol: '',
              service_summary: '',
              channel: 'portal',
              original_cents: 0,
              approved_discount_cents: 0,
              authorized_surcharge_cents: 0,
              card_fee_cents: 0,
              final_cents: 0,
              paid_cents: 0,
              balance_cents: 0,
              charge_status: 'open',
              charge_version: 1,
              installments: [],
              receipt: null,
            },
            payment_state: 'provider_unconfigured',
            provider_configured: false,
            provider_message: 'Provedor não configurado. A equipe pode registrar ou orientar o pagamento no atendimento.',
            available_methods: [],
            max_installments: 1,
            min_installment_cents: 2000,
            active_intent: null,
            recent_intents: [],
          } satisfies ClientCheckoutSummary,
        });
        return;
      }
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectClientSummary(data) });
  } catch {
    errorResponse(res, 503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível consultar os meios de pagamento.');
  }
});

/**
 * POST /api/payment-checkout/client/intent
 * Initiates an idempotent client payment intent (PIX / Credit / Debit / Installments).
 */
paymentCheckoutRouter.post('/client/intent', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'charge_id', 'expected_charge_version', 'method', 'installments_count', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    !uuid(b.charge_id) ||
    !positive(b.expected_charge_version, 2147483645) ||
    !checkoutMethods.includes(b.method as CheckoutMethod) ||
    !positive(b.installments_count, 12) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'CHECKOUT_VALIDATION', 'Confira o meio de pagamento e as parcelas escolhidas.');
    return;
  }

  try {
    const { client } = res.locals.checkoutAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_checkout_create_intent', {
      p_office_id: b.office_id,
      p_charge_id: b.charge_id,
      p_expected_charge_version: b.expected_charge_version,
      p_method: b.method,
      p_installments_count: b.installments_count,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectIntent(data) });
  } catch {
    errorResponse(res, 503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível iniciar o pagamento eletrônico no momento.');
  }
});

/**
 * POST /api/payment-checkout/intent/status
 * Authoritative status check (client or staff within scope). Never trusts client-side screenshot/redirect.
 */
paymentCheckoutRouter.post('/intent/status', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'intent_id']) ||
    !uuid(b.office_id) ||
    !uuid(b.intent_id)
  ) {
    errorResponse(res, 422, 'CHECKOUT_VALIDATION', 'Informe o escritório e a transação.');
    return;
  }

  try {
    const { client } = res.locals.checkoutAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_checkout_intent_status', {
      p_office_id: b.office_id,
      p_intent_id: b.intent_id,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectIntent(data) });
  } catch {
    errorResponse(res, 503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível atualizar a situação do pagamento.');
  }
});

/**
 * POST /api/payment-checkout/staff/pix
 * Staff generates dynamic Pix charge linked to an existing official charge_id (presencial, whatsapp, portal).
 */
paymentCheckoutRouter.post('/staff/pix', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'charge_id', 'expected_charge_version', 'amount_cents', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    !uuid(b.charge_id) ||
    !positive(b.expected_charge_version, 2147483645) ||
    !positive(b.amount_cents, 1000000000) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'CHECKOUT_VALIDATION', 'Confira a cobrança e o valor para gerar o Pix.');
    return;
  }

  try {
    const { client } = res.locals.checkoutAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('staff_payment_generate_pix', {
      p_office_id: b.office_id,
      p_charge_id: b.charge_id,
      p_expected_charge_version: b.expected_charge_version,
      p_amount_cents: b.amount_cents,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectIntent(data) });
  } catch {
    errorResponse(res, 503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível gerar a cobrança Pix no momento.');
  }
});

/**
 * POST /api/payment-checkout/staff/card-terminal
 * Staff initiates integrated card terminal charge (credit cash, credit installment, debit).
 */
paymentCheckoutRouter.post('/staff/card-terminal', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'charge_id',
      'expected_charge_version',
      'terminal_id',
      'sale_mode',
      'installments_count',
      'amount_cents',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !uuid(b.charge_id) ||
    !positive(b.expected_charge_version, 2147483645) ||
    !uuid(b.terminal_id) ||
    !terminalSaleModes.includes(b.sale_mode as (typeof terminalSaleModes)[number]) ||
    !positive(b.installments_count, 12) ||
    !positive(b.amount_cents, 1000000000) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'CHECKOUT_VALIDATION', 'Confira a maquininha, a modalidade e o valor da cobrança.');
    return;
  }

  if (b.sale_mode !== 'credit_installment' && Number(b.installments_count) !== 1) {
    errorResponse(res, 422, 'CHECKOUT_VALIDATION', 'Parcelamento só é permitido na modalidade crédito parcelado.');
    return;
  }

  try {
    const { client } = res.locals.checkoutAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('staff_payment_start_terminal', {
      p_office_id: b.office_id,
      p_charge_id: b.charge_id,
      p_expected_charge_version: b.expected_charge_version,
      p_terminal_id: b.terminal_id,
      p_sale_mode: b.sale_mode,
      p_installments_count: b.installments_count,
      p_amount_cents: b.amount_cents,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectIntent(data) });
  } catch {
    errorResponse(res, 503, 'CHECKOUT_UNAVAILABLE', 'Não foi possível enviar a cobrança para a maquininha.');
  }
});
