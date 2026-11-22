export const financialApprovalKinds = ['manual_payment', 'discount'] as const;
export type FinancialApprovalKind = (typeof financialApprovalKinds)[number];

export const financialApprovalStatuses = [
  'pending',
  'approved',
  'rejected',
  'expired',
  'revoked',
  'executed',
] as const;
export type FinancialApprovalStatus = (typeof financialApprovalStatuses)[number];

export const financialApprovalStatusLabels: Record<FinancialApprovalStatus, string> = {
  pending: 'Pendente de aprovação',
  approved: 'Aprovada',
  rejected: 'Rejeitada',
  expired: 'Expirada',
  revoked: 'Revogada / invalidada',
  executed: 'Executada',
};

export type EligibleApprover = {
  membership_id: string;
  user_id: string;
  name: string;
  role_code: 'owner' | 'admin';
  role_label: string;
};

export type DiscountMode = 'amount_cents' | 'percent';

export type ManualPaymentApprovalRequestInput = {
  office_id: string;
  charge_id: string;
  charge_version: number;
  request_id: string;
  session_id: string;
  unit_id: string;
  destination_account_id: string | null;
  payment_method_id: string;
  approver_user_id: string;
  amount_cents: number;
  operation_date: string;
  external_reference: string | null;
  justification: string;
  idempotency_key: string;
};

export type DiscountApprovalRequestInput = {
  office_id: string;
  charge_id: string;
  charge_version: number;
  request_id: string;
  approver_user_id: string;
  mode: DiscountMode;
  discount_cents: number;
  discount_percent: number | null;
  justification: string;
  idempotency_key: string;
};

export type FinancialApprovalDecisionInput = {
  office_id: string;
  decision: 'approve' | 'reject';
  expected_charge_version: number;
  note?: string | null;
  idempotency_key: string;
};

export type ExecuteApprovedPaymentInput = {
  office_id: string;
  session_id: string;
  expected_charge_version: number;
  idempotency_key: string;
};

export type FinancialApprovalItem = {
  id: string;
  office_id: string;
  kind: FinancialApprovalKind;
  status: FinancialApprovalStatus;
  charge_id: string;
  charge_version_snapshot: number;
  request_id: string;
  protocol: string;
  customer_name: string;
  service_summary: string;
  requester_user_id: string;
  requester_name: string;
  approver_user_id: string;
  approver_name: string;
  original_cents: number;
  requested_amount_cents: number;
  discount_cents: number | null;
  discount_percent: number | null;
  final_cents: number;
  card_fee_cents: number;
  payment_method_id: string | null;
  payment_method_name: string | null;
  session_id: string | null;
  unit_id: string | null;
  unit_name: string | null;
  destination_account_id: string | null;
  destination_account_name: string | null;
  operation_date: string | null;
  external_reference: string | null;
  justification: string;
  decision_note: string | null;
  created_at: string;
  expires_at: string;
  decided_at: string | null;
  executed_at: string | null;
  can_decide: boolean;
  can_execute: boolean;
  invalidation_reason: string | null;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidIsoDate(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const match = ISO_DATE_PATTERN.exec(value.trim());
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 2000 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

export type DiscountCalculation = {
  valid: boolean;
  original_cents: number;
  discount_cents: number;
  discount_percent: number;
  final_cents: number;
  error: string | null;
};

/**
 * Calculates discount in R$ (cents) or percentage keeping commercial discounts
 * strictly separate from card/acquirer fees (Etapa 5).
 */
export function calculateCommercialDiscount(params: {
  originalCents: number;
  balanceCents: number;
  mode: DiscountMode;
  valueCents?: number;
  percent?: number;
}): DiscountCalculation {
  const { originalCents, balanceCents, mode } = params;
  if (!Number.isInteger(originalCents) || originalCents <= 0 || !Number.isInteger(balanceCents) || balanceCents <= 0) {
    return {
      valid: false,
      original_cents: Math.max(0, originalCents || 0),
      discount_cents: 0,
      discount_percent: 0,
      final_cents: Math.max(0, balanceCents || 0),
      error: 'Não há saldo elegível para aplicar desconto nesta cobrança.',
    };
  }

  let discountCents = 0;
  let discountPercent = 0;

  if (mode === 'amount_cents') {
    discountCents = Math.round(params.valueCents ?? 0);
    if (!Number.isInteger(discountCents) || discountCents <= 0) {
      return {
        valid: false,
        original_cents: originalCents,
        discount_cents: 0,
        discount_percent: 0,
        final_cents: balanceCents,
        error: 'Informe um valor de desconto maior que zero.',
      };
    }
    discountPercent = Number(((discountCents / originalCents) * 100).toFixed(2));
  } else {
    const pct = Number(params.percent ?? 0);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      return {
        valid: false,
        original_cents: originalCents,
        discount_cents: 0,
        discount_percent: 0,
        final_cents: balanceCents,
        error: 'Informe um percentual de desconto entre 0,01% e 100%.',
      };
    }
    discountPercent = Number(pct.toFixed(2));
    discountCents = Math.round((originalCents * discountPercent) / 100);
  }

  if (discountCents <= 0) {
    return {
      valid: false,
      original_cents: originalCents,
      discount_cents: 0,
      discount_percent: discountPercent,
      final_cents: balanceCents,
      error: 'O desconto calculado precisa ser de pelo menos R$ 0,01.',
    };
  }

  if (discountCents > balanceCents) {
    return {
      valid: false,
      original_cents: originalCents,
      discount_cents: discountCents,
      discount_percent: discountPercent,
      final_cents: Math.max(0, balanceCents - discountCents),
      error: 'O desconto não pode ultrapassar o saldo atual da cobrança.',
    };
  }

  return {
    valid: true,
    original_cents: originalCents,
    discount_cents: discountCents,
    discount_percent: discountPercent,
    final_cents: balanceCents - discountCents,
    error: null,
  };
}

export type ApprovalValidationContext = {
  approval: Pick<
    FinancialApprovalItem,
    | 'status'
    | 'office_id'
    | 'charge_id'
    | 'charge_version_snapshot'
    | 'requested_amount_cents'
    | 'expires_at'
    | 'executed_at'
    | 'approver_user_id'
    | 'requester_user_id'
  >;
  current_office_id: string;
  current_charge_version: number;
  current_balance_cents: number;
  actor_user_id: string;
  actor_has_permission: boolean;
  now_iso?: string;
  require_open_cash_session?: boolean;
  cash_session_open?: boolean;
};

export function validateApprovalExecutionOrDecision(
  mode: 'decide' | 'execute',
  ctx: ApprovalValidationContext,
): { valid: boolean; code: string | null; reason: string | null } {
  const { approval } = ctx;
  const now = new Date(ctx.now_iso ?? new Date().toISOString()).getTime();
  const expiresAt = new Date(approval.expires_at).getTime();

  if (approval.office_id !== ctx.current_office_id) {
    return {
      valid: false,
      code: 'OFFICE_MISMATCH',
      reason: 'Esta autorização pertence a outro escritório e não pode ser usada aqui.',
    };
  }

  if (!ctx.actor_has_permission) {
    return {
      valid: false,
      code: 'PERMISSION_REVOKED',
      reason: 'A permissão necessária para esta operação não está mais ativa.',
    };
  }

  if (mode === 'decide') {
    if (approval.approver_user_id !== ctx.actor_user_id) {
      return {
        valid: false,
        code: 'WRONG_APPROVER',
        reason: 'Somente o aprovador designado pode aprovar ou rejeitar esta solicitação.',
      };
    }
    if (approval.status !== 'pending') {
      return {
        valid: false,
        code: 'ALREADY_DECIDED',
        reason: 'Esta solicitação de autorização já foi decidida ou encerrada.',
      };
    }
  } else {
    if (approval.executed_at || approval.status === 'executed') {
      return {
        valid: false,
        code: 'ALREADY_EXECUTED',
        reason: 'Esta autorização já foi utilizada em um lançamento e não pode ser reutilizada.',
      };
    }
    if (approval.status !== 'approved') {
      return {
        valid: false,
        code: 'NOT_APPROVED',
        reason: 'Esta autorização não está aprovada para execução.',
      };
    }
    if (ctx.require_open_cash_session && !ctx.cash_session_open) {
      return {
        valid: false,
        code: 'CASH_SESSION_CLOSED',
        reason: 'O caixa precisa estar aberto para concluir o lançamento autorizado.',
      };
    }
  }

  if (Number.isFinite(expiresAt) && now > expiresAt) {
    return {
      valid: false,
      code: 'APPROVAL_EXPIRED',
      reason: 'O prazo desta solicitação de autorização expirou. Solicite uma nova autorização.',
    };
  }

  if (approval.charge_version_snapshot !== ctx.current_charge_version) {
    return {
      valid: false,
      code: 'CHARGE_CHANGED',
      reason: 'A cobrança foi alterada após o pedido. Esta autorização foi invalidada e precisa ser solicitada novamente.',
    };
  }

  if (approval.requested_amount_cents > ctx.current_balance_cents) {
    return {
      valid: false,
      code: 'BALANCE_CHANGED',
      reason: 'O valor solicitado ultrapassa o saldo atual da cobrança. Solicite uma nova autorização.',
    };
  }

  return { valid: true, code: null, reason: null };
}
