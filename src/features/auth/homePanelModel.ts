import type { AccessContext } from '../../../shared/access';
import type { CashDashboard } from '../../../shared/cash';
import type { ClientFinance } from '../../../shared/finance';
import {
  publicRequestStatusLabels,
  requestStatusLabels,
  type RequestHomeCounts,
} from '../../../shared/requests';
import { paths } from '../../app/routes';

export type HomeFinanceCardMode =
  | {
      kind: 'cash_all';
      title: string;
      description: string;
      path: string;
      scope: 'all';
      tab: 'all';
    }
  | {
      kind: 'cash_own';
      title: string;
      description: string;
      path: string;
      scope: 'own';
      tab: 'own';
    }
  | {
      kind: 'charges_only';
      title: string;
      description: string;
      path: string;
      tab: 'charges';
    }
  | {
      kind: 'client_payments';
      title: string;
      description: string;
      path: string;
    };

export type HomeCashSummary = {
  openCount: number;
  closedCount: number;
  totalSessions: number;
  numerarioCents: number;
  receivedCents: number;
  statusLabel: string;
  statusTone: 'active' | 'neutral';
};

export type HomeClientFinanceSummary = {
  dueCents: number;
  paidCents: number;
  balanceCents: number;
  totalCharges: number;
  historyTotal: number;
  statusLabel: string;
  statusTone: 'warning' | 'success' | 'neutral';
};

export type HomeRequestStageRow = {
  key: string;
  label: string;
  total: number;
  percent: number;
  tone: 'success' | 'primary';
};

export type HomeCardKey =
  | 'customers'
  | 'files'
  | 'documents'
  | 'services'
  | 'team'
  | 'settings'
  | 'audit'
  | 'notifications'
  | 'account';

export type HomeLayoutPlan = {
  showFinanceBanner: boolean;
  showRequestsPrimary: boolean;
  sideCards: HomeCardKey[];
  bottomCards: HomeCardKey[];
};

export type SmartHomePlan = HomeLayoutPlan & {
  financeMode: HomeFinanceCardMode | null;
  canRequests: boolean;
  canCustomers: boolean;
  servicesPath: string;
  servicesLabel: string;
  servicesDescription: string;
  adaptiveGridCards: HomeCardKey[];
};

export function resolveHomeFinanceCard(
  context: AccessContext,
  client: boolean,
): HomeFinanceCardMode | null {
  if (client) {
    return {
      kind: 'client_payments',
      title: 'Meus pagamentos',
      description: 'Cobranças, valores aplicados e saldo em aberto',
      path: paths.clientPayments,
    };
  }
  const has = (permission: string) => context.permissions.includes(permission);
  if (has('cash.read') && has('cash.read_all')) {
    return {
      kind: 'cash_all',
      title: 'Caixa geral',
      description: 'Visão consolidada de caixas, saldo em espécie e recebimentos do escritório',
      path: paths.cash,
      scope: 'all',
      tab: 'all',
    };
  }
  if (has('cash.read')) {
    return {
      kind: 'cash_own',
      title: 'Meu caixa',
      description: 'Situação do seu caixa individual, saldo em espécie e recebimentos',
      path: paths.cash,
      scope: 'own',
      tab: 'own',
    };
  }
  if (has('requests.read') && has('charges.read')) {
    return {
      kind: 'charges_only',
      title: 'Cobranças e caixa',
      description: 'Obrigações, parcelas e conferência financeira dos seus atendimentos',
      path: paths.cash,
      tab: 'charges',
    };
  }
  return null;
}

export function summarizeCashDashboard(
  data: CashDashboard,
  scope: 'own' | 'all',
): HomeCashSummary {
  const openCount =
    data.summary?.open ??
    data.sessions.filter(session => session.status === 'open').length;
  const closedCount =
    data.summary?.closed ??
    data.sessions.filter(session => session.status === 'closed').length;
  const numerarioCents =
    data.summary?.numerario_cents ??
    data.sessions.reduce((sum, session) => sum + session.numerario_cents, 0);
  const receivedCents =
    data.summary?.received_cents ??
    data.sessions.reduce((sum, session) => sum + session.received_cents, 0);
  const totalSessions = Math.max(data.total, openCount + closedCount);

  if (openCount > 0) {
    const label =
      scope === 'all'
        ? `${openCount} ${openCount === 1 ? 'caixa aberto' : 'caixas abertos'}`
        : openCount === 1
          ? 'Caixa aberto'
          : `${openCount} caixas abertos`;
    return {
      openCount,
      closedCount,
      totalSessions,
      numerarioCents,
      receivedCents,
      statusLabel: label,
      statusTone: 'active',
    };
  }

  return {
    openCount,
    closedCount,
    totalSessions,
    numerarioCents,
    receivedCents,
    statusLabel:
      totalSessions === 0
        ? scope === 'all'
          ? 'Nenhum caixa registrado'
          : 'Nenhum caixa aberto'
        : scope === 'all'
          ? 'Todos os caixas fechados'
          : 'Caixa fechado',
    statusTone: 'neutral',
  };
}

export function summarizeClientFinance(data: ClientFinance): HomeClientFinanceSummary {
  const dueCents = data.summary.due_cents;
  const paidCents = data.summary.paid_cents;
  const balanceCents = data.summary.balance_cents;
  const totalCharges = data.total;
  const historyTotal = data.history_total;

  if (balanceCents > 0) {
    return {
      dueCents,
      paidCents,
      balanceCents,
      totalCharges,
      historyTotal,
      statusLabel: 'Saldo em aberto',
      statusTone: 'warning',
    };
  }
  if (totalCharges > 0) {
    return {
      dueCents,
      paidCents,
      balanceCents,
      totalCharges,
      historyTotal,
      statusLabel: 'Em dia',
      statusTone: 'success',
    };
  }
  return {
    dueCents,
    paidCents,
    balanceCents,
    totalCharges,
    historyTotal,
    statusLabel: 'Sem cobranças',
    statusTone: 'neutral',
  };
}

export function buildRequestStageRows(
  counts: RequestHomeCounts,
  client: boolean,
): { total: number; rows: HomeRequestStageRow[] } {
  const labels = client ? publicRequestStatusLabels : requestStatusLabels;
  const raw = Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    total: counts[key as keyof RequestHomeCounts] ?? 0,
  }));
  const total = raw.reduce((sum, row) => sum + row.total, 0);
  const maximum = Math.max(1, ...raw.map(row => row.total));
  const rows: HomeRequestStageRow[] = raw.map(row => ({
    key: row.key,
    label: row.label,
    total: row.total,
    percent: row.total === 0 ? 0 : Math.round((row.total / maximum) * 100),
    tone: row.key === 'concluido' ? 'success' : 'primary',
  }));
  return { total, rows };
}

export function resolveHomeLayout(flags: {
  hasFinance: boolean;
  hasRequests: boolean;
  hasCustomers: boolean;
  hasFiles: boolean;
  hasTeam: boolean;
  hasAccount: boolean;
}): HomeLayoutPlan {
  const secondary: HomeCardKey[] = [];
  if (flags.hasCustomers) secondary.push('customers');
  if (flags.hasFiles) secondary.push('files');
  if (flags.hasTeam) secondary.push('team');
  if (flags.hasAccount) secondary.push('account');

  if (!flags.hasRequests) {
    return {
      showFinanceBanner: flags.hasFinance,
      showRequestsPrimary: false,
      sideCards: [],
      bottomCards: secondary,
    };
  }

  const sideCards = secondary.slice(0, 2);
  const bottomCards = secondary.slice(2);

  return {
    showFinanceBanner: flags.hasFinance,
    showRequestsPrimary: true,
    sideCards,
    bottomCards,
  };
}

/**
 * Intelligently builds the single-screen operational home layout for every
 * role (Super administrador, Administrador, Funcionário with any subset of
 * permissions, and Cliente), keeping the screen strictly within a zero-scroll
 * budget while promoting only genuinely authorized workspaces.
 */
export function resolveSmartHomePlan(
  context: AccessContext,
  client: boolean,
): SmartHomePlan {
  const financeMode = resolveHomeFinanceCard(context, client);
  const has = (...permissions: string[]) =>
    permissions.every(permission => context.permissions.includes(permission));

  const isAdminRole = !client && (context.role_code === 'owner' || context.role_code === 'admin');
  const canRequests = client || has('requests.read');
  const canCustomers = !client && has('customers.read');
  const canFiles = client || has('requests.read', 'files.read');
  const canDocuments =
    client ||
    has('templates.read') ||
    has('documents.read', 'requests.read', 'customers.read');
  const hasServicesCatalog = !client && has('services.read');
  const hasChecklistsOnly = !client && !hasServicesCatalog && has('requests.read', 'checklists.read');
  const canServices = hasServicesCatalog || hasChecklistsOnly;
  const canTeam = !client && has('users.manage');
  const canSettings = isAdminRole && has('settings.access');
  const canAudit = !client && has('audit.read');

  const servicesPath = hasServicesCatalog ? paths.services : paths.checklists;
  const servicesLabel = hasServicesCatalog ? 'Serviços' : 'Checklist';
  const servicesDescription = hasServicesCatalog
    ? 'Catálogo, prazos e checklists operacionais'
    : 'Pendências e itens de conferência dos atendimentos';

  if (client) {
    return {
      financeMode,
      canRequests: true,
      canCustomers: false,
      servicesPath,
      servicesLabel,
      servicesDescription,
      showFinanceBanner: Boolean(financeMode),
      showRequestsPrimary: true,
      sideCards: ['files', 'documents'],
      bottomCards: ['account'],
      adaptiveGridCards: [],
    };
  }

  // Daily operational cards prioritized in the right-hand 5-col stack beside Solicitações.
  const dailyPool: HomeCardKey[] = [];
  if (canCustomers) dailyPool.push('customers');
  if (canFiles) dailyPool.push('files');
  if (canDocuments) dailyPool.push('documents');
  if (canServices) dailyPool.push('services');

  // Management & governance cards prioritized in the wide bottom bar.
  const managementPool: HomeCardKey[] = [];
  if (canTeam) managementPool.push('team');
  if (canSettings) managementPool.push('settings');
  if (canAudit) managementPool.push('audit');

  // Case 1: User has Solicitações access -> 7+5 executive Bento layout
  if (canRequests) {
    const orderedForSide = [...dailyPool, ...managementPool];
    const sideCards = orderedForSide.slice(0, 2);

    // Remaining authorized modules not yet placed in sideCards.
    const used = new Set<HomeCardKey>(sideCards);
    const remainingManagement = managementPool.filter(card => !used.has(card));
    const remainingDaily = dailyPool.filter(card => !used.has(card));
    const remainingAll = [...remainingManagement, ...remainingDaily];

    // If the user has fewer than 2 side cards (partial employee), balance the 5-col stack
    // cleanly with always-available account/notifications cards so there is no empty hole.
    if (sideCards.length < 2) {
      if (sideCards.length === 0) {
        sideCards.push('notifications', 'account');
      } else {
        sideCards.push('account');
      }
    }

    // Zero-scroll cap: when finance banner is visible, at most 1 wide bottom card;
    // when finance banner is absent, up to 2 compact side-by-side bottom cards.
    const maxBottom = financeMode ? 1 : 2;
    const bottomCards = remainingAll.slice(0, maxBottom);

    return {
      financeMode,
      canRequests: true,
      canCustomers,
      servicesPath,
      servicesLabel,
      servicesDescription,
      showFinanceBanner: Boolean(financeMode),
      showRequestsPrimary: true,
      sideCards,
      bottomCards,
      adaptiveGridCards: [],
    };
  }

  // Case 2: Employee/Admin WITHOUT Solicitações -> Smart Adaptive Full-Height Grid
  // Promote all genuinely permitted modules (up to 4 cards so everything fits 1 screen).
  const authorizedCards: HomeCardKey[] = [...dailyPool, ...managementPool];
  const adaptiveCards: HomeCardKey[] = authorizedCards.slice(0, 4);
  const bottomCards: HomeCardKey[] = [];

  // Balance sparse or odd permission sets with always-allowed workspace shortcuts
  // so desktop never has empty slabs or orphan grid cells while staying zero-scroll.
  if (adaptiveCards.length === 0) {
    adaptiveCards.push('notifications', 'account');
  } else if (adaptiveCards.length === 1) {
    if (!adaptiveCards.includes('notifications')) adaptiveCards.push('notifications');
    bottomCards.push('account');
  } else if (adaptiveCards.length === 2) {
    if (!adaptiveCards.includes('notifications')) adaptiveCards.push('notifications');
    if (!adaptiveCards.includes('account')) adaptiveCards.push('account');
  } else if (adaptiveCards.length === 3) {
    if (!adaptiveCards.includes('account')) adaptiveCards.push('account');
  }

  return {
    financeMode,
    canRequests: false,
    canCustomers,
    servicesPath,
    servicesLabel,
    servicesDescription,
    showFinanceBanner: Boolean(financeMode),
    showRequestsPrimary: false,
    sideCards: [],
    bottomCards,
    adaptiveGridCards: adaptiveCards.slice(0, 4),
  };
}

export function formatHomeMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}
