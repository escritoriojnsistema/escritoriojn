import {isCashPaymentDestination} from './cash.js';
import type { AccessContext } from './access.js';
import type {
  CashAccount,
  CashConfiguration,
  CashPaymentMethod,
  CashSession,
  CashUnit,
} from './cash.js';

export const MANUAL_PAYMENT_SETUP_GUIDANCE =
  'Para informar pagamentos, configure uma unidade financeira, uma conta de destino e uma forma de pagamento. Depois, abra seu Caixa.';

export const MANUAL_PAYMENT_OPEN_CASH_GUIDANCE =
  'A configuração financeira está pronta. Abra seu Caixa individual para informar ou solicitar a confirmação do pagamento manual.';

export type ManualPaymentOrigin = 'presencial' | 'whatsapp' | 'portal' | 'cobrancas' | 'caixa';

export type ManualPaymentInstallmentSummary = {
  number: number;
  due_date: string;
  amount_cents: number;
};

export type ManualPaymentChargeContext = {
  charge_id: string;
  charge_version: number;
  request_id: string;
  protocol: string;
  origin?: ManualPaymentOrigin;
  customer_name?: string | null;
  service_summary: string;
  due_cents: number;
  paid_cents: number;
  balance_cents: number;
  status: 'open' | 'aberta' | 'paid' | 'cancelled' | 'cancelada' | 'zero' | 'sem_valor';
  installments?: ManualPaymentInstallmentSummary[];
};

export type ManualPaymentReturnTarget = {
  pathname: string;
  label: string;
  office_id: string;
  request_id?: string;
  charge?: ManualPaymentChargeContext;
};

export type CashNavigationState = {
  office_id?: string;
  configuration_unit_id?: string;
  tab?: 'own' | 'all' | 'configuration' | 'charges' | 'expenses' | 'reports' | 'approvals';
  approval_id?: string;
  open_manual_payment?: boolean;
  preselected_charge?: ManualPaymentChargeContext;
  return_to?: ManualPaymentReturnTarget;
};

export type ManualPaymentAuthority = {
  office_id: string;
  role_code: AccessContext['role_code'];
  can_access: boolean;
  can_confirm_directly: boolean;
  requires_approval: boolean;
  can_open_cash: boolean;
  can_configure_finance: boolean;
  has_office_wide_requests: boolean;
  denial_reason: string | null;
};

export function evaluateManualPaymentAuthority(
  context: AccessContext | null | undefined,
  targetOfficeId?: string,
): ManualPaymentAuthority {
  if (!context || context.role_code === 'client') {
    return {
      office_id: targetOfficeId ?? '',
      role_code: context?.role_code ?? 'client',
      can_access: false,
      can_confirm_directly: false,
      requires_approval: false,
      can_open_cash: false,
      can_configure_finance: false,
      has_office_wide_requests: false,
      denial_reason: 'Apenas integrantes autorizados da equipe podem informar pagamentos manuais.',
    };
  }

  if (targetOfficeId && context.office_id !== targetOfficeId) {
    return {
      office_id: context.office_id,
      role_code: context.role_code,
      can_access: false,
      can_confirm_directly: false,
      requires_approval: false,
      can_open_cash: false,
      can_configure_finance: false,
      has_office_wide_requests: false,
      denial_reason: 'O acesso financeiro é isolado por escritório. Selecione o escritório correspondente.',
    };
  }

  const perms = new Set(context.permissions);
  const isOwner = context.role_code === 'owner';
  const isAdmin = context.role_code === 'admin';
  const hasCashOpen = perms.has('cash.open');
  const hasCashRead = perms.has('cash.read');
  const hasCashManage = perms.has('cash.manage');
  const hasChargesRead = perms.has('charges.read');
  const hasRequestsRead = perms.has('requests.read');
  const hasRequestsReadAll = perms.has('requests.read_all');
  const hasManualApprove = isOwner || (isAdmin && perms.has('payments.manual.approve'));

  const canOperateManualPayment = hasCashOpen && hasChargesRead && hasRequestsRead;
  // Owners and cash managers can still open the entry flow to see guided setup even if cash.open is checked
  const canAccess = canOperateManualPayment || (hasChargesRead && hasRequestsRead && (hasCashManage || hasCashRead));

  if (!canOperateManualPayment) {
    return {
      office_id: context.office_id,
      role_code: context.role_code,
      can_access: canAccess,
      can_confirm_directly: false,
      requires_approval: false,
      can_open_cash: hasCashOpen,
      can_configure_finance: hasCashManage,
      has_office_wide_requests: isOwner || hasRequestsReadAll,
      denial_reason: hasCashManage
        ? 'Seu perfil precisa da permissão de abertura de caixa (cash.open) junto com cobranças para registrar recebimentos.'
        : 'Seu perfil não possui permissão operacional para registrar pagamentos manuais neste escritório.',
    };
  }

  return {
    office_id: context.office_id,
    role_code: context.role_code,
    can_access: true,
    can_confirm_directly: hasManualApprove,
    requires_approval: !hasManualApprove,
    can_open_cash: true,
    can_configure_finance: hasCashManage,
    has_office_wide_requests: isOwner || hasRequestsReadAll,
    denial_reason: null,
  };
}

export function isChargeEligibleForManualPayment(
  charge: Pick<ManualPaymentChargeContext, 'status' | 'balance_cents'> | null | undefined,
): boolean {
  if (!charge) return false;
  const openStatus = charge.status === 'open' || charge.status === 'aberta';
  return openStatus && Number.isSafeInteger(charge.balance_cents) && charge.balance_cents > 0;
}

export function filterCompatibleUnitMethods(
  configuration: Pick<CashConfiguration, 'units' | 'accounts' | 'payment_methods'> | null | undefined,
  unitId: string,
  cashAccountId?: string | null,
): CashPaymentMethod[] {
  if (!configuration || !unitId) return [];
  const unitActive = configuration.units.some((u) => u.id === unitId && u.active);
  if (!unitActive) return [];

  return configuration.payment_methods.filter((method) => {
    if (!method.active || method.unit_id !== unitId) return false;
    return configuration.accounts.some((account) => {
      if (!account.active || account.id !== method.destination_account_id || account.unit_id !== unitId) {
        return false;
      }
      if (method.type === 'cash') {
        return account.type === 'cash' && (!cashAccountId || account.id === cashAccountId);
      }
      return isCashPaymentDestination(method.type, account.type);
    });
  });
}

export type CashSetupReadiness = {
  has_active_unit: boolean;
  has_active_cash_account: boolean;
  has_active_non_cash_account: boolean;
  has_active_destination_account: boolean;
  has_active_payment_method: boolean;
  has_open_own_session: boolean;
  open_own_session: CashSession | null;
  compatible_methods_for_open_session: CashPaymentMethod[];
  setup_complete: boolean;
  ready_to_record: boolean;
  current_step: 1 | 2 | 3 | 4 | 5;
  missing_requirements: string[];
  guidance_message: string | null;
  status_label: 'Configuração incompleta' | 'Aguardando abertura do caixa' | 'Configuração concluída';
};

export function evaluateCashSetupReadiness(
  configuration: Pick<CashConfiguration, 'units' | 'accounts' | 'payment_methods'> | null | undefined,
  sessions: CashSession[] = [],
): CashSetupReadiness {
  const activeUnits = (configuration?.units ?? []).filter((u) => u.active);
  const activeUnitIds = new Set(activeUnits.map((u) => u.id));
  const activeAccounts = (configuration?.accounts ?? []).filter(
    (a) => a.active && activeUnitIds.has(a.unit_id),
  );
  const activeCashAccounts = activeAccounts.filter((a) => a.type === 'cash');
  const activeNonCashAccounts = activeAccounts.filter((a) => a.type !== 'cash');

  const activeMethods = (configuration?.payment_methods ?? []).filter((m) => {
    if (!m.active || !activeUnitIds.has(m.unit_id)) return false;
    return activeAccounts.some(
      (a) =>
        a.id === m.destination_account_id &&
        a.unit_id === m.unit_id &&
        isCashPaymentDestination(m.type, a.type),
    );
  });

  const openOwnSession =
    sessions.find((s) => s.is_self && s.status === 'open') ?? null;

  const compatibleForSession = openOwnSession
    ? filterCompatibleUnitMethods(
        configuration,
        openOwnSession.unit_id,
        openOwnSession.cash_account_id,
      )
    : [];

  const hasActiveUnit = activeUnits.length > 0;
  const hasActiveCashAccount = activeCashAccounts.length > 0;
  const hasActiveNonCashAccount = activeNonCashAccounts.length > 0;
  const hasActiveDestinationAccount = activeAccounts.length > 0;
  const hasActivePaymentMethod = activeMethods.length > 0;
  const hasOpenOwnSession = openOwnSession !== null;

  const missing: string[] = [];
  if (!hasActiveUnit) missing.push('Unidade financeira ativa');
  if (!hasActiveCashAccount) missing.push('Conta em espécie ativa para abertura do caixa');
  if (!hasActiveDestinationAccount) missing.push('Conta de destino ativa');
  if (!hasActivePaymentMethod) missing.push('Forma de pagamento ativa vinculada a uma conta compatível');
  if (!hasOpenOwnSession) missing.push('Caixa individual aberto');
  if (hasOpenOwnSession && compatibleForSession.length === 0) {
    missing.push('Forma de pagamento ativa compatível com a unidade do caixa aberto');
  }

  const setupComplete = hasActiveUnit && hasActiveCashAccount && hasActivePaymentMethod;
  const readyToRecord = setupComplete && hasOpenOwnSession && compatibleForSession.length > 0;

  let currentStep: 1 | 2 | 3 | 4 | 5 = 5;
  if (!hasActiveUnit) currentStep = 1;
  else if (!hasActiveCashAccount) currentStep = 2;
  else if (!hasActivePaymentMethod) currentStep = 3;
  else if (!hasOpenOwnSession) currentStep = 4;
  else if (compatibleForSession.length === 0) currentStep = 3;

  let guidanceMessage: string | null = null;
  if (!setupComplete || (hasOpenOwnSession && compatibleForSession.length === 0)) {
    guidanceMessage = MANUAL_PAYMENT_SETUP_GUIDANCE;
  } else if (!hasOpenOwnSession) {
    guidanceMessage = MANUAL_PAYMENT_OPEN_CASH_GUIDANCE;
  }

  const statusLabel: CashSetupReadiness['status_label'] = !setupComplete
    ? 'Configuração incompleta'
    : !hasOpenOwnSession
      ? 'Aguardando abertura do caixa'
      : 'Configuração concluída';

  return {
    has_active_unit: hasActiveUnit,
    has_active_cash_account: hasActiveCashAccount,
    has_active_non_cash_account: hasActiveNonCashAccount,
    has_active_destination_account: hasActiveDestinationAccount,
    has_active_payment_method: hasActivePaymentMethod,
    has_open_own_session: hasOpenOwnSession,
    open_own_session: openOwnSession,
    compatible_methods_for_open_session: compatibleForSession,
    setup_complete: setupComplete,
    ready_to_record: readyToRecord,
    current_step: currentStep,
    missing_requirements: missing,
    guidance_message: guidanceMessage,
    status_label: statusLabel,
  };
}

export type ProviderAccountSelection = {
  active_units: CashUnit[];
  active_receiving_accounts: CashAccount[];
  inactive_receiving_accounts_count: number;
  cash_only_accounts_count: number;
  has_any_active_unit: boolean;
  has_any_active_receiving_account: boolean;
};

export function selectProviderReceivingAccounts(
  configuration: Pick<CashConfiguration, 'units' | 'accounts'> | null | undefined,
  financialUnitId: string,
): ProviderAccountSelection {
  const units = configuration?.units ?? [];
  const accounts = configuration?.accounts ?? [];
  const activeUnits = units.filter((u) => u.active);
  const activeUnitIds = new Set(activeUnits.map((u) => u.id));

  const scopedAccounts = accounts.filter(
    (a) => !financialUnitId || a.unit_id === financialUnitId,
  );
  const nonCashAccounts = scopedAccounts.filter((a) => a.type !== 'cash');
  const activeReceiving = nonCashAccounts.filter(
    (a) => a.active && activeUnitIds.has(a.unit_id),
  );
  const inactiveReceivingCount = nonCashAccounts.filter(
    (a) => !a.active || !activeUnitIds.has(a.unit_id),
  ).length;
  const cashOnlyCount = scopedAccounts.filter((a) => a.type === 'cash' && a.active).length;

  return {
    active_units: activeUnits,
    active_receiving_accounts: activeReceiving,
    inactive_receiving_accounts_count: inactiveReceivingCount,
    cash_only_accounts_count: cashOnlyCount,
    has_any_active_unit: activeUnits.length > 0,
    has_any_active_receiving_account: activeReceiving.length > 0,
  };
}

export function mergeCashConfigurationPages(pages: CashConfiguration[]): CashConfiguration {
  if (!pages.length) {
    return {
      units: [],
      accounts: [],
      payment_methods: [],
      units_total: 0,
      accounts_total: 0,
      payment_methods_total: 0,
      page: 1,
      page_size: 50,
      unit_id: null,
    };
  }
  const dedupe = <T extends { id: string }>(lists: T[][]): T[] => {
    const map = new Map<string, T>();
    for (const list of lists) {
      for (const item of list) {
        map.set(item.id, item);
      }
    }
    return [...map.values()];
  };

  const last = pages[pages.length - 1];
  const units = dedupe(pages.map((p) => p.units));
  const accounts = dedupe(pages.map((p) => p.accounts));
  const payment_methods = dedupe(pages.map((p) => p.payment_methods));

  return {
    units,
    accounts,
    payment_methods,
    units_total: Math.max(last.units_total, units.length),
    accounts_total: Math.max(last.accounts_total, accounts.length),
    payment_methods_total: Math.max(last.payment_methods_total, payment_methods.length),
    page: last.page,
    page_size: last.page_size,
    unit_id: last.unit_id,
  };
}

export async function loadAllCashConfigurationPagesWithFetcher(
  officeId: string,
  unitId: string | null,
  fetcher: (
    office: string,
    page: number,
    unit: string | null,
    sig?: AbortSignal,
  ) => Promise<CashConfiguration>,
  signal?: AbortSignal,
): Promise<CashConfiguration> {
  const first = await fetcher(officeId, 1, unitId, signal);
  const pageSize = Math.max(1, first.page_size || 50);
  const maxTotal = Math.max(
    first.units_total,
    first.accounts_total,
    first.payment_methods_total,
  );
  const totalPages = Math.max(1, Math.ceil(maxTotal / pageSize));

  if (totalPages <= 1) {
    return first;
  }

  const pages: CashConfiguration[] = [first];
  for (let page = 2; page <= totalPages; page++) {
    signal?.throwIfAborted();
    const next = await fetcher(officeId, page, unitId, signal);
    pages.push(next);
  }
  return mergeCashConfigurationPages(pages);
}

export const MANUAL_METHOD_TYPE_GUIDANCE: Record<
  CashPaymentMethod['type'],
  { label: string; description: string }
> = {
  cash: {
    label: 'Dinheiro (espécie)',
    description:
      'Entra no saldo físico da conta em espécie do seu caixa aberto. Informe o valor recebido para cálculo automático de troco.',
  },
  pix: {
    label: 'Pix manual (conferido fora do sistema)',
    description:
      'Registro manual após conferência real do crédito na conta bancária/digital de destino. Não substitui liquidação automática bancária.',
  },
  card: {
    label: 'Cartão (maquininha avulsa / débito ou crédito)',
    description:
      'Registro manual de venda em maquininha avulsa. Taxas de cartão permanecem separadas de descontos comerciais.',
  },
  boleto: {
    label: 'Boleto manual',
    description: 'Registre após conferir o crédito do boleto na conta bancária vinculada.',
  },
  transfer: {
    label: 'Transferência bancária / depósito',
    description:
      'Registro manual após conferência do depósito ou transferência na conta bancária de destino. Informe comprovante/referência quando houver.',
  },
};
