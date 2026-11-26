import test from 'node:test';
import assert from 'node:assert/strict';
import type { AccessContext } from '../shared/access';
import type { CashDashboard } from '../shared/cash';
import type { ClientFinance } from '../shared/finance';
import {
  buildRequestStageRows,
  resolveHomeFinanceCard,
  resolveHomeLayout,
  resolveSmartHomePlan,
  summarizeCashDashboard,
  summarizeClientFinance,
} from '../src/features/auth/homePanelModel';

function makeContext(
  role_code: AccessContext['role_code'],
  permissions: string[],
): AccessContext {
  return {
    office_id: '11111111-1111-4111-8111-111111111111',
    user_id: '22222222-2222-4222-8222-222222222222',
    office_name: 'Escritório JN',
    display_name: 'Usuário Teste',
    role_code,
    permissions: ['foundation.access', ...permissions],
  };
}

test('resolveHomeFinanceCard adapts per role and permissions', () => {
  const superAdmin = resolveHomeFinanceCard(
    makeContext('owner', ['cash.read', 'cash.read_all', 'requests.read', 'charges.read']),
    false,
  );
  assert.equal(superAdmin?.kind, 'cash_all');
  assert.equal(superAdmin?.title, 'Caixa geral');

  const employeeOwnCash = resolveHomeFinanceCard(
    makeContext('employee', ['cash.read', 'requests.read']),
    false,
  );
  assert.equal(employeeOwnCash?.kind, 'cash_own');
  assert.equal(employeeOwnCash?.title, 'Meu caixa');

  const employeeChargesOnly = resolveHomeFinanceCard(
    makeContext('employee', ['requests.read', 'charges.read']),
    false,
  );
  assert.equal(employeeChargesOnly?.kind, 'charges_only');
  assert.equal(employeeChargesOnly?.title, 'Cobranças e caixa');

  const employeeNoFinance = resolveHomeFinanceCard(
    makeContext('employee', ['requests.read', 'customers.read']),
    false,
  );
  assert.equal(employeeNoFinance, null);

  const clientCard = resolveHomeFinanceCard(makeContext('client', []), true);
  assert.equal(clientCard?.kind, 'client_payments');
  assert.equal(clientCard?.title, 'Meus pagamentos');
});

test('summarizeCashDashboard calculates consolidated and individual states', () => {
  const dashboard: CashDashboard = {
    sessions: [],
    total: 5,
    page: 1,
    page_size: 3,
    scope: 'all',
    can_open: true,
    can_manage: true,
    can_read_all: true,
    summary: {
      open: 2,
      closed: 3,
      numerario_cents: 125_000,
      received_cents: 480_500,
    },
  };
  const consolidated = summarizeCashDashboard(dashboard, 'all');
  assert.equal(consolidated.openCount, 2);
  assert.equal(consolidated.closedCount, 3);
  assert.equal(consolidated.numerarioCents, 125_000);
  assert.equal(consolidated.receivedCents, 480_500);
  assert.equal(consolidated.statusLabel, '2 caixas abertos');
  assert.equal(consolidated.statusTone, 'active');

  const closedOwn = summarizeCashDashboard(
    {
      ...dashboard,
      scope: 'own',
      total: 1,
      summary: { open: 0, closed: 1, numerario_cents: 0, received_cents: 30_000 },
    },
    'own',
  );
  assert.equal(closedOwn.statusLabel, 'Caixa fechado');
  assert.equal(closedOwn.statusTone, 'neutral');

  const emptyOwn = summarizeCashDashboard(
    {
      ...dashboard,
      scope: 'own',
      total: 0,
      summary: { open: 0, closed: 0, numerario_cents: 0, received_cents: 0 },
    },
    'own',
  );
  assert.equal(emptyOwn.statusLabel, 'Nenhum caixa aberto');
});

test('summarizeClientFinance differentiates open balance, paid up, and empty', () => {
  const base: ClientFinance = {
    items: [],
    total: 2,
    page: 1,
    page_size: 5,
    summary: { due_cents: 50_000, paid_cents: 20_000, balance_cents: 30_000 },
    history: [],
    history_total: 1,
    history_page: 1,
  };
  const openSummary = summarizeClientFinance(base);
  assert.equal(openSummary.statusLabel, 'Saldo em aberto');
  assert.equal(openSummary.statusTone, 'warning');

  const settledSummary = summarizeClientFinance({
    ...base,
    summary: { due_cents: 50_000, paid_cents: 50_000, balance_cents: 0 },
  });
  assert.equal(settledSummary.statusLabel, 'Em dia');
  assert.equal(settledSummary.statusTone, 'success');

  const emptySummary = summarizeClientFinance({
    ...base,
    total: 0,
    summary: { due_cents: 0, paid_cents: 0, balance_cents: 0 },
  });
  assert.equal(emptySummary.statusLabel, 'Sem cobranças');
  assert.equal(emptySummary.statusTone, 'neutral');
});

test('buildRequestStageRows normalizes widths and marks concluido as success', () => {
  const staff = buildRequestStageRows(
    {
      aberto: 0,
      em_atendimento: 1,
      aguardando_cliente: 0,
      aguardando_responsavel: 2,
      concluido: 1,
      cancelado: 0,
    },
    false,
  );
  assert.equal(staff.total, 4);
  const waiting = staff.rows.find(row => row.key === 'aguardando_responsavel');
  const done = staff.rows.find(row => row.key === 'concluido');
  assert.equal(waiting?.percent, 100);
  assert.equal(done?.percent, 50);
  assert.equal(done?.tone, 'success');

  const client = buildRequestStageRows({ recebido: 1 }, true);
  assert.equal(client.total, 1);
  assert.equal(client.rows.find(row => row.key === 'recebido')?.percent, 100);
});

test('resolveHomeLayout keeps balanced Bento slots for super admin, client, and partial roles', () => {
  const superAdminLayout = resolveHomeLayout({
    hasFinance: true,
    hasRequests: true,
    hasCustomers: true,
    hasFiles: true,
    hasTeam: true,
    hasAccount: false,
  });
  assert.equal(superAdminLayout.showFinanceBanner, true);
  assert.equal(superAdminLayout.showRequestsPrimary, true);
  assert.deepEqual(superAdminLayout.sideCards, ['customers', 'files']);
  assert.deepEqual(superAdminLayout.bottomCards, ['team']);

  const clientLayout = resolveHomeLayout({
    hasFinance: true,
    hasRequests: true,
    hasCustomers: false,
    hasFiles: true,
    hasTeam: false,
    hasAccount: true,
  });
  assert.equal(clientLayout.showFinanceBanner, true);
  assert.deepEqual(clientLayout.sideCards, ['files', 'account']);
  assert.deepEqual(clientLayout.bottomCards, []);

  const minimalEmployeeLayout = resolveHomeLayout({
    hasFinance: false,
    hasRequests: false,
    hasCustomers: true,
    hasFiles: false,
    hasTeam: false,
    hasAccount: true,
  });
  assert.equal(minimalEmployeeLayout.showRequestsPrimary, false);
  assert.deepEqual(minimalEmployeeLayout.sideCards, []);
  assert.deepEqual(minimalEmployeeLayout.bottomCards, ['customers', 'account']);
});

test('resolveSmartHomePlan surfaces all authorized modules in dock for Super administrador', () => {
  const plan = resolveSmartHomePlan(
    makeContext('owner', [
      'cash.read',
      'cash.read_all',
      'requests.read',
      'customers.read',
      'rural.read',
      'files.read',
      'documents.read',
      'services.read',
      'users.manage',
      'settings.access',
      'categories.manage',
      'access.manage',
      'payments.providers.manage',
      'audit.read',
      'archives.manage',
    ]),
    false,
  );
  assert.equal(plan.financeMode?.kind, 'cash_all');
  assert.equal(plan.showRequestsPrimary, true);
  assert.equal(plan.hasRural, true);
  assert.equal(plan.settingsDescription, 'Gestão de categorias, acessos, pagamentos e privacidade');
  assert.deepEqual(plan.sideCards, ['customers', 'files']);
  assert.deepEqual(plan.bottomCards, [
    'documents',
    'services',
    'team',
    'settings',
    'audit',
    'archives',
  ]);
  assert.deepEqual(plan.adaptiveGridCards, []);
});

test('resolveSmartHomePlan adapts intelligently for Administrador without users.manage', () => {
  const plan = resolveSmartHomePlan(
    makeContext('admin', [
      'cash.read',
      'requests.read',
      'customers.read',
      'files.read',
      'documents.read',
      'settings.access',
    ]),
    false,
  );
  assert.equal(plan.financeMode?.kind, 'cash_own');
  assert.equal(plan.showRequestsPrimary, true);
  assert.deepEqual(plan.sideCards, ['customers', 'files']);
  assert.deepEqual(plan.bottomCards, ['documents', 'settings']);
});

test('resolveSmartHomePlan reacts to every added or removed permission for Funcionário', () => {
  const requestsOnly = resolveSmartHomePlan(
    makeContext('employee', ['requests.read']),
    false,
  );
  assert.equal(requestsOnly.financeMode, null);
  assert.equal(requestsOnly.showRequestsPrimary, true);
  assert.deepEqual(requestsOnly.sideCards, ['notifications', 'account']);
  assert.deepEqual(requestsOnly.bottomCards, []);

  const withCustomers = resolveSmartHomePlan(
    makeContext('employee', ['requests.read', 'customers.read']),
    false,
  );
  assert.deepEqual(withCustomers.sideCards, ['customers', 'account']);
  assert.deepEqual(withCustomers.bottomCards, []);

  const withFilesAndServices = resolveSmartHomePlan(
    makeContext('employee', ['requests.read', 'customers.read', 'files.read', 'services.read']),
    false,
  );
  assert.deepEqual(withFilesAndServices.sideCards, ['customers', 'files']);
  assert.deepEqual(withFilesAndServices.bottomCards, ['services']);

  const withTemplatesAndAudit = resolveSmartHomePlan(
    makeContext('employee', [
      'requests.read',
      'customers.read',
      'files.read',
      'services.read',
      'templates.read',
      'audit.read',
    ]),
    false,
  );
  assert.deepEqual(withTemplatesAndAudit.sideCards, ['customers', 'files']);
  assert.deepEqual(withTemplatesAndAudit.bottomCards, ['documents', 'services', 'audit']);

  // Removing services.read immediately drops services from bottomCards
  const afterRemovingServices = resolveSmartHomePlan(
    makeContext('employee', [
      'requests.read',
      'customers.read',
      'files.read',
      'templates.read',
      'audit.read',
    ]),
    false,
  );
  assert.deepEqual(afterRemovingServices.bottomCards, ['documents', 'audit']);
});

test('resolveSmartHomePlan adapts for Funcionário with only Documentos and Serviços (no requests/cash)', () => {
  const plan = resolveSmartHomePlan(
    makeContext('employee', ['templates.read', 'services.read']),
    false,
  );
  assert.equal(plan.financeMode, null);
  assert.equal(plan.showRequestsPrimary, false);
  assert.equal(plan.servicesLabel, 'Serviços');
  assert.deepEqual(plan.adaptiveGridCards, ['documents', 'services', 'notifications', 'account']);
  assert.deepEqual(plan.bottomCards, []);
});

test('resolveSmartHomePlan overflows extra modules into bottom dock when no requests.read', () => {
  const plan = resolveSmartHomePlan(
    makeContext('admin', [
      'cash.read',
      'customers.read',
      'templates.read',
      'services.read',
      'users.manage',
      'settings.access',
      'audit.read',
      'archives.manage',
    ]),
    false,
  );
  assert.equal(plan.financeMode?.kind, 'cash_own');
  assert.equal(plan.showRequestsPrimary, false);
  assert.deepEqual(plan.adaptiveGridCards, ['customers', 'documents', 'services', 'team']);
  assert.deepEqual(plan.bottomCards, ['settings', 'audit', 'archives']);
});

test('resolveSmartHomePlan adapts for Funcionário with only Caixa individual and Clientes', () => {
  const plan = resolveSmartHomePlan(
    makeContext('employee', ['cash.read', 'customers.read']),
    false,
  );
  assert.equal(plan.financeMode?.kind, 'cash_own');
  assert.equal(plan.showRequestsPrimary, false);
  assert.deepEqual(plan.adaptiveGridCards, ['customers', 'notifications']);
  assert.deepEqual(plan.bottomCards, ['account']);
});

test('resolveSmartHomePlan balances 2x2 adaptive grid for Funcionário with Caixa, Documentos and Serviços', () => {
  const plan = resolveSmartHomePlan(
    makeContext('employee', ['cash.read', 'templates.read', 'services.read']),
    false,
  );
  assert.equal(plan.financeMode?.kind, 'cash_own');
  assert.equal(plan.showRequestsPrimary, false);
  assert.deepEqual(plan.adaptiveGridCards, ['documents', 'services', 'notifications', 'account']);
  assert.deepEqual(plan.bottomCards, []);
});

test('resolveSmartHomePlan adapts for Funcionário with only Solicitações and Checklist', () => {
  const plan = resolveSmartHomePlan(
    makeContext('employee', ['requests.read', 'checklists.read']),
    false,
  );
  assert.equal(plan.financeMode, null);
  assert.equal(plan.showRequestsPrimary, true);
  assert.equal(plan.servicesLabel, 'Checklist');
  assert.deepEqual(plan.sideCards, ['services', 'account']);
  assert.deepEqual(plan.bottomCards, []);
});

test('resolveSmartHomePlan adapts for Cliente with Meus pagamentos, Minhas solicitações, Anexos, Documentos and Conta', () => {
  const plan = resolveSmartHomePlan(makeContext('client', []), true);
  assert.equal(plan.financeMode?.kind, 'client_payments');
  assert.equal(plan.showRequestsPrimary, true);
  assert.deepEqual(plan.sideCards, ['files', 'documents']);
  assert.deepEqual(plan.bottomCards, ['account']);
});

