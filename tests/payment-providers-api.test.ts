import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import { mobileOperationNavigation, operationNavigation, settingsNavigation } from '../src/features/operation/navigation.js';
import { permissionNames } from '../shared/team.js';

const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const PROVIDER_ID = '22222222-2222-4222-8222-222222222222';
const TERMINAL_ID = '33333333-3333-4333-8333-333333333333';

test('Etapa 6: navegação preserva 4 atalhos mobile e restringe Bancos e Pagamentos a owner/admin com settings.access + payments.providers.manage', () => {
  // Todas as 4 novas permissões existem no catálogo
  assert.ok(permissionNames['requests.delete']);
  assert.ok(permissionNames['payments.manual.approve']);
  assert.ok(permissionNames['payments.providers.manage']);
  assert.ok(permissionNames['charges.discount.approve']);

  const allPerms = Object.keys(permissionNames) as Array<keyof typeof permissionNames>;
  const makeContext = (role_code: 'owner' | 'admin' | 'employee', permissions: string[]) => ({
    office_id: OFFICE_ID,
    user_id: OFFICE_ID,
    office_name: 'Escritório JN',
    display_name: 'Gestor Teste',
    role_code,
    permissions,
  });

  // Sidebar raiz não ganhou item extra fora dos grupos existentes e mobile continua <= 4 atalhos
  const rootOwner = operationNavigation([makeContext('owner', allPerms)], false);
  assert.ok(rootOwner.some((item) => item.path === '/configuracoes'));
  assert.equal(rootOwner.some((item) => item.path === '/configuracoes/bancos-pagamentos'), false);

  const mobileOwner = mobileOperationNavigation(rootOwner);
  assert.ok(mobileOwner.length <= 4);

  // Settings navigation exibe Bancos e Pagamentos para owner/admin autorizados e oculta para employee ou sem permissão
  const settingsOwner = settingsNavigation(makeContext('owner', allPerms), false);
  assert.equal(settingsOwner.some((item) => item.path === '/configuracoes/bancos-pagamentos'), true);

  const settingsAdminAllowed = settingsNavigation(
    makeContext('admin', ['settings.access', 'payments.providers.manage']),
    false,
  );
  assert.equal(settingsAdminAllowed.some((item) => item.path === '/configuracoes/bancos-pagamentos'), true);

  const settingsAdminMissingPerm = settingsNavigation(makeContext('admin', ['settings.access']), false);
  assert.equal(settingsAdminMissingPerm.some((item) => item.path === '/configuracoes/bancos-pagamentos'), false);

  const settingsEmployee = settingsNavigation(
    makeContext('employee', ['settings.access', 'payments.providers.manage']),
    false,
  );
  assert.equal(settingsEmployee.some((item) => item.path === '/configuracoes/bancos-pagamentos'), false);
});

test('Etapa 6: API /api/payment-providers protege acesso, nunca vaza segredos e responde fail-closed antes da IA 2', async () => {
  let mode: 'missing_rpc' | 'forbidden' | 'ready' = 'missing_rpc';

  const provider = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({ id: OFFICE_ID, aud: 'authenticated' }));
      return;
    }
    if (mode === 'missing_rpc') {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 'PGRST202', message: 'rpc not found' }));
      return;
    }
    if (mode === 'forbidden') {
      res.statusCode = 403;
      res.end(JSON.stringify({ code: 'PT403', message: 'PROVIDERS_FORBIDDEN' }));
      return;
    }
    res.end(
      JSON.stringify({
        providers: [
          {
            id: PROVIDER_ID,
            provider_code: 'generic_pix_bank',
            display_name: 'Instituição Bancária (Somente Pix)',
            institution_label: 'Banco Cooperativo',
            environment: 'sandbox',
            status: 'validated',
            enabled_methods: ['pix_qr', 'pix_copy_paste'],
            receiving_account_id: null,
            receiving_account_name: 'Conta Principal',
            financial_unit_id: null,
            financial_unit_name: 'Matriz',
            credential_ref: 'vault://office-1/pix-sandbox',
            raw_secret: 'SHOULD_NEVER_BE_RETURNED',
            bank_password: 'SHOULD_NEVER_BE_RETURNED',
            homologated: false,
          },
        ],
        pix: {
          enabled: true,
          provider_id: PROVIDER_ID,
          dynamic_qr_enabled: true,
          copy_paste_enabled: true,
          expiration_minutes: 30,
          reconciliation_enabled: true,
          refund_enabled: false,
          pix_key_masked: '12.***.***/0001-**',
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
        terminals: [
          {
            id: TERMINAL_ID,
            provider_id: PROVIDER_ID,
            label: 'Balcão 01',
            manufacturer: 'Stone/Ingenico',
            model: 'Move 5000',
            provider_name: 'Adquirente Exemplo',
            serial_masked: '****4321',
            connection_mode: 'cloud_api',
            supported_protocols: ['cloud_api'],
            unit_id: null,
            unit_name: 'Matriz',
            status: 'active',
          },
        ],
        diagnostics: [],
        pending_reconciliations_count: 0,
      }),
    );
  });

  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const old = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/payment-providers`;

  const send = (path: string, body: unknown, auth = true) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) },
      body: JSON.stringify(body),
    });

  try {
    assert.equal((await send('/state', { office_id: OFFICE_ID }, false)).status, 401);

    // Fail-closed antes da IA 2
    mode = 'missing_rpc';
    const stateMissing = await (await send('/state', { office_id: OFFICE_ID })).json();
    assert.equal(stateMissing.data.backend_ready, false);
    assert.ok(stateMissing.data.catalog.length >= 3);

    // 403 para usuário sem permissão
    mode = 'forbidden';
    assert.equal((await send('/state', { office_id: OFFICE_ID })).status, 403);

    // Projeção limpa: remove raw_secret e bank_password
    mode = 'ready';
    const readyRes = await send('/state', { office_id: OFFICE_ID });
    assert.equal(readyRes.status, 200);
    const readyText = await readyRes.text();
    assert.doesNotMatch(readyText, /SHOULD_NEVER_BE_RETURNED|raw_secret|bank_password/);
    const readyJson = JSON.parse(readyText);
    assert.equal(readyJson.data.providers[0].capabilities.pix_dynamic_qr, true);
    assert.equal(readyJson.data.providers[0].capabilities.card_credit_cash, false);
    assert.equal(readyJson.data.terminals[0].label, 'Balcão 01');

    // Validação estrita de entrada
    assert.equal(
      (
        await send('/provider/save', {
          office_id: OFFICE_ID,
          provider_id: null,
          provider_code: 'invalid_provider',
          institution_label: 'Banco X',
          environment: 'sandbox',
          enabled_methods: ['pix_qr'],
          receiving_account_id: null,
          financial_unit_id: null,
          credential_ref: null,
          idempotency_key: 'prov-save-0001',
        })
      ).status,
      422,
    );

    const saved = await send('/provider/save', {
      office_id: OFFICE_ID,
      provider_id: null,
      provider_code: 'generic_pix_bank',
      institution_label: 'Banco Cooperativo',
      environment: 'sandbox',
      enabled_methods: ['pix_qr', 'pix_copy_paste'],
      receiving_account_id: null,
      financial_unit_id: null,
      credential_ref: 'vault://office-1/pix-sandbox',
      idempotency_key: 'prov-save-0002',
    });
    assert.equal(saved.status, 200);
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
