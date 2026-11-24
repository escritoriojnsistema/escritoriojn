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

export type HomeCardKey = 'customers' | 'files' | 'team' | 'account';

export type HomeLayoutPlan = {
  showFinanceBanner: boolean;
  showRequestsPrimary: boolean;
  sideCards: HomeCardKey[];
  bottomCards: HomeCardKey[];
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

  // Match the 7+5 executive Bento split: pair Solicitações with up to 2 stacked cards
  // (Clientes + Anexos privados for super admin, or Anexos privados + Conta for client),
  // and place any remaining management/account card in the wide bottom row.
  const sideCards = secondary.slice(0, 2);
  const bottomCards = secondary.slice(2);

  return {
    showFinanceBanner: flags.hasFinance,
    showRequestsPrimary: true,
    sideCards,
    bottomCards,
  };
}

export function formatHomeMoney(cents: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(cents / 100);
}
