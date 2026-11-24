import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import type { AccessContext } from '../shared/access.js';
import type { CashConfiguration, CashSession } from '../shared/cash.js';
import {
  MANUAL_PAYMENT_OPEN_CASH_GUIDANCE,
  MANUAL_PAYMENT_SETUP_GUIDANCE,
  evaluateCashSetupReadiness,
  evaluateManualPaymentAuthority,
  filterCompatibleUnitMethods,
  isChargeEligibleForManualPayment,
  loadAllCashConfigurationPagesWithFetcher,
  mergeCashConfigurationPages,
  selectProviderReceivingAccounts,
} from '../shared/manualPaymentFlow.js';

const OFFICE_A = '11111111-1111-4111-8111-111111111111';
const OFFICE_B = '22222222-2222-4222-8222-222222222222';
const USER_ID = '33333333-3333-4333-8333-333333333333';
const UNIT_1 = '44444444-4444-4444-8444-444444444444';
const UNIT_2 = '55555555-5555-4555-8555-555555555555';
const ACC_CASH = '66666666-6666-4666-8666-666666666666';
const ACC_BANK = '77777777-7777-4777-8777-777777777777';
const ACC_DIGITAL_INACTIVE = '88888888-8888-4888-8888-888888888888';
const ACC_BANK_U2 = '99999999-9999-4999-8999-999999999999';
const METHOD_CASH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const METHOD_PIX = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const METHOD_CARD = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const METHOD_INACTIVE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const SESSION_ID = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const APPROVAL_ID = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
const CHARGE_ID = '12121212-1212-4121-8121-121212121212';

function makeContext(
  role: AccessContext['role_code'],
  permissions: string[],
  officeId = OFFICE_A,
): AccessContext {
  return {
    office_id: officeId,
    user_id: USER_ID,
    office_name: officeId === OFFICE_A ? 'Escritório A' : 'Escritório B',
    display_name: 'Integrante Teste',
    role_code: role,
    permissions,
  };
}

function makeConfig(): CashConfiguration {
  return {
    units: [
      { id: UNIT_1, name: 'Unidade Sede', active: true, version: 1 },
      { id: UNIT_2, name: 'Unidade Filial', active: true, version: 1 },
    ],
    accounts: [
      { id: ACC_CASH, unit_id: UNIT_1, name: 'Caixa Espécie 01', type: 'cash', active: true, version: 1 },
      { id: ACC_BANK, unit_id: UNIT_1, name: 'Banco Principal PJ', type: 'bank', active: true, version: 1 },
      { id: ACC_DIGITAL_INACTIVE, unit_id: UNIT_1, name: 'Carteira Antiga', type: 'digital', active: false, version: 2 },
      { id: ACC_BANK_U2, unit_id: UNIT_2, name: 'Banco Filial', type: 'bank', active: true, version: 1 },
    ],
    payment_methods: [
      {
        id: METHOD_CASH,
        unit_id: UNIT_1,
        destination_account_id: ACC_CASH,
        name: 'Dinheiro',
        type: 'cash',
        active: true,
        version: 1,
      },
      {
        id: METHOD_PIX,
        unit_id: UNIT_1,
        destination_account_id: ACC_BANK,
        name: 'Pix Manual',
        type: 'pix',
        active: true,
        version: 1,
      },
      {
        id: METHOD_CARD,
        unit_id: UNIT_1,
        destination_account_id: ACC_BANK,
        name: 'Maquininha Avulsa',
        type: 'card',
        active: true,
        version: 1,
      },
      {
        id: METHOD_INACTIVE,
        unit_id: UNIT_1,
        destination_account_id: ACC_DIGITAL_INACTIVE,
        name: 'Pix Carteira Antiga',
        type: 'pix',
        active: true,
        version: 1,
      },
    ],
    units_total: 2,
    accounts_total: 4,
    payment_methods_total: 4,
    page: 1,
    page_size: 50,
    unit_id: null,
  };
}

function makeOpenSession(overrides: Partial<CashSession> = {}): CashSession {
  return {
    id: SESSION_ID,
    unit_id: UNIT_1,
    unit_name: 'Unidade Sede',
    cash_account_id: ACC_CASH,
    account_name: 'Caixa Espécie 01',
    operator_name: 'Gestor Teste',
    is_self: true,
    status: 'open',
    opened_at: '2026-11-22T08:00:00Z',
    opening_cents: 10000,
    numerario_cents: 10000,
    received_cents: 0,
    ...overrides,
  };
}

test('Fase 2 — RBAC de pagamento manual: owner, admin com/sem permissão, employee, client e isolamento entre escritórios', () => {
  const basePerms = ['requests.read', 'charges.read', 'cash.read', 'cash.open'];

  // Super administrador confirma diretamente
  const ownerAuth = evaluateManualPaymentAuthority(
    makeContext('owner', [...basePerms, 'cash.manage', 'requests.read_all']),
    OFFICE_A,
  );
  assert.equal(ownerAuth.can_access, true);
  assert.equal(ownerAuth.can_confirm_directly, true);
  assert.equal(ownerAuth.requires_approval, false);
  assert.equal(ownerAuth.can_configure_finance, true);
  assert.equal(ownerAuth.has_office_wide_requests, true);

  // Administrador com payments.manual.approve confirma diretamente
  const adminDirect = evaluateManualPaymentAuthority(
    makeContext('admin', [...basePerms, 'payments.manual.approve']),
    OFFICE_A,
  );
  assert.equal(adminDirect.can_access, true);
  assert.equal(adminDirect.can_confirm_directly, true);
  assert.equal(adminDirect.requires_approval, false);

  // Administrador SEM payments.manual.approve exige solicitação de autorização
  const adminApproval = evaluateManualPaymentAuthority(
    makeContext('admin', basePerms),
    OFFICE_A,
  );
  assert.equal(adminApproval.can_access, true);
  assert.equal(adminApproval.can_confirm_directly, false);
  assert.equal(adminApproval.requires_approval, true);

  // Funcionário autorizado (mesmo se listasse payments.manual.approve por engano, employee nunca confirma direto)
  const employee = evaluateManualPaymentAuthority(
    makeContext('employee', [...basePerms, 'payments.manual.approve']),
    OFFICE_A,
  );
  assert.equal(employee.can_access, true);
  assert.equal(employee.can_confirm_directly, false);
  assert.equal(employee.requires_approval, true);

  // Cliente nunca tem acesso
  const client = evaluateManualPaymentAuthority(makeContext('client', []), OFFICE_A);
  assert.equal(client.can_access, false);
  assert.equal(client.can_confirm_directly, false);

  // Isolamento estrito entre escritórios
  const crossOffice = evaluateManualPaymentAuthority(
    makeContext('owner', [...basePerms, 'cash.manage'], OFFICE_B),
    OFFICE_A,
  );
  assert.equal(crossOffice.can_access, false);
  assert.match(crossOffice.denial_reason ?? '', /isolado por escritório/i);

  // Sem cash.open mas com cash.manage vê tela guiada, sem poder confirmar diretamente
  const noCashOpen = evaluateManualPaymentAuthority(
    makeContext('admin', ['requests.read', 'charges.read', 'cash.manage']),
    OFFICE_A,
  );
  assert.equal(noCashOpen.can_access, true);
  assert.equal(noCashOpen.can_confirm_directly, false);
  assert.equal(noCashOpen.can_configure_finance, true);
  assert.ok(noCashOpen.denial_reason);
});

test('Fase 2 & 3 — Elegibilidade de cobrança, filtro de formas compatíveis e prontidão em 5 passos', () => {
  assert.equal(isChargeEligibleForManualPayment({ status: 'open', balance_cents: 15000 }), true);
  assert.equal(isChargeEligibleForManualPayment({ status: 'aberta', balance_cents: 100 }), true);
  assert.equal(isChargeEligibleForManualPayment({ status: 'open', balance_cents: 0 }), false);
  assert.equal(isChargeEligibleForManualPayment({ status: 'paid', balance_cents: 0 }), false);
  assert.equal(isChargeEligibleForManualPayment({ status: 'cancelled', balance_cents: 5000 }), false);

  const config = makeConfig();

  // Método com conta de destino inativa é excluído
  const compatible = filterCompatibleUnitMethods(config, UNIT_1, ACC_CASH);
  assert.deepEqual(
    compatible.map((m) => m.id),
    [METHOD_CASH, METHOD_PIX, METHOD_CARD],
  );

  // Sem configuração financeira -> passo 1 + mensagem exata exigida
  const emptyReadiness = evaluateCashSetupReadiness(null, []);
  assert.equal(emptyReadiness.setup_complete, false);
  assert.equal(emptyReadiness.ready_to_record, false);
  assert.equal(emptyReadiness.current_step, 1);
  assert.equal(emptyReadiness.status_label, 'Configuração incompleta');
  assert.equal(emptyReadiness.guidance_message, MANUAL_PAYMENT_SETUP_GUIDANCE);

  // Configurado mas sem caixa aberto -> passo 4 + orientação para abrir caixa
  const closedSessionReadiness = evaluateCashSetupReadiness(config, []);
  assert.equal(closedSessionReadiness.setup_complete, true);
  assert.equal(closedSessionReadiness.ready_to_record, false);
  assert.equal(closedSessionReadiness.current_step, 4);
  assert.equal(closedSessionReadiness.status_label, 'Aguardando abertura do caixa');
  assert.equal(closedSessionReadiness.guidance_message, MANUAL_PAYMENT_OPEN_CASH_GUIDANCE);

  // Configurado e com caixa próprio aberto -> passo 5 pronto para informar pagamento
  const ready = evaluateCashSetupReadiness(config, [makeOpenSession()]);
  assert.equal(ready.setup_complete, true);
  assert.equal(ready.ready_to_record, true);
  assert.equal(ready.current_step, 5);
  assert.equal(ready.status_label, 'Configuração concluída');
  assert.equal(ready.guidance_message, null);
  assert.equal(ready.compatible_methods_for_open_session.length, 3);

  // Sessão aberta em unidade sem forma de pagamento ativa -> volta para passo 3
  const openU2 = makeOpenSession({ unit_id: UNIT_2, cash_account_id: ACC_BANK_U2 });
  const missingMethodForUnit = evaluateCashSetupReadiness(config, [openU2]);
  assert.equal(missingMethodForUnit.ready_to_record, false);
  assert.equal(missingMethodForUnit.current_step, 3);
  assert.equal(missingMethodForUnit.guidance_message, MANUAL_PAYMENT_SETUP_GUIDANCE);
});

test('Fase 5 — Seleção de contas recebedoras em Bancos e Pagamentos e carregamento multi-página sem truncar nem engolir erro', async () => {
  const config = makeConfig();

  // Sem filtro de unidade: retorna contas bancárias/digitais ativas (exclui espécie e inativas)
  const allReceiving = selectProviderReceivingAccounts(config, '');
  assert.deepEqual(
    allReceiving.active_receiving_accounts.map((a) => a.id),
    [ACC_BANK, ACC_BANK_U2],
  );
  assert.equal(allReceiving.inactive_receiving_accounts_count, 1);
  assert.equal(allReceiving.cash_only_accounts_count, 1);

  // Filtrado por Unidade 1: apenas Banco Principal PJ
  const unit1Receiving = selectProviderReceivingAccounts(config, UNIT_1);
  assert.deepEqual(
    unit1Receiving.active_receiving_accounts.map((a) => a.id),
    [ACC_BANK],
  );
  assert.equal(unit1Receiving.inactive_receiving_accounts_count, 1);
  assert.equal(unit1Receiving.cash_only_accounts_count, 1);

  // Multi-página (>50 contas) carrega todas as páginas sem truncar
  const page1Accounts = Array.from({ length: 50 }, (_, idx) => ({
    id: `00000000-0000-4000-8000-${String(idx + 1).padStart(12, '0')}`,
    unit_id: UNIT_1,
    name: `Conta ${idx + 1}`,
    type: 'bank' as const,
    active: true,
    version: 1,
  }));
  const page2Accounts = [
    {
      id: '00000000-0000-4000-8000-000000000051',
      unit_id: UNIT_1,
      name: 'Conta Bancária Página 2',
      type: 'bank' as const,
      active: true,
      version: 1,
    },
  ];
  const requestedPages: number[] = [];
  const loaded = await loadAllCashConfigurationPagesWithFetcher(
    OFFICE_A,
    null,
    async (_office, page) => {
      requestedPages.push(page);
      if (page === 1) {
        return {
          units: [{ id: UNIT_1, name: 'Unidade Sede', active: true, version: 1 }],
          accounts: page1Accounts,
          payment_methods: [],
          units_total: 1,
          accounts_total: 51,
          payment_methods_total: 0,
          page: 1,
          page_size: 50,
          unit_id: null,
        };
      }
      return {
        units: [],
        accounts: page2Accounts,
        payment_methods: [],
        units_total: 1,
        accounts_total: 51,
        payment_methods_total: 0,
        page: 2,
        page_size: 50,
        unit_id: null,
      };
    },
  );
  assert.deepEqual(requestedPages, [1, 2]);
  assert.equal(loaded.accounts.length, 51);
  assert.equal(loaded.accounts[50].name, 'Conta Bancária Página 2');

  // Deduplicação segura em mergeCashConfigurationPages
  const merged = mergeCashConfigurationPages([loaded, loaded]);
  assert.equal(merged.accounts.length, 51);

  // Erro de carregamento NÃO pode ser silenciado
  await assert.rejects(
    () =>
      loadAllCashConfigurationPagesWithFetcher(OFFICE_A, null, async () => {
        throw new Error('Falha de rede 503');
      }),
    /Falha de rede 503/,
  );
});

test('Fase 4 & 6 — API Express mapeia erros específicos de Caixa e Autorizações em PT-BR seguro (sem expor detalhes técnicos)', async () => {
  let scenario: 'cash_closed' | 'wrong_approver' | 'charge_changed' | 'cash_forbidden' | 'cash_conflict' =
    'cash_closed';

  const provider = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({ id: USER_ID, aud: 'authenticated' }));
      return;
    }
    if (scenario === 'cash_closed') {
      res.statusCode = 422;
      res.end(JSON.stringify({ code: 'PT422', message: 'CASH_SESSION_CLOSED' }));
      return;
    }
    if (scenario === 'wrong_approver') {
      res.statusCode = 403;
      res.end(JSON.stringify({ code: 'PT403', message: 'WRONG_APPROVER' }));
      return;
    }
    if (scenario === 'charge_changed') {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'PT409', message: 'CHARGE_CHANGED' }));
      return;
    }
    if (scenario === 'cash_forbidden') {
      res.statusCode = 403;
      res.end(JSON.stringify({ code: 'PT403', message: 'CASH_FORBIDDEN' }));
      return;
    }
    res.statusCode = 409;
    res.end(JSON.stringify({ code: 'PT409', message: 'CHARGE_CONFLICT' }));
  });

  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const old = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

  const post = (path: string, body: unknown) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture' },
      body: JSON.stringify(body),
    });

  try {
    scenario = 'cash_closed';
    const rClosed = await post(`/api/financial-approvals/${APPROVAL_ID}/execute-payment`, {
      office_id: OFFICE_A,
      session_id: SESSION_ID,
      expected_charge_version: 1,
      idempotency_key: 'exec-cash-closed-1',
    });
    assert.equal(rClosed.status, 422);
    const jClosed = await rClosed.json();
    assert.match(jClosed.error.message, /Abra um caixa individual ativo/i);

    scenario = 'wrong_approver';
    const rWrong = await post(`/api/financial-approvals/${APPROVAL_ID}/decide`, {
      office_id: OFFICE_A,
      decision: 'approve',
      expected_charge_version: 1,
      note: null,
      idempotency_key: 'decide-wrong-1',
    });
    assert.equal(rWrong.status, 403);
    const jWrong = await rWrong.json();
    assert.match(jWrong.error.message, /outro aprovador/i);

    scenario = 'charge_changed';
    const rChanged = await post(`/api/financial-approvals/${APPROVAL_ID}/decide`, {
      office_id: OFFICE_A,
      decision: 'approve',
      expected_charge_version: 1,
      note: null,
      idempotency_key: 'decide-changed-1',
    });
    assert.equal(rChanged.status, 409);
    const jChanged = await rChanged.json();
    assert.match(jChanged.error.message, /cobrança foi alterada/i);

    scenario = 'cash_forbidden';
    const rCashForb = await post('/api/cash/configuration', {
      office_id: OFFICE_A,
      unit_id: null,
      page: 1,
      page_size: 50,
    });
    assert.equal(rCashForb.status, 403);
    const jCashForb = await rCashForb.json();
    assert.match(jCashForb.error.message, /não permite esta operação financeira/i);

    scenario = 'cash_conflict';
    const rCashConf = await post('/api/cash/payment', {
      office_id: OFFICE_A,
      operation: {
        kind: 'record',
        session_id: SESSION_ID,
        expected_version: 1,
        idempotency_key: '13131313-1313-4131-8131-131313131313',
        evidence: 'Pagamento conferido no extrato oficial',
        payment_method_id: METHOD_PIX,
        status: 'confirmed',
        allocations: [
          {
            charge_id: CHARGE_ID,
            expected_charge_version: 1,
            amount_cents: 10000,
          },
        ],
        presented_cents: null,
        fee_cents: 0,
        settlement: 'not_applicable',
        settled_on: null,
        external_reference: 'E2E-1234',
      },
    });
    assert.equal(rCashConf.status, 409);
    const jCashConf = await rCashConf.json();
    assert.match(jCashConf.error.message, /cobrança foi alterada/i);
  } finally {
    for (const [i, k] of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].entries()) {
      if (old[i] === undefined) delete process.env[k];
      else process.env[k] = old[i];
    }
    server.closeAllConnections();
    server.close();
    provider.closeAllConnections();
    provider.close();
  }
});
