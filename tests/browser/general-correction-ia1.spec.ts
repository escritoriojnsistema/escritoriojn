import { test, expect, type Page } from '@playwright/test';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Local fictitious contracts.');

const ART = '.aistudio/artifacts/brain/8f1da76b-bc17-4df7-98c6-a74e231bd390/.tempmediaStorage';
const OFFICE_A = '11111111-1111-4111-8111-111111111111';
const OFFICE_B = '11111111-1111-4111-8111-222222222222';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_USER_ID = '22222222-2222-4222-8222-999999999999';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const CHARGE_ID = '44444444-4444-4444-8444-444444444444';
const APPROVAL_ID = '55555555-5555-4555-8555-555555555555';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';
const UNIT_ID = '88888888-8888-4888-8888-888888888888';
const CASH_ACCOUNT_ID = '99999999-9999-4999-8999-999999999999';
const BANK_ACCOUNT_ID = '99999999-9999-4999-8999-888888888888';
const INACTIVE_ACCOUNT_ID = '99999999-9999-4999-8999-777777777777';
const METHOD_CASH_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const METHOD_PIX_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-bbbbbbbbbbbb';
const METHOD_CARD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-cccccccccccc';
const METHOD_TRANSFER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-dddddddddddd';
const APPROVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CUSTOMER_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

const OWNER_PERMS = [
  'foundation.access',
  'settings.access',
  'payments.providers.manage',
  'payments.manual.approve',
  'charges.discount.approve',
  'requests.read',
  'requests.read_all',
  'requests.delete',
  'charges.read',
  'charges.create',
  'charges.adjust',
  'cash.read',
  'cash.open',
  'cash.manage',
  'cash.read_all',
];

async function mockAuth(
  page: Page,
  role: 'owner' | 'admin' | 'employee' | 'client',
  permissions: string[],
  options: { multiOffice?: boolean } = {},
) {
  const token = `e30.${Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      session_id: OFFICE_A,
    }),
  ).toString('base64url')}.fixture`;

  await page.addInitScript(
    ({ token, user, portal }) => {
      localStorage.setItem(
        'sb-team-ui-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} },
        }),
      );
      localStorage.setItem('jn:portal', JSON.stringify({ portal, revision: 1 }));
    },
    { token, user: USER_ID, portal: role === 'client' ? 'client' : 'team' },
  );

  const contexts = [
    {
      office_id: OFFICE_A,
      user_id: USER_ID,
      office_name: 'Escritório JN Matriz',
      display_name:
        role === 'client'
          ? 'Produtor Rural Cliente'
          : role === 'owner'
            ? 'Super Admin JN'
            : role === 'admin'
              ? 'Admin Financeiro'
              : 'Atendente Balcão',
      role_code: role,
      permissions: role === 'client' ? [] : permissions,
    },
  ];
  if (options.multiOffice && role !== 'client') {
    contexts.push({
      office_id: OFFICE_B,
      user_id: USER_ID,
      office_name: 'Escritório JN Filial',
      display_name: 'Super Admin Filial',
      role_code: role,
      permissions,
    });
  }

  await page.route('https://team-ui.supabase.co/**', (r) => r.fulfill({ json: { id: USER_ID, aud: 'authenticated' } }));
  await page.route('**/api/auth/context', (r) => r.fulfill({ json: { data: { user: { id: USER_ID }, contexts } } }));
  await page.route('**/api/notifications/summary', (r) => r.fulfill({ json: { data: { unread: 0 } } }));
  await page.route('**/api/document-commercial/presence', (r) =>
    r.fulfill({ json: { data: { status: 'offline', capacity: 1, last_seen: null, session_current: false } } }),
  );
}

function makeFullConfig() {
  return {
    units: [{ id: UNIT_ID, name: 'Unidade Sede', active: true, version: 1 }],
    accounts: [
      { id: CASH_ACCOUNT_ID, unit_id: UNIT_ID, name: 'Caixa Espécie 01', type: 'cash', active: true, version: 1 },
      { id: BANK_ACCOUNT_ID, unit_id: UNIT_ID, name: 'Conta Bancária PJ', type: 'bank', active: true, version: 1 },
      { id: INACTIVE_ACCOUNT_ID, unit_id: UNIT_ID, name: 'Conta Desativada', type: 'digital', active: false, version: 2 },
    ],
    payment_methods: [
      { id: METHOD_CASH_ID, unit_id: UNIT_ID, destination_account_id: CASH_ACCOUNT_ID, name: 'Dinheiro', type: 'cash', active: true, version: 1 },
      { id: METHOD_PIX_ID, unit_id: UNIT_ID, destination_account_id: BANK_ACCOUNT_ID, name: 'Pix Manual', type: 'pix', active: true, version: 1 },
      { id: METHOD_CARD_ID, unit_id: UNIT_ID, destination_account_id: BANK_ACCOUNT_ID, name: 'Maquininha Avulsa', type: 'card', active: true, version: 1 },
      { id: METHOD_TRANSFER_ID, unit_id: UNIT_ID, destination_account_id: BANK_ACCOUNT_ID, name: 'Transferência TED', type: 'transfer', active: true, version: 1 },
    ],
    units_total: 1,
    accounts_total: 3,
    payment_methods_total: 4,
    page: 1,
    page_size: 50,
    unit_id: null,
  };
}

function makeOpenSession() {
  return {
    id: SESSION_ID,
    unit_id: UNIT_ID,
    unit_name: 'Unidade Sede',
    cash_account_id: CASH_ACCOUNT_ID,
    account_name: 'Caixa Espécie 01',
    operator_name: 'Super Admin JN',
    is_self: true,
    status: 'open',
    opened_at: '2026-11-22T08:00:00Z',
    opening_cents: 10000,
    numerario_cents: 10000,
    received_cents: 0,
  };
}

function makeStatement() {
  return {
    session: {
      id: SESSION_ID,
      cash_account_id: CASH_ACCOUNT_ID,
      unit_id: UNIT_ID,
      unit_name: 'Unidade Sede',
      operator_name: 'Super Admin JN',
      is_self: true,
      status: 'open',
      version: 1,
      opened_at: '2026-11-22T08:00:00Z',
      closed_at: null,
      opening_cents: 10000,
      cash_cents: 10000,
      received_cents: 0,
      refunded_cents: 0,
      digital_cents: 0,
      can_operate: true,
      can_refund: true,
    },
    entries: [],
    total: 0,
    page: 1,
    page_size: 5,
    can_receive: true,
  };
}

async function mockRequestAndChargeRoutes(page: Page, origin: 'portal' | 'presencial' | 'whatsapp' = 'portal') {
  await page.route('**/api/requests/search', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              id: REQUEST_ID,
              protocol: 'JN-2026-000101',
              title: 'Regularização CAR',
              status: 'em_atendimento',
              public_status: 'em_andamento',
              priority: 'normal',
              origin,
              customer_name: 'Maria Produtora Rural',
              assignee_name: 'Outro Atendente',
              category_name: 'Imóvel Rural',
              updated_at: '2026-11-22T09:00:00Z',
              created_at: '2026-11-22T08:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 5,
          portal: false,
          can_create: true,
        },
      },
    }),
  );

  await page.route(`**/api/requests/${REQUEST_ID}/detail`, (r) =>
    r.fulfill({
      json: {
        data: {
          id: REQUEST_ID,
          office_id: OFFICE_A,
          protocol: 'JN-2026-000101',
          title: 'Regularização CAR',
          status: 'em_atendimento',
          public_status: 'em_andamento',
          version: 2,
          origin,
          priority: 'normal',
          priority_reason: null,
          portal: false,
          category_name: 'Imóvel Rural',
          customer_id: CUSTOMER_ID,
          customer_name: 'Maria Produtora Rural',
          assignee_id: OTHER_USER_ID,
          assignee_name: 'Outro Atendente',
          created_by_name: origin === 'portal' ? 'Maria Produtora Rural' : 'Outro Atendente',
          following_only: false,
          message: 'Atendimento aberto para regularização.',
          items: [],
          history: [],
          history_page: 1,
          history_total: 0,
          can_update: true,
          can_cancel: false,
          can_transfer: false,
          can_reclaim: false,
          created_at: '2026-11-22T08:00:00Z',
          updated_at: '2026-11-22T09:00:00Z',
        },
      },
    }),
  );

  await page.route(`**/api/request-deletion/${REQUEST_ID}/eligibility`, (r) =>
    r.fulfill({
      json: {
        data: {
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000101',
          title: 'Regularização CAR',
          version: 2,
          status: 'em_atendimento',
          actor_kind: 'team',
          can_show_action: false,
          eligible: false,
          backend_ready: true,
          block_code: null,
          block_message: null,
          recommended_alternatives: [],
          attachments: { exclusive_count: 0, shared_preserved_count: 0, retained_preserved_count: 0, total_count: 0 },
          notify_client_on_delete: true,
        },
      },
    }),
  );

  await page.route('**/api/charges/view', (r) =>
    r.fulfill({
      json: {
        data: {
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000101',
          following_only: false,
          can_create: false,
          items: [
            {
              request_item_id: METHOD_CASH_ID,
              name: 'Regularização CAR',
              quantity: 1,
              unit_price_cents: 25000,
              total_cents: 25000,
              adjustment: { kind: 'none', reason: '' },
            },
          ],
          charge: {
            id: CHARGE_ID,
            version: 3,
            status: 'aberta',
            due_cents: 25000,
            allocated_cents: 5000,
            balance_cents: 20000,
            can_adjust: false,
            can_discount: false,
            can_cancel: false,
            installments: [{ number: 1, due_date: '2026-12-10', amount_cents: 25000 }],
            history: [],
            history_total: 0,
          },
        },
      },
    }),
  );
}

test('Cenários 1, 9 e 14 (Desktop & Mobile): Super admin informa pagamento manual diretamente em solicitação criada por outro usuário (Dinheiro com troco, Pix, Cartão, Transferência)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'owner', OWNER_PERMS);
  await mockRequestAndChargeRoutes(page, 'portal');

  await page.route('**/api/cash/configuration', (r) => r.fulfill({ json: { data: makeFullConfig() } }));
  await page.route('**/api/cash/dashboard', (r) =>
    r.fulfill({
      json: {
        data: {
          sessions: [makeOpenSession()],
          total: 1,
          page: 1,
          page_size: 5,
          scope: 'own',
          can_open: true,
          can_manage: true,
          can_read_all: true,
        },
      },
    }),
  );
  await page.route('**/api/cash/statement', (r) => r.fulfill({ json: { data: makeStatement() } }));

  const recordedBodies: Array<{ office_id: string; operation: Record<string, unknown> }> = [];
  await page.route('**/api/cash/payment', async (r) => {
    const body = r.request().postDataJSON() as { office_id: string; operation: Record<string, unknown> };
    recordedBodies.push(body);
    await r.fulfill({
      status: 200,
      json: { data: makeStatement() },
    });
  });

  await page.goto('/solicitacoes');
  await page.getByRole('button', { name: /Ver solicitação JN-2026-000101/i }).click();

  const trigger = page.getByRole('button', { name: 'Informar pagamento manualmente', exact: true });
  await expect(trigger).toBeVisible();
  await trigger.click();

  // Pré-seleciona cobrança e exibe saldo oficial R$ 200,00
  await expect(page.getByText('JN-2026-000101').first()).toBeVisible();
  await expect(page.getByText(/200,00/).first()).toBeVisible();

  // Seleciona Dinheiro -> exibe cálculo de troco
  const methodSelect = page.getByLabel(/Forma de pagamento/i);
  await methodSelect.selectOption(METHOD_CASH_ID);
  await expect(page.getByText(/Entra no saldo físico/i)).toBeVisible();
  await page.getByLabel(/Valor apresentado em dinheiro/i).fill('250,00');
  await expect(page.getByText(/Troco calculado/i)).toContainText('50,00');

  // Confirma que Pix, Maquininha Avulsa e Transferência também estão disponíveis
  await methodSelect.selectOption(METHOD_PIX_ID);
  await expect(page.getByText(/Registro manual após conferência real/i)).toBeVisible();
  await methodSelect.selectOption(METHOD_CARD_ID);
  await expect(page.getByText(/Taxas de cartão permanecem separadas/i)).toBeVisible();
  await methodSelect.selectOption(METHOD_TRANSFER_ID);
  await expect(page.getByText(/depósito ou transferência/i)).toBeVisible();

  // Preenche evidência e seleciona Pix Manual
  await methodSelect.selectOption(METHOD_PIX_ID);
  await page.getByLabel(/Observação \/ evidência da conferência manual/i).fill('Pix conferido no extrato oficial da conta PJ.');

  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/ia1-manual-payment-direct-desktop.png`, fullPage: true });
  }

  await page.getByRole('button', { name: 'Confirmar pagamento manual', exact: true }).click();
  await expect(page.getByText(/Pagamento manual de R\$.*200,00 confirmado para JN-2026-000101/i)).toBeVisible();

  expect(recordedBodies.length).toBe(1);
  const op = recordedBodies[0].operation;
  expect(op.kind).toBe('record');
  expect(op.status).toBe('confirmed');
  expect(op.payment_method_id).toBe(METHOD_PIX_ID);
  expect(typeof op.idempotency_key).toBe('string');

  // Mobile 390x844 sem overflow
  await page.setViewportSize({ width: 390, height: 844 });
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);
  expect(await page.locator('.operation-mobile-nav a').count()).toBeLessThanOrEqual(4);
  expect(await page.locator('[role="progressbar"],.spinner,.loading-overlay').count()).toBe(0);
  expect(errors).toEqual([]);
});

test('Cenários 2, 3 e 4: Admin sem payments.manual.approve solicita autorização com aprovador elegível e nunca vê confirmação direta', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'admin', ['foundation.access', 'requests.read', 'charges.read', 'cash.read', 'cash.open']);
  await mockRequestAndChargeRoutes(page, 'whatsapp');

  await page.route('**/api/cash/configuration', (r) => r.fulfill({ json: { data: makeFullConfig() } }));
  await page.route('**/api/cash/dashboard', (r) =>
    r.fulfill({
      json: {
        data: {
          sessions: [makeOpenSession()],
          total: 1,
          page: 1,
          page_size: 5,
          scope: 'own',
          can_open: true,
          can_manage: false,
          can_read_all: false,
        },
      },
    }),
  );
  await page.route('**/api/cash/statement', (r) => r.fulfill({ json: { data: makeStatement() } }));
  await page.route('**/api/payment-providers/state', (r) =>
    r.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN', message: 'Sem permissão' } } }),
  );
  await page.route('**/api/financial-approvals/approvers', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              membership_id: UNIT_ID,
              user_id: APPROVER_ID,
              name: 'Super Admin JN',
              role_code: 'owner',
              role_label: 'Super administrador',
            },
          ],
          backend_ready: true,
        },
      },
    }),
  );

  let approvalRequested = false;
  await page.route('**/api/financial-approvals/manual-payment/request', async (r) => {
    approvalRequested = true;
    await r.fulfill({
      status: 201,
      json: {
        data: {
          id: APPROVAL_ID,
          status: 'pending',
        },
      },
    });
  });

  await page.goto('/cobrancas');
  await page.getByRole('button', { name: /JN-2026-000101|Selecionar/i }).first().click();
  const manualRegion = page.getByRole('region', { name: /Pagamento manual da solicitação/i });
  await manualRegion.getByRole('button', { name: 'Informar pagamento manualmente', exact: true }).click();

  // Não deve exibir confirmação direta
  await expect(manualRegion.getByRole('button', { name: 'Confirmar pagamento manual', exact: true })).toHaveCount(0);
  await manualRegion.getByRole('button', { name: 'Solicitar autorização', exact: true }).click();
  await expect(manualRegion.getByRole('combobox', { name: /Aprovador autorizado do escritório/i })).toBeVisible();

  await manualRegion
    .getByLabel(/Observação \/ evidência da conferência realizada/i)
    .fill('Cliente pagou via Pix no atendimento WhatsApp');
  await manualRegion.getByRole('button', { name: 'Solicitar autorização', exact: true }).click();
  await expect(manualRegion.getByText(/Solicitação de autorização de pagamento manual enviada/i)).toBeVisible();
  expect(approvalRequested).toBe(true);
  expect(errors).toEqual([]);
});

test('Cenários 5 e 6 (Desktop & Mobile): Caixa não configurado exibe mensagem exata + fluxo completo de configuração inicial (unidade -> contas -> formas -> abertura)', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'owner', OWNER_PERMS);
  await mockRequestAndChargeRoutes(page, 'presencial');

  const state = {
    units: [] as Array<{ id: string; name: string; active: boolean; version: number }>,
    accounts: [] as Array<{ id: string; unit_id: string; name: string; type: 'cash' | 'bank' | 'digital'; active: boolean; version: number }>,
    payment_methods: [] as Array<{
      id: string;
      unit_id: string;
      destination_account_id: string;
      name: string;
      type: 'cash' | 'pix' | 'card' | 'transfer';
      active: boolean;
      version: number;
    }>,
    sessions: [] as Array<ReturnType<typeof makeOpenSession>>,
  };

  const configSnapshot = () => ({
    units: state.units,
    accounts: state.accounts,
    payment_methods: state.payment_methods,
    units_total: state.units.length,
    accounts_total: state.accounts.length,
    payment_methods_total: state.payment_methods.length,
    page: 1,
    page_size: 50,
    unit_id: null,
  });

  const dashboardSnapshot = () => ({
    sessions: state.sessions,
    total: state.sessions.length,
    page: 1,
    page_size: 5,
    scope: 'own',
    can_open: true,
    can_manage: true,
    can_read_all: true,
  });

  await page.route('**/api/cash/configuration', (r) => r.fulfill({ json: { data: configSnapshot() } }));
  await page.route('**/api/cash/dashboard', (r) => r.fulfill({ json: { data: dashboardSnapshot() } }));
  await page.route('**/api/cash/dashboard-filtered', (r) => r.fulfill({ json: { data: dashboardSnapshot() } }));
  await page.route('**/api/cash/configure', async (r) => {
    const body = r.request().postDataJSON() as {
      configuration: {
        kind: 'unit' | 'account' | 'payment_method';
        name: string;
        active: boolean;
        unit_id?: string;
        type?: string;
        destination_account_id?: string;
      };
    };
    const cfg = body.configuration;
    let resource: unknown;
    if (cfg.kind === 'unit') {
      resource = { id: UNIT_ID, name: cfg.name, active: cfg.active, version: 1 };
      state.units.push(resource as (typeof state.units)[number]);
    } else if (cfg.kind === 'account') {
      const id = cfg.type === 'cash' ? CASH_ACCOUNT_ID : BANK_ACCOUNT_ID;
      resource = { id, unit_id: cfg.unit_id!, name: cfg.name, type: cfg.type as 'cash' | 'bank' | 'digital', active: cfg.active, version: 1 };
      state.accounts.push(resource as (typeof state.accounts)[number]);
    } else {
      resource = {
        id: METHOD_CASH_ID,
        unit_id: cfg.unit_id!,
        destination_account_id: cfg.destination_account_id!,
        name: cfg.name,
        type: cfg.type as 'cash' | 'pix' | 'card' | 'transfer',
        active: cfg.active,
        version: 1,
      };
      state.payment_methods.push(resource as (typeof state.payment_methods)[number]);
    }
    await r.fulfill({ status: 200, json: { data: { resource, configuration: configSnapshot() } } });
  });
  await page.route('**/api/cash/open', async (r) => {
    state.sessions.push(makeOpenSession());
    await r.fulfill({ status: 200, json: { data: dashboardSnapshot() } });
  });
  await page.route('**/api/cash/statement', (r) => r.fulfill({ json: { data: makeStatement() } }));

  // 1. Abre solicitação sem caixa configurado -> vê mensagem EXATA + CTA Configurar financeiro
  await page.goto('/solicitacoes');
  await page.getByRole('button', { name: /Ver solicitação JN-2026-000101/i }).click();
  await page.getByRole('button', { name: 'Informar pagamento manualmente', exact: true }).click();
  await expect(
    page.getByText(
      'Para informar pagamentos, configure uma unidade financeira, uma conta de destino e uma forma de pagamento. Depois, abra seu Caixa.',
    ),
  ).toBeVisible();

  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/ia1-unconfigured-guidance-desktop.png`, fullPage: true });
  }

  // 2. Clica em Configurar financeiro -> vai para /caixa aba Configuração com banner de retorno
  await page.getByRole('button', { name: 'Configurar financeiro', exact: true }).click();
  await expect(page.getByText(/Configuração incompleta/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Voltar para/i })).toBeVisible();

  // Botões sempre visíveis sem precisar abrir <details>
  await expect(page.getByRole('button', { name: 'Adicionar unidade', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar conta', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Adicionar forma', exact: true })).toBeVisible();

  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/ia1-cash-config-guided-desktop.png`, fullPage: true });
  }

  // Passo 1: Criar unidade financeira
  await page.getByRole('button', { name: 'Adicionar unidade', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Unidade Sede');
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();
  await expect(page.getByText(/Unidade financeira: cadastrada/i)).toBeVisible();

  // Passo 2: Criar conta em espécie
  await page.getByRole('button', { name: 'Adicionar conta', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Caixa Espécie 01');
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('cash');
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();

  // Passo 3: Criar forma de pagamento em Dinheiro
  await page.getByRole('button', { name: 'Adicionar forma', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome', exact: true }).fill('Dinheiro');
  await page.getByRole('combobox', { name: 'Tipo', exact: true }).selectOption('cash');
  await page.getByRole('combobox', { name: 'Conta de destino', exact: true }).selectOption(CASH_ACCOUNT_ID);
  await page.getByRole('button', { name: 'Salvar configuração', exact: true }).click();

  // Status evolui para Aguardando abertura do caixa e oferece CTA Ir para abertura do caixa
  await expect(page.getByText(/Aguardando abertura do caixa/i)).toBeVisible();
  await page.getByRole('button', { name: 'Ir para abertura do caixa', exact: true }).click();

  // Passo 4: Abrir caixa
  await page.getByRole('textbox', { name: /Fundo inicial/i }).fill('100,00');
  await page.getByRole('button', { name: 'Abrir meu caixa', exact: true }).click();
  await expect(page.getByText(/Caixa aberto/i).first()).toBeVisible();

  // Mobile check
  await page.setViewportSize({ width: 390, height: 844 });
  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/ia1-cash-opened-mobile.png`, fullPage: true });
  }
  const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
  expect(noOverflow).toBe(true);
  expect(errors).toEqual([]);
});

test('Cenário 7: Configurações da Conta pessoal (equipe multi-escritório com edição + cliente em leitura protegida)', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'owner', OWNER_PERMS, { multiOffice: true });

  await page.route('**/api/account/read', async (r) => {
    const body = r.request().postDataJSON() as { office_id: string };
    await r.fulfill({
      json: {
        data: {
          name: body.office_id === OFFICE_A ? 'Super Admin JN' : 'Super Admin Filial',
          cpf: '12345678901',
          cpf_masked: '***.456.789-**',
          email: body.office_id === OFFICE_A ? 'matriz@escritoriojn.com' : 'filial@escritoriojn.com',
          pending_email: null,
          version: 'v1',
          correction_request_id: null,
        },
      },
    });
  });

  await page.goto('/conta');
  const officeSelect = page.getByRole('combobox', { name: 'Escritório', exact: true });
  await expect(officeSelect).toBeVisible();
  await expect(page.getByRole('textbox', { name: /Nome completo/i })).toHaveValue('Super Admin JN');

  await officeSelect.selectOption(OFFICE_B);
  await expect(page.getByRole('textbox', { name: /Nome completo/i })).toHaveValue('Super Admin Filial');

  // Portal do cliente (/minha-conta)
  const clientCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const clientPage = await clientCtx.newPage();
  clientPage.on('pageerror', (err) => errors.push(err.message));
  await mockAuth(clientPage, 'client', []);
  await clientPage.route('**/api/account/read', (r) =>
    r.fulfill({
      json: {
        data: {
          name: 'Produtor Rural Cliente',
          cpf: null,
          cpf_masked: '***.111.222-**',
          email: 'cliente@fazenda.com',
          pending_email: null,
          version: 'v1',
          correction_request_id: null,
        },
      },
    }),
  );

  await clientPage.goto('/minha-conta');
  await expect(clientPage.getByText('Produtor Rural Cliente').first()).toBeVisible();
  await expect(clientPage.getByRole('link', { name: /Solicitar correção/i })).toBeVisible();
  await clientCtx.close();
  expect(errors).toEqual([]);
});

test('Cenários 8 e 11: Bancos e Pagamentos carrega múltiplas páginas de contas (>50), exclui inativas/espécie, exibe erro 503 com retry e link criar conta quando vazio', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'owner', OWNER_PERMS);

  let mode: 'error503' | 'empty' | 'multipage' = 'error503';

  await page.route('**/api/payment-providers/state', (r) =>
    r.fulfill({
      json: {
        data: {
          office_id: OFFICE_A,
          backend_ready: true,
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
          diagnostics: [],
          pending_reconciliations_count: 0,
          catalog: [
            {
              provider_code: 'generic_pix_bank',
              display_name: 'Banco Cooperativo Pix',
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
              notes: 'Integração Pix oficial.',
            },
          ],
        },
      },
    }),
  );

  await page.route('**/api/cash/configuration', async (r) => {
    const body = r.request().postDataJSON() as { page?: number };
    if (mode === 'error503') {
      await r.fulfill({
        status: 503,
        json: { error: { code: 'UNAVAILABLE', message: 'Serviço financeiro temporariamente indisponível.' } },
      });
      return;
    }
    if (mode === 'empty') {
      await r.fulfill({
        json: {
          data: {
            units: [{ id: UNIT_ID, name: 'Unidade Sede', active: true, version: 1 }],
            accounts: [
              { id: CASH_ACCOUNT_ID, unit_id: UNIT_ID, name: 'Caixa Espécie 01', type: 'cash', active: true, version: 1 },
            ],
            payment_methods: [],
            units_total: 1,
            accounts_total: 1,
            payment_methods_total: 0,
            page: 1,
            page_size: 50,
            unit_id: null,
          },
        },
      });
      return;
    }
    if ((body.page ?? 1) === 1) {
      const page1Accounts = Array.from({ length: 50 }, (_, idx) => ({
        id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
        unit_id: UNIT_ID,
        name: `Conta Ativa ${idx + 1}`,
        type: 'bank',
        active: true,
        version: 1,
      }));
      await r.fulfill({
        json: {
          data: {
            units: [{ id: UNIT_ID, name: 'Unidade Sede', active: true, version: 1 }],
            accounts: page1Accounts,
            payment_methods: [],
            units_total: 1,
            accounts_total: 52,
            payment_methods_total: 0,
            page: 1,
            page_size: 50,
            unit_id: null,
          },
        },
      });
      return;
    }
    await r.fulfill({
      json: {
        data: {
          units: [],
          accounts: [
            { id: BANK_ACCOUNT_ID, unit_id: UNIT_ID, name: 'Conta Bancária Página 2', type: 'bank', active: true, version: 1 },
            { id: INACTIVE_ACCOUNT_ID, unit_id: UNIT_ID, name: 'Conta Inativa Oculta', type: 'digital', active: false, version: 1 },
          ],
          payment_methods: [],
          units_total: 1,
          accounts_total: 52,
          payment_methods_total: 0,
          page: 2,
          page_size: 50,
          unit_id: null,
        },
      },
    });
  });

  // 1. Erro 503 exibe alerta explícito com Tentar novamente (NUNCA lista vazia falsa)
  await page.goto('/configuracoes/bancos-pagamentos');
  const retryBtn = page.getByRole('button', { name: 'Tentar novamente', exact: true });
  await expect(retryBtn).toBeVisible();

  // 2. Lista vazia real (somente conta espécie) -> informa exclusão + oferece link Criar ou gerenciar contas no Caixa
  mode = 'empty';
  await retryBtn.click();
  await expect(page.locator('p.customer-note', { hasText: /Nenhuma conta bancária ou digital ativa/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Criar ou gerenciar contas no Caixa/i })).toBeVisible();

  // 3. Multi-página (>50 contas) -> carrega Conta Bancária Página 2 e oculta Conta Inativa Oculta
  mode = 'multipage';
  await page.getByRole('button', { name: 'Atualizar contas financeiras', exact: true }).click();
  const accountSelect = page.getByLabel(/Conta recebedora vinculada/i);
  await expect(accountSelect.locator('option', { hasText: 'Conta Bancária Página 2' })).toHaveCount(1);
  await expect(accountSelect.locator('option', { hasText: 'Conta Inativa Oculta' })).toHaveCount(0);

  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/ia1-providers-multipage-desktop.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('Cenário 10: Central de Autorizações exibe botão Abrir meu caixa quando pagamento aprovado exige abertura de caixa', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'employee', ['foundation.access', 'requests.read', 'charges.read', 'cash.read', 'cash.open']);

  await page.route('**/api/cash/configuration', (r) => r.fulfill({ json: { data: makeFullConfig() } }));
  await page.route('**/api/cash/dashboard', (r) =>
    r.fulfill({
      json: {
        data: {
          sessions: [],
          total: 0,
          page: 1,
          page_size: 5,
          scope: 'own',
          can_open: true,
          can_manage: false,
          can_read_all: false,
        },
      },
    }),
  );
  await page.route('**/api/financial-approvals/list', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              id: APPROVAL_ID,
              office_id: OFFICE_A,
              kind: 'manual_payment',
              status: 'approved',
              charge_id: CHARGE_ID,
              charge_version_snapshot: 3,
              request_id: REQUEST_ID,
              protocol: 'JN-2026-000101',
              customer_name: 'Maria Produtora Rural',
              service_summary: 'Regularização CAR',
              requester_user_id: USER_ID,
              requester_name: 'Atendente Balcão',
              approver_user_id: APPROVER_ID,
              approver_name: 'Super Admin JN',
              original_cents: 25000,
              requested_amount_cents: 20000,
              discount_cents: null,
              discount_percent: null,
              final_cents: 20000,
              card_fee_cents: 0,
              payment_method_id: METHOD_PIX_ID,
              payment_method_name: 'Pix Manual',
              session_id: SESSION_ID,
              unit_id: UNIT_ID,
              unit_name: 'Unidade Sede',
              destination_account_id: BANK_ACCOUNT_ID,
              destination_account_name: 'Conta Bancária PJ',
              operation_date: '2026-11-22',
              external_reference: 'E2E-2026-001',
              justification: 'Pix confirmado no extrato',
              decision_note: 'Aprovado',
              created_at: '2026-11-22T09:00:00Z',
              expires_at: '2026-11-23T09:00:00Z',
              decided_at: '2026-11-22T09:10:00Z',
              executed_at: null,
              can_decide: false,
              can_execute: true,
              invalidation_reason: null,
            },
          ],
          total: 1,
          page: 1,
          page_size: 5,
          backend_ready: true,
        },
      },
    }),
  );

  await page.goto('/caixa');
  await page.getByRole('tab', { name: /Autorizações/i }).click();
  await expect(page.getByText('JN-2026-000101')).toBeVisible();
  const openCashCta = page.getByRole('button', { name: 'Abrir meu caixa', exact: true });
  await expect(openCashCta).toBeVisible();
  await openCashCta.click();
  await expect(page.getByRole('form', { name: /Abrir caixa individual/i })).toBeVisible();
  expect(errors).toEqual([]);
});
