import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import {
  calculateCommercialDiscount,
  validateApprovalExecutionOrDecision,
} from '../shared/financialApprovals.js';

const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_OFFICE = '99999999-9999-4999-8999-999999999999';
const CHARGE_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const SESSION_ID = '44444444-4444-4444-8444-444444444444';
const UNIT_ID = '55555555-5555-4555-8555-555555555555';
const METHOD_ID = '66666666-6666-4666-8666-666666666666';
const APPROVER_ID = '77777777-7777-4777-8777-777777777777';
const REQUESTER_ID = '88888888-8888-4888-8888-888888888888';
const APPROVAL_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

test('Etapas 4 e 5 (Cenários 15, 16, 17, 18): cálculo de desconto R$/%, expiração, versão concorrente, permissão revogada e uso único', () => {
  // Desconto em R$
  const byCents = calculateCommercialDiscount({
    originalCents: 20000,
    balanceCents: 20000,
    mode: 'amount_cents',
    valueCents: 2500,
  });
  assert.equal(byCents.valid, true);
  assert.equal(byCents.discount_cents, 2500);
  assert.equal(byCents.discount_percent, 12.5);
  assert.equal(byCents.final_cents, 17500);

  // Desconto em percentual (%)
  const byPct = calculateCommercialDiscount({
    originalCents: 20000,
    balanceCents: 15000,
    mode: 'percent',
    percent: 10,
  });
  assert.equal(byPct.valid, true);
  assert.equal(byPct.discount_cents, 2000);
  assert.equal(byPct.final_cents, 13000);

  // Bloqueia desconto acima do saldo
  const overflow = calculateCommercialDiscount({
    originalCents: 20000,
    balanceCents: 1000,
    mode: 'amount_cents',
    valueCents: 2000,
  });
  assert.equal(overflow.valid, false);

  const baseApproval = {
    status: 'pending' as const,
    office_id: OFFICE_ID,
    charge_id: CHARGE_ID,
    charge_version_snapshot: 2,
    requested_amount_cents: 10000,
    expires_at: '2026-11-22T12:00:00Z',
    executed_at: null,
    approver_user_id: APPROVER_ID,
    requester_user_id: REQUESTER_ID,
  };

  // Aprovação válida
  assert.equal(
    validateApprovalExecutionOrDecision('decide', {
      approval: baseApproval,
      current_office_id: OFFICE_ID,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: APPROVER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-21T12:00:00Z',
    }).valid,
    true,
  );

  // Isolamento de escritório
  assert.equal(
    validateApprovalExecutionOrDecision('decide', {
      approval: baseApproval,
      current_office_id: OTHER_OFFICE,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: APPROVER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-21T12:00:00Z',
    }).code,
    'OFFICE_MISMATCH',
  );

  // Cenário 18: permissão revogada enquanto aprovação estava aberta
  assert.equal(
    validateApprovalExecutionOrDecision('decide', {
      approval: baseApproval,
      current_office_id: OFFICE_ID,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: APPROVER_ID,
      actor_has_permission: false,
      now_iso: '2026-11-21T12:00:00Z',
    }).code,
    'PERMISSION_REVOKED',
  );

  // Aprovador diferente do designado
  assert.equal(
    validateApprovalExecutionOrDecision('decide', {
      approval: baseApproval,
      current_office_id: OFFICE_ID,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: REQUESTER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-21T12:00:00Z',
    }).code,
    'WRONG_APPROVER',
  );

  // Expiração
  assert.equal(
    validateApprovalExecutionOrDecision('decide', {
      approval: baseApproval,
      current_office_id: OFFICE_ID,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: APPROVER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-23T12:00:00Z',
    }).code,
    'APPROVAL_EXPIRED',
  );

  // Cenário 17: alteração concorrente da cobrança invalida aprovação
  assert.equal(
    validateApprovalExecutionOrDecision('decide', {
      approval: baseApproval,
      current_office_id: OFFICE_ID,
      current_charge_version: 3,
      current_balance_cents: 15000,
      actor_user_id: APPROVER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-21T12:00:00Z',
    }).code,
    'CHARGE_CHANGED',
  );

  // Uso único na execução de pagamento manual + exigência de caixa aberto
  assert.equal(
    validateApprovalExecutionOrDecision('execute', {
      approval: { ...baseApproval, status: 'approved', executed_at: '2026-11-21T13:00:00Z' },
      current_office_id: OFFICE_ID,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: REQUESTER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-21T14:00:00Z',
      require_open_cash_session: true,
      cash_session_open: true,
    }).code,
    'ALREADY_EXECUTED',
  );

  assert.equal(
    validateApprovalExecutionOrDecision('execute', {
      approval: { ...baseApproval, status: 'approved' },
      current_office_id: OFFICE_ID,
      current_charge_version: 2,
      current_balance_cents: 15000,
      actor_user_id: REQUESTER_ID,
      actor_has_permission: true,
      now_iso: '2026-11-21T14:00:00Z',
      require_open_cash_session: true,
      cash_session_open: false,
    }).code,
    'CASH_SESSION_CLOSED',
  );
});

test('Etapas 4 e 5 (Cenários 15-18): API /api/financial-approvals contrato, fail-closed, aprovação, recusa, revogação e execução única', async () => {
  let mode: 'missing_rpc' | 'normal' | 'permission_revoked' | 'charge_changed' | 'already_executed' = 'missing_rpc';

  const makeItem = (overrides: Record<string, unknown> = {}) => ({
    id: APPROVAL_ID,
    office_id: OFFICE_ID,
    kind: 'manual_payment',
    status: 'pending',
    charge_id: CHARGE_ID,
    charge_version_snapshot: 2,
    request_id: REQUEST_ID,
    protocol: 'JN-2026-000777',
    customer_name: 'Maria Produtora',
    service_summary: 'Certidão',
    requester_user_id: REQUESTER_ID,
    requester_name: 'Operador Caixa',
    approver_user_id: APPROVER_ID,
    approver_name: 'Gestor Financeiro',
    original_cents: 20000,
    requested_amount_cents: 10000,
    discount_cents: null,
    discount_percent: null,
    final_cents: 10000,
    card_fee_cents: 0,
    payment_method_id: METHOD_ID,
    payment_method_name: 'Dinheiro',
    session_id: SESSION_ID,
    unit_id: UNIT_ID,
    justification: 'Pagamento em espécie no balcão',
    decision_note: null,
    created_at: '2026-11-21T10:00:00Z',
    expires_at: '2026-11-22T10:00:00Z',
    decided_at: null,
    executed_at: null,
    can_decide: true,
    can_execute: false,
    invalidation_reason: null,
    ...overrides,
  });

  const provider = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({ id: REQUESTER_ID, aud: 'authenticated' }));
      return;
    }
    if (mode === 'missing_rpc') {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 'PGRST202', message: 'rpc missing' }));
      return;
    }
    if (mode === 'permission_revoked') {
      res.statusCode = 403;
      res.end(JSON.stringify({ code: 'PT403', message: 'PERMISSION_REVOKED' }));
      return;
    }
    if (mode === 'charge_changed') {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'PT409', message: 'CHARGE_CHANGED' }));
      return;
    }
    if (mode === 'already_executed') {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'PT409', message: 'ALREADY_EXECUTED' }));
      return;
    }
    if (req.url?.endsWith('financial_approval_eligible_approvers')) {
      res.end(
        JSON.stringify([
          { membership_id: UNIT_ID, user_id: APPROVER_ID, name: 'Gestor Financeiro', role_code: 'admin' },
        ]),
      );
      return;
    }
    if (req.url?.endsWith('financial_approvals_page')) {
      res.end(JSON.stringify({ items: [makeItem()], total: 1, page: 1, page_size: 5 }));
      return;
    }
    if (req.url?.endsWith('financial_approval_request_discount')) {
      res.end(
        JSON.stringify(
          makeItem({
            kind: 'discount',
            discount_cents: 2000,
            discount_percent: 10,
            requested_amount_cents: 2000,
            final_cents: 18000,
            card_fee_cents: 0,
          }),
        ),
      );
      return;
    }
    if (req.url?.endsWith('financial_approval_decide')) {
      res.end(JSON.stringify(makeItem({ status: 'approved', can_decide: false, can_execute: true })));
      return;
    }
    if (req.url?.endsWith('financial_approval_execute_manual_payment')) {
      res.end(
        JSON.stringify(
          makeItem({
            status: 'executed',
            can_decide: false,
            can_execute: false,
            executed_at: '2026-11-21T12:15:00Z',
          }),
        ),
      );
      return;
    }
    res.end(JSON.stringify(makeItem()));
  });

  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const old = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/financial-approvals`;

  const send = (path: string, body: unknown, auth = true) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) },
      body: JSON.stringify(body),
    });

  try {
    // Sem auth -> 401
    assert.equal((await send('/approvers', { office_id: OFFICE_ID, kind: 'manual_payment' }, false)).status, 401);

    // Fail-closed antes da IA 2
    mode = 'missing_rpc';
    const approversMissing = await (await send('/approvers', { office_id: OFFICE_ID, kind: 'manual_payment' })).json();
    assert.equal(approversMissing.data.backend_ready, false);
    const listMissing = await (
      await send('/list', { office_id: OFFICE_ID, scope: 'all', kind: 'all', page: 1 })
    ).json();
    assert.equal(listMissing.data.backend_ready, false);

    // Fluxo completo normal (Cenários 15, 16, 17)
    mode = 'normal';
    const approvers = await (await send('/approvers', { office_id: OFFICE_ID, kind: 'manual_payment' })).json();
    assert.equal(approvers.data.items.length, 1);
    assert.equal(approvers.data.items[0].role_label, 'Administrador');

    const manualReq = await send('/manual-payment/request', {
      office_id: OFFICE_ID,
      charge_id: CHARGE_ID,
      charge_version: 2,
      request_id: REQUEST_ID,
      session_id: SESSION_ID,
      unit_id: UNIT_ID,
      payment_method_id: METHOD_ID,
      approver_user_id: APPROVER_ID,
      amount_cents: 10000,
      justification: 'Recebimento presencial em espécie',
      idempotency_key: 'man-req-0001',
    });
    assert.equal(manualReq.status, 201);

    const discountReq = await send('/discount/request', {
      office_id: OFFICE_ID,
      charge_id: CHARGE_ID,
      charge_version: 2,
      request_id: REQUEST_ID,
      approver_user_id: APPROVER_ID,
      mode: 'percent',
      discount_cents: 2000,
      discount_percent: 10,
      justification: 'Desconto comercial autorizado pela gerência',
      idempotency_key: 'disc-req-0001',
    });
    assert.equal(discountReq.status, 201);
    const discountJson = await discountReq.json();
    assert.equal(discountJson.data.discount_cents, 2000);
    assert.equal(discountJson.data.card_fee_cents, 0);

    const decided = await (
      await send(`/${APPROVAL_ID}/decide`, {
        office_id: OFFICE_ID,
        decision: 'approve',
        expected_charge_version: 2,
        note: 'Conferido',
        idempotency_key: 'dec-key-0001',
      })
    ).json();
    assert.equal(decided.data.status, 'approved');

    const executed = await (
      await send(`/${APPROVAL_ID}/execute-payment`, {
        office_id: OFFICE_ID,
        session_id: SESSION_ID,
        expected_charge_version: 2,
        idempotency_key: 'exec-key-0001',
      })
    ).json();
    assert.equal(executed.data.status, 'executed');

    // Cenário 18: permissão revogada -> 403
    mode = 'permission_revoked';
    assert.equal(
      (
        await send(`/${APPROVAL_ID}/decide`, {
          office_id: OFFICE_ID,
          decision: 'approve',
          expected_charge_version: 2,
          note: null,
          idempotency_key: 'dec-key-0002',
        })
      ).status,
      403,
    );

    // Conflito de versão -> 409
    mode = 'charge_changed';
    assert.equal(
      (
        await send(`/${APPROVAL_ID}/decide`, {
          office_id: OFFICE_ID,
          decision: 'approve',
          expected_charge_version: 2,
          note: null,
          idempotency_key: 'dec-key-0003',
        })
      ).status,
      409,
    );

    // Reutilização bloqueada -> 409
    mode = 'already_executed';
    assert.equal(
      (
        await send(`/${APPROVAL_ID}/execute-payment`, {
          office_id: OFFICE_ID,
          session_id: SESSION_ID,
          expected_charge_version: 2,
          idempotency_key: 'exec-key-0002',
        })
      ).status,
      409,
    );
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
