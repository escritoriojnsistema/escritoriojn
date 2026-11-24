import { Router, json, type Response } from 'express';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import { positive, requestText } from '../requests/validation.js';
import { isValidIdempotencyKey } from '../../../shared/requestDeletion.js';
import {
  checkoutMethods,
  providerCatalog,
  type CheckoutMethod,
  type ConfiguredProvider,
  type PaymentProvidersState,
  type PaymentTerminal,
  type ProviderEnvironment,
} from '../../../shared/paymentCheckout.js';

export const paymentProvidersRouter = Router();

paymentProvidersRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.vary('Authorization');
  next();
});

paymentProvidersRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) {
    res.locals.providersAuth = auth;
    next();
  }
});

paymentProvidersRouter.use(
  (req, res, next) => {
    if (!req.is('application/json')) {
      errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
      return;
    }
    next();
  },
  json({ limit: '24kb' }),
);

const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

const STATUS_MAP: Record<string, number> = {
  AUTH_REQUIRED: 401,
  SETTINGS_FORBIDDEN: 403,
  PROVIDERS_FORBIDDEN: 403,
  PROVIDER_NOT_FOUND: 404,
  TERMINAL_NOT_FOUND: 404,
  PROVIDER_CONFLICT: 409,
  PROVIDER_VALIDATION: 422,
};

function mapSafeError(res: Response, error: { code?: string; message?: string }) {
  if (error.code && RPC_MISSING_CODES.has(error.code)) {
    errorResponse(
      res,
      503,
      'PROVIDERS_BACKEND_NOT_PROVISIONED',
      'A persistência de bancos, Pix, cartões e maquininhas está aguardando ativação no servidor.',
    );
    return;
  }
  const msg = error.message ?? '';
  const status = STATUS_MAP[msg];
  if (status && error.code === `PT${status}`) {
    const safeMessages: Record<number, string> = {
      401: 'Entre novamente para continuar.',
      403: 'Somente super administradores e administradores autorizados podem alterar bancos e pagamentos.',
      404: 'Integração ou maquininha não encontrada no escritório selecionado.',
      409: 'A configuração foi atualizada em outra sessão. Recarregue antes de salvar.',
      422: 'Confira os dados da integração antes de salvar.',
    };
    errorResponse(res, status, msg, safeMessages[status] ?? 'Não foi possível concluir a configuração.');
    return;
  }
  errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível consultar ou salvar a configuração de pagamentos.');
}

function emptyProvidersState(officeId: string, backendReady: boolean): PaymentProvidersState {
  return {
    office_id: officeId,
    backend_ready: backendReady,
    providers: [],
    pix: {
      enabled: false,
      provider_id: null,
      dynamic_qr_enabled: false,
      copy_paste_enabled: false,
      expiration_minutes: 30,
      reconciliation_enabled: false,
      refund_enabled: false,
      pix_key_masked: null,
    },
    online_cards: {
      enabled: false,
      provider_id: null,
      credit_enabled: false,
      debit_enabled: false,
      installments_enabled: false,
      max_installments: 1,
      min_installment_cents: 2000,
      fee_policy_note: null,
      settlement_days_credit: null,
      settlement_days_debit: null,
    },
    terminals: [],
    diagnostics: [
      {
        id: 'backend-readiness',
        scope: 'provider',
        label: 'Persistência e credenciais de provedores',
        status: 'unavailable',
        message: backendReady
          ? 'Nenhum provedor bancário configurado ainda para este escritório.'
          : 'Aguardando provisionamento das tabelas de provedores e segredos server-side.',
        checked_at: null,
      },
    ],
    pending_reconciliations_count: 0,
    catalog: providerCatalog,
  };
}

function projectState(officeId: string, raw: unknown): PaymentProvidersState {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return emptyProvidersState(officeId, true);
  }
  const d = raw as Record<string, unknown>;
  const base = emptyProvidersState(officeId, true);
  const providers: ConfiguredProvider[] = Array.isArray(d.providers)
    ? d.providers.map((item) => {
        const p = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        const cat = providerCatalog.find((c) => c.provider_code === p.provider_code) ?? providerCatalog[0];
        return {
          id: String(p.id ?? ''),
          office_id: officeId,
          provider_code: String(p.provider_code ?? cat.provider_code),
          display_name: String(p.display_name ?? cat.display_name),
          institution_label: String(p.institution_label ?? ''),
          environment: (p.environment === 'production' || p.environment === 'homologation' ? p.environment : 'sandbox'),
          status: (['unconfigured', 'configured', 'validated', 'active', 'disabled', 'error'].includes(String(p.status))
            ? (p.status as ConfiguredProvider['status'])
            : 'configured'),
          enabled_methods: Array.isArray(p.enabled_methods)
            ? p.enabled_methods.filter((m): m is CheckoutMethod => checkoutMethods.includes(m as CheckoutMethod))
            : [],
          receiving_account_id: typeof p.receiving_account_id === 'string' ? p.receiving_account_id : null,
          receiving_account_name: typeof p.receiving_account_name === 'string' ? p.receiving_account_name : null,
          financial_unit_id: typeof p.financial_unit_id === 'string' ? p.financial_unit_id : null,
          financial_unit_name: typeof p.financial_unit_name === 'string' ? p.financial_unit_name : null,
          // Never return raw secrets or passwords; only masked/opaque reference
          credential_ref: typeof p.credential_ref === 'string' ? p.credential_ref : null,
          last_validated_at: typeof p.last_validated_at === 'string' ? p.last_validated_at : null,
          last_sync_at: typeof p.last_sync_at === 'string' ? p.last_sync_at : null,
          last_error_safe: typeof p.last_error_safe === 'string' ? p.last_error_safe : null,
          capabilities: cat.supported_capabilities,
          homologated: Boolean(p.homologated),
        };
      })
    : [];

  const terminals: PaymentTerminal[] = Array.isArray(d.terminals)
    ? d.terminals.map((item) => {
        const t = (item && typeof item === 'object' ? item : {}) as Record<string, unknown>;
        return {
          id: String(t.id ?? ''),
          office_id: officeId,
          provider_id: typeof t.provider_id === 'string' ? t.provider_id : null,
          label: String(t.label ?? ''),
          manufacturer: String(t.manufacturer ?? ''),
          model: String(t.model ?? ''),
          provider_name: String(t.provider_name ?? ''),
          serial_masked: typeof t.serial_masked === 'string' ? t.serial_masked : null,
          connection_mode: t.connection_mode === 'local_agent_connector' ? 'local_agent_connector' : 'cloud_api',
          supported_protocols: Array.isArray(t.supported_protocols)
            ? t.supported_protocols.filter((x): x is string => typeof x === 'string')
            : [],
          unit_id: typeof t.unit_id === 'string' ? t.unit_id : null,
          unit_name: typeof t.unit_name === 'string' ? t.unit_name : null,
          status: (['active', 'disconnected', 'inactive', 'error'].includes(String(t.status))
            ? (t.status as PaymentTerminal['status'])
            : 'disconnected'),
          last_heartbeat_at: typeof t.last_heartbeat_at === 'string' ? t.last_heartbeat_at : null,
          last_error_safe: typeof t.last_error_safe === 'string' ? t.last_error_safe : null,
        };
      })
    : [];

  return {
    ...base,
    providers,
    pix: d.pix && typeof d.pix === 'object' ? { ...base.pix, ...(d.pix as Record<string, unknown>) } : base.pix,
    online_cards:
      d.online_cards && typeof d.online_cards === 'object'
        ? { ...base.online_cards, ...(d.online_cards as Record<string, unknown>) }
        : base.online_cards,
    terminals,
    diagnostics: Array.isArray(d.diagnostics) ? (d.diagnostics as PaymentProvidersState['diagnostics']) : base.diagnostics,
    pending_reconciliations_count: Number.isSafeInteger(d.pending_reconciliations_count)
      ? Number(d.pending_reconciliations_count)
      : 0,
  };
}

/**
 * POST /api/payment-providers/state
 */
paymentProvidersRouter.post('/state', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !fields(b, ['office_id']) || !uuid(b.office_id)) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Informe o escritório.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_providers_state', { p_office_id: b.office_id });
    if (error) {
      if (error.code && RPC_MISSING_CODES.has(error.code)) {
        res.json({ data: emptyProvidersState(b.office_id, false) });
        return;
      }
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível carregar as configurações de pagamento.');
  }
});

/**
 * POST /api/payment-providers/provider/save
 */
paymentProvidersRouter.post('/receiving-options', async (req, res) => {
  const body: unknown = req.body;
  if (Object.keys(req.query).length || !fields(body, ['office_id', 'page']) ||
      !uuid(body.office_id) || !positive(body.page, 100000)) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Confira o escritório e a página.');
    return;
  }
  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_provider_receiving_options', {
      p_office_id: body.office_id, p_unit_id: null, p_page: body.page,
    });
    if (error) { mapSafeError(res, error); return; }
    if (fields(data, ['units', 'accounts', 'units_total', 'accounts_total', 'unit_id', 'page', 'page_size']) &&
        data.page === body.page && data.page_size === 50 && data.unit_id === null &&
        Array.isArray(data.units) && data.units.length <= 50 &&
        Array.isArray(data.accounts) && data.accounts.length <= 50 &&
        Number.isSafeInteger(data.units_total) && Number(data.units_total) >= data.units.length &&
        Number.isSafeInteger(data.accounts_total) && Number(data.accounts_total) >= data.accounts.length &&
        data.units.every(unit => fields(unit, ['id', 'name']) && uuid(unit.id) && requestText(unit.name, 120)) &&
        data.accounts.every(account => fields(account, ['id', 'unit_id', 'name', 'type']) &&
          uuid(account.id) && uuid(account.unit_id) && requestText(account.name, 120) &&
          (account.type === 'bank' || account.type === 'digital'))) {
      const { units, accounts, units_total, accounts_total, page_size } = data;
      res.json({ data: { units, accounts, units_total, accounts_total, page_size } });
      return;
    }
  } catch {
    // The browser receives the same safe error for failed and malformed RPC results.
  }
  errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível consultar as contas recebedoras.');
});

paymentProvidersRouter.post('/provider/save', async (req, res) => {
  const b: unknown = req.body;
  const envs: ProviderEnvironment[] = ['sandbox', 'homologation', 'production'];
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'provider_id',
      'provider_code',
      'institution_label',
      'environment',
      'enabled_methods',
      'receiving_account_id',
      'financial_unit_id',
      'credential_ref',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !(b.provider_id === null || uuid(b.provider_id)) ||
    !providerCatalog.some((c) => c.provider_code === b.provider_code) ||
    !requestText(b.institution_label, 120) ||
    !envs.includes(b.environment as ProviderEnvironment) ||
    !Array.isArray(b.enabled_methods) ||
    !b.enabled_methods.every((m) => checkoutMethods.includes(m as CheckoutMethod)) ||
    !(b.receiving_account_id === null || uuid(b.receiving_account_id)) ||
    !(b.financial_unit_id === null || uuid(b.financial_unit_id)) ||
    !(b.credential_ref === null || requestText(b.credential_ref, 120)) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Confira o provedor, o ambiente e a conta de destino.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_provider_save', {
      p_office_id: b.office_id,
      p_provider_id: b.provider_id,
      p_provider_code: b.provider_code,
      p_institution_label: String(b.institution_label).trim(),
      p_environment: b.environment,
      p_enabled_methods: b.enabled_methods,
      p_receiving_account_id: b.receiving_account_id,
      p_financial_unit_id: b.financial_unit_id,
      p_credential_ref: b.credential_ref ? String(b.credential_ref).trim() : null,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível salvar o provedor.');
  }
});

/**
 * POST /api/payment-providers/provider/validate
 */
paymentProvidersRouter.post('/provider/validate', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'provider_id']) ||
    !uuid(b.office_id) ||
    !uuid(b.provider_id)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Selecione um provedor válido para validar a conexão.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_provider_validate', {
      p_office_id: b.office_id,
      p_provider_id: b.provider_id,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível validar a conexão com o provedor.');
  }
});

/**
 * POST /api/payment-providers/pix/save
 */
paymentProvidersRouter.post('/pix/save', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'provider_id',
      'enabled',
      'dynamic_qr_enabled',
      'copy_paste_enabled',
      'expiration_minutes',
      'reconciliation_enabled',
      'refund_enabled',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !(b.provider_id === null || uuid(b.provider_id)) ||
    typeof b.enabled !== 'boolean' ||
    typeof b.dynamic_qr_enabled !== 'boolean' ||
    typeof b.copy_paste_enabled !== 'boolean' ||
    !positive(b.expiration_minutes, 10080) ||
    typeof b.reconciliation_enabled !== 'boolean' ||
    typeof b.refund_enabled !== 'boolean' ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Confira as configurações de Pix antes de salvar.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_pix_settings_save', {
      p_office_id: b.office_id,
      p_provider_id: b.provider_id,
      p_enabled: b.enabled,
      p_dynamic_qr_enabled: b.dynamic_qr_enabled,
      p_copy_paste_enabled: b.copy_paste_enabled,
      p_expiration_minutes: b.expiration_minutes,
      p_reconciliation_enabled: b.reconciliation_enabled,
      p_refund_enabled: b.refund_enabled,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível salvar a configuração de Pix.');
  }
});

/**
 * POST /api/payment-providers/cards/save
 */
paymentProvidersRouter.post('/cards/save', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'provider_id',
      'enabled',
      'credit_enabled',
      'debit_enabled',
      'installments_enabled',
      'max_installments',
      'min_installment_cents',
      'fee_policy_note',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !(b.provider_id === null || uuid(b.provider_id)) ||
    typeof b.enabled !== 'boolean' ||
    typeof b.credit_enabled !== 'boolean' ||
    typeof b.debit_enabled !== 'boolean' ||
    typeof b.installments_enabled !== 'boolean' ||
    !positive(b.max_installments, 12) ||
    !positive(b.min_installment_cents, 10000000) ||
    !(b.fee_policy_note === null || b.fee_policy_note === '' || requestText(b.fee_policy_note, 240)) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Confira as configurações de cartões online.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_online_cards_save', {
      p_office_id: b.office_id,
      p_provider_id: b.provider_id,
      p_enabled: b.enabled,
      p_credit_enabled: b.credit_enabled,
      p_debit_enabled: b.debit_enabled,
      p_installments_enabled: b.installments_enabled,
      p_max_installments: b.max_installments,
      p_min_installment_cents: b.min_installment_cents,
      p_fee_policy_note: b.fee_policy_note ? String(b.fee_policy_note).trim() : null,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível salvar a configuração de cartões online.');
  }
});

/**
 * POST /api/payment-providers/terminal/save
 */
paymentProvidersRouter.post('/terminal/save', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'terminal_id',
      'provider_id',
      'label',
      'manufacturer',
      'model',
      'provider_name',
      'connection_mode',
      'unit_id',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !(b.terminal_id === null || uuid(b.terminal_id)) ||
    !(b.provider_id === null || uuid(b.provider_id)) ||
    !requestText(b.label, 80) ||
    !requestText(b.manufacturer, 80) ||
    !requestText(b.model, 80) ||
    !requestText(b.provider_name, 80) ||
    (b.connection_mode !== 'cloud_api' && b.connection_mode !== 'local_agent_connector') ||
    !(b.unit_id === null || uuid(b.unit_id)) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Confira os dados da maquininha antes de salvar.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_terminal_save', {
      p_office_id: b.office_id,
      p_terminal_id: b.terminal_id,
      p_provider_id: b.provider_id,
      p_label: String(b.label).trim(),
      p_manufacturer: String(b.manufacturer).trim(),
      p_model: String(b.model).trim(),
      p_provider_name: String(b.provider_name).trim(),
      p_connection_mode: b.connection_mode,
      p_unit_id: b.unit_id,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível salvar a maquininha.');
  }
});

/**
 * POST /api/payment-providers/terminal/test
 */
paymentProvidersRouter.post('/terminal/test', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'terminal_id']) ||
    !uuid(b.office_id) ||
    !uuid(b.terminal_id)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Selecione uma maquininha válida para testar.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_terminal_test', {
      p_office_id: b.office_id,
      p_terminal_id: b.terminal_id,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível testar a comunicação com a maquininha.');
  }
});

/**
 * POST /api/payment-providers/terminal/deactivate
 */
paymentProvidersRouter.post('/terminal/deactivate', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'terminal_id', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    !uuid(b.terminal_id) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'PROVIDER_VALIDATION', 'Selecione uma maquininha válida.');
    return;
  }

  try {
    const { client } = res.locals.providersAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('payment_terminal_deactivate', {
      p_office_id: b.office_id,
      p_terminal_id: b.terminal_id,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectState(b.office_id, data) });
  } catch {
    errorResponse(res, 503, 'PROVIDERS_UNAVAILABLE', 'Não foi possível desativar a maquininha.');
  }
});
