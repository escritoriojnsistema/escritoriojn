import { Router, json, type Response } from 'express';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import { positive } from '../requests/validation.js';
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

/**
 * Webhook intake contract (server-side only, NO browser session).
 * Validates provider signature header presence, JSON envelope schema, and rejects
 * unverified/unconfigured webhooks until IA 2 wires cryptographic verification & persistence.
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
  json({ limit: '64kb' }),
  (req, res) => {
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
    // Fail-closed until IA 2 configures provider secret verification + persistent idempotency table.
    errorResponse(
      res,
      503,
      'WEBHOOK_PERSISTENCE_PENDING',
      'Recepção de webhooks aguardando validação de credenciais e persistência do provedor.',
    );
  },
);

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
