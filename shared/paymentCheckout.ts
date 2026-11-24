import type { RequestOriginChannel } from './requestDeletion.js';

export const clientPaymentStates = [
  'available',
  'selecting_method',
  'awaiting_payment',
  'processing',
  'confirmed',
  'refused',
  'expired',
  'cancelled',
  'partially_received',
  'pending_reconciliation',
  'communication_error',
  'provider_unconfigured',
] as const;

export type ClientPaymentState = (typeof clientPaymentStates)[number];

export const clientPaymentStateLabels: Record<ClientPaymentState, string> = {
  available: 'Disponível para pagamento',
  selecting_method: 'Escolhendo meio de pagamento',
  awaiting_payment: 'Aguardando pagamento',
  processing: 'Processando pagamento',
  confirmed: 'Pagamento confirmado',
  refused: 'Pagamento recusado',
  expired: 'Pagamento expirado',
  cancelled: 'Pagamento cancelado',
  partially_received: 'Pagamento parcialmente recebido',
  pending_reconciliation: 'Divergência pendente de conciliação',
  communication_error: 'Erro de comunicação com o provedor',
  provider_unconfigured: 'Provedor não configurado',
};

export const checkoutMethods = [
  'pix_qr',
  'pix_copy_paste',
  'credit_card',
  'debit_card',
  'installments',
] as const;

export type CheckoutMethod = (typeof checkoutMethods)[number];

export const checkoutMethodLabels: Record<CheckoutMethod, string> = {
  pix_qr: 'Pix com QR Code dinâmico',
  pix_copy_paste: 'Pix Copia e Cola',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito online',
  installments: 'Cartão de crédito parcelado',
};

export const terminalSaleModes = [
  'credit_cash',
  'credit_installment',
  'debit',
] as const;

export type TerminalSaleMode = (typeof terminalSaleModes)[number];

export const terminalSaleModeLabels: Record<TerminalSaleMode, string> = {
  credit_cash: 'Crédito à vista',
  credit_installment: 'Crédito parcelado',
  debit: 'Débito',
};

export const terminalOperationStates = [
  'terminal_available',
  'terminal_disconnected',
  'awaiting_card',
  'processing',
  'authorization_received',
  'capture_confirmed',
  'refused',
  'communication_interrupted',
  'pending_reconciliation',
] as const;

export type TerminalOperationState = (typeof terminalOperationStates)[number];

export const terminalOperationStateLabels: Record<TerminalOperationState, string> = {
  terminal_available: 'Maquininha disponível',
  terminal_disconnected: 'Maquininha desconectada',
  awaiting_card: 'Aguardando cartão',
  processing: 'Processando',
  authorization_received: 'Autorização recebida (aguardando captura)',
  capture_confirmed: 'Captura confirmada',
  refused: 'Recusado',
  communication_interrupted: 'Comunicação interrompida',
  pending_reconciliation: 'Pendente de conciliação',
};

export type SettlementStage =
  | 'none'
  | 'authorized'
  | 'captured'
  | 'settled'
  | 'refunded'
  | 'disputed';

export const settlementStageLabels: Record<SettlementStage, string> = {
  none: 'Sem autorização',
  authorized: 'Autorizado (não capturado)',
  captured: 'Capturado (liquidação prevista)',
  settled: 'Liquidado em conta',
  refunded: 'Estornado',
  disputed: 'Em contestação',
};

export type ProviderEnvironment = 'sandbox' | 'homologation' | 'production';

export type ProviderCapabilityKey =
  | 'pix_dynamic_qr'
  | 'pix_copy_paste'
  | 'pix_query_status'
  | 'pix_reconciliation'
  | 'pix_refund'
  | 'card_credit_cash'
  | 'card_credit_installments'
  | 'card_debit_online'
  | 'card_refund'
  | 'card_dispute_tracking'
  | 'terminal_integrated'
  | 'terminal_local_agent'
  | 'webhook_signed';

export type ProviderCapabilities = Record<ProviderCapabilityKey, boolean>;

export const capabilityLabels: Record<ProviderCapabilityKey, string> = {
  pix_dynamic_qr: 'Cobrança Pix dinâmica com QR Code',
  pix_copy_paste: 'Pix Copia e Cola',
  pix_query_status: 'Consulta de transação Pix',
  pix_reconciliation: 'Conciliação automática Pix',
  pix_refund: 'Devolução Pix (MED/estorno)',
  card_credit_cash: 'Cartão de crédito à vista online',
  card_credit_installments: 'Cartão de crédito parcelado online',
  card_debit_online: 'Cartão de débito online',
  card_refund: 'Estorno de cartão',
  card_dispute_tracking: 'Acompanhamento de contestações',
  terminal_integrated: 'Maquininha integrada via API/nuvem',
  terminal_local_agent: 'Maquininha via conector/agente local autorizado',
  webhook_signed: 'Notificação assinada (webhook)',
};

export type ProviderCatalogEntry = {
  provider_code: string;
  display_name: string;
  category: 'bank_psp' | 'acquirer' | 'gateway';
  auth_model: 'oauth2_mtls' | 'api_key_secret' | 'certificate_mtls';
  supported_capabilities: ProviderCapabilities;
  notes: string;
};

export const providerCatalog: ProviderCatalogEntry[] = [
  {
    provider_code: 'generic_psp_pix_card',
    display_name: 'Provedor Bancário / PSP (Pix + Cartão)',
    category: 'bank_psp',
    auth_model: 'certificate_mtls',
    supported_capabilities: {
      pix_dynamic_qr: true,
      pix_copy_paste: true,
      pix_query_status: true,
      pix_reconciliation: true,
      pix_refund: true,
      card_credit_cash: true,
      card_credit_installments: true,
      card_debit_online: false,
      card_refund: true,
      card_dispute_tracking: true,
      terminal_integrated: false,
      terminal_local_agent: false,
      webhook_signed: true,
    },
    notes: 'Contrato agnóstico para instituições financeiras com API Pix e cartão online.',
  },
  {
    provider_code: 'generic_pix_bank',
    display_name: 'Instituição Bancária (Somente Pix)',
    category: 'bank_psp',
    auth_model: 'oauth2_mtls',
    supported_capabilities: {
      pix_dynamic_qr: true,
      pix_copy_paste: true,
      pix_query_status: true,
      pix_reconciliation: true,
      pix_refund: true,
      card_credit_cash: false,
      card_credit_installments: false,
      card_debit_online: false,
      card_refund: false,
      card_dispute_tracking: false,
      terminal_integrated: false,
      terminal_local_agent: false,
      webhook_signed: true,
    },
    notes: 'Banco oficial para cobrança Pix dinâmica e conciliação sem cartão online.',
  },
  {
    provider_code: 'generic_acquirer_terminal',
    display_name: 'Adquirente / Maquininha Integrada',
    category: 'acquirer',
    auth_model: 'api_key_secret',
    supported_capabilities: {
      pix_dynamic_qr: true,
      pix_copy_paste: true,
      pix_query_status: true,
      pix_reconciliation: true,
      pix_refund: false,
      card_credit_cash: true,
      card_credit_installments: true,
      card_debit_online: true,
      card_refund: true,
      card_dispute_tracking: true,
      terminal_integrated: true,
      terminal_local_agent: true,
      webhook_signed: true,
    },
    notes: 'Contrato agnóstico para adquirentes com cobrança presencial em maquininha e online.',
  },
];

export type ConfiguredProvider = {
  id: string;
  office_id: string;
  provider_code: string;
  display_name: string;
  institution_label: string;
  environment: ProviderEnvironment;
  status: 'unconfigured' | 'configured' | 'validated' | 'active' | 'disabled' | 'error';
  enabled_methods: CheckoutMethod[];
  receiving_account_id: string | null;
  receiving_account_name: string | null;
  financial_unit_id: string | null;
  financial_unit_name: string | null;
  credential_ref: string | null;
  last_validated_at: string | null;
  last_sync_at: string | null;
  last_error_safe: string | null;
  capabilities: ProviderCapabilities;
  homologated: boolean;
};

export type PixProviderSettings = {
  enabled: boolean;
  provider_id: string | null;
  dynamic_qr_enabled: boolean;
  copy_paste_enabled: boolean;
  expiration_minutes: number;
  reconciliation_enabled: boolean;
  refund_enabled: boolean;
  pix_key_masked: string | null;
};

export type OnlineCardSettings = {
  enabled: boolean;
  provider_id: string | null;
  credit_enabled: boolean;
  debit_enabled: boolean;
  installments_enabled: boolean;
  max_installments: number;
  min_installment_cents: number;
  fee_policy_note: string | null;
  settlement_days_credit: number | null;
  settlement_days_debit: number | null;
};

export type PaymentTerminal = {
  id: string;
  office_id: string;
  provider_id: string | null;
  label: string;
  manufacturer: string;
  model: string;
  provider_name: string;
  serial_masked: string | null;
  connection_mode: 'cloud_api' | 'local_agent_connector';
  supported_protocols: string[];
  unit_id: string | null;
  unit_name: string | null;
  status: 'active' | 'disconnected' | 'inactive' | 'error';
  last_heartbeat_at: string | null;
  last_error_safe: string | null;
};

export type ProviderDiagnosticItem = {
  id: string;
  scope: 'provider' | 'pix' | 'card' | 'terminal' | 'reconciliation';
  label: string;
  status: 'ok' | 'warning' | 'unavailable' | 'pending_reconciliation';
  message: string;
  checked_at: string | null;
};

export type PaymentProvidersState = {
  office_id: string;
  backend_ready: boolean;
  providers: ConfiguredProvider[];
  pix: PixProviderSettings;
  online_cards: OnlineCardSettings;
  terminals: PaymentTerminal[];
  diagnostics: ProviderDiagnosticItem[];
  pending_reconciliations_count: number;
  catalog: ProviderCatalogEntry[];
};

export type ChargeFinancialBreakdown = {
  charge_id: string;
  request_id: string;
  protocol: string;
  service_summary: string;
  channel: RequestOriginChannel;
  original_cents: number;
  approved_discount_cents: number;
  authorized_surcharge_cents: number;
  card_fee_cents: number;
  final_cents: number;
  paid_cents: number;
  balance_cents: number;
  charge_status: string;
  charge_version: number;
  installments: Array<{
    number: number;
    amount_cents: number;
    due_date: string | null;
    status: string;
  }>;
  receipt: {
    id: string;
    number: string;
    issued_at: string;
    amount_cents: number;
  } | null;
};

export type CheckoutIntent = {
  id: string;
  charge_id: string;
  office_id: string;
  method: CheckoutMethod;
  state: ClientPaymentState;
  amount_cents: number;
  installments_count: number;
  installment_amount_cents: number | null;
  provider_label: string | null;
  pix_qr_payload: string | null;
  pix_copy_paste: string | null;
  expires_at: string | null;
  checkout_url: string | null;
  terminal_id: string | null;
  terminal_state: TerminalOperationState | null;
  settlement_stage: SettlementStage;
  authorization_code: string | null;
  provider_reference: string | null;
  safe_message: string | null;
  updated_at: string;
};

export type ClientCheckoutSummary = {
  office_id: string;
  charge: ChargeFinancialBreakdown;
  payment_state: ClientPaymentState;
  provider_configured: boolean;
  provider_message: string | null;
  available_methods: CheckoutMethod[];
  max_installments: number;
  min_installment_cents: number;
  active_intent: CheckoutIntent | null;
  recent_intents: CheckoutIntent[];
};

export type WebhookEventEnvelope = {
  contract_version: 1;
  source: string;
  provider_account_ref: string;
  environment: ProviderEnvironment;
  office_id: string;
  event_id: string;
  event_type: string;
  resource_ref: string;
  occurred_at: string;
  payload_digest: string;
};

/**
 * Computes installment options keeping commercial discounts strictly separate from
 * acquirer/card fees (Etapa 2, 3, 5).
 */
export function computeInstallmentOptions(
  amountCents: number,
  maxInstallments: number,
  minInstallmentCents = 2000,
): Array<{ count: number; per_installment_cents: number; total_cents: number }> {
  if (!Number.isInteger(amountCents) || amountCents <= 0) return [];
  const cap = Math.max(1, Math.min(12, Math.floor(maxInstallments || 1)));
  const minPer = Math.max(100, Math.floor(minInstallmentCents || 100));
  const options: Array<{ count: number; per_installment_cents: number; total_cents: number }> = [];
  for (let count = 1; count <= cap; count += 1) {
    const per = Math.ceil(amountCents / count);
    if (count === 1 || per >= minPer) {
      options.push({ count, per_installment_cents: per, total_cents: amountCents });
    }
  }
  return options;
}

/**
 * Generates manual WhatsApp share message & link for Pix billing without
 * depending on any official WhatsApp Business API integration (Etapa 3).
 */
export function buildManualWhatsAppPixShare(params: {
  officeName: string;
  protocol: string;
  serviceSummary: string;
  amountCents: number;
  pixCopyPaste: string;
  expiresAt?: string | null;
  phoneDigits?: string | null;
}): { text: string; waUrl: string } {
  const formattedAmount = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(params.amountCents / 100);
  const expiryLine = params.expiresAt
    ? `\nValidade do Pix: ${new Date(params.expiresAt).toLocaleString('pt-BR')}`
    : '';
  const text = [
    `${params.officeName} — Cobrança Pix`,
    `Protocolo: ${params.protocol}`,
    `Serviço: ${params.serviceSummary}`,
    `Valor: ${formattedAmount}${expiryLine}`,
    '',
    'Código Pix Copia e Cola:',
    params.pixCopyPaste.trim(),
  ].join('\n');

  const digits = (params.phoneDigits ?? '').replace(/\D/g, '');
  const prefix = digits.length >= 10 && digits.length <= 15 ? `https://wa.me/${digits}` : 'https://wa.me/';
  return {
    text,
    waUrl: `${prefix}?text=${encodeURIComponent(text)}`,
  };
}

export function isCapabilitySupported(
  capabilities: Partial<ProviderCapabilities> | null | undefined,
  key: ProviderCapabilityKey,
): boolean {
  return Boolean(capabilities && capabilities[key] === true);
}

export const UNSUPPORTED_CAPABILITY_LABEL = 'Não disponível para este provedor';

export function isValidWebhookEnvelope(value: unknown): value is WebhookEventEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const str = (x: unknown, max = 160) => typeof x === 'string' && x.trim().length > 0 && x.trim().length <= max;
  const envOk = v.environment === 'sandbox' || v.environment === 'homologation' || v.environment === 'production';
  return (
    v.contract_version === 1 &&
    str(v.source, 80) &&
    str(v.provider_account_ref, 120) &&
    envOk &&
    str(v.office_id, 64) &&
    str(v.event_id, 160) &&
    str(v.event_type, 80) &&
    str(v.resource_ref, 160) &&
    str(v.occurred_at, 64) &&
    typeof v.payload_digest === 'string' &&
    /^[a-f0-9]{64}$/i.test(v.payload_digest)
  );
}


export type ProviderReceivingOptions = {
  units: { id: string; name: string }[];
  accounts: { id: string; unit_id: string; name: string; type: 'bank' | 'digital' }[];
  units_total: number;
  accounts_total: number;
  page_size: number;
};
