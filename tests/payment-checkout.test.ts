import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import {
  buildManualWhatsAppPixShare,
  clientPaymentStates,
  computeInstallmentOptions,
  isCapabilitySupported,
  isValidWebhookEnvelope,
  providerCatalog,
  terminalOperationStates,
  UNSUPPORTED_CAPABILITY_LABEL,
} from '../shared/paymentCheckout.js';

const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const CHARGE_ID = '22222222-2222-4222-8222-222222222222';
const INTENT_ID = '33333333-3333-4333-8333-333333333333';
const TERMINAL_ID = '44444444-4444-4444-8444-444444444444';

test('Etapas 2 e 3: 12 estados do cliente, 9 estados de maquininha, parcelamento, capabilities e compartilhamento manual Pix/WhatsApp', () => {
  assert.equal(clientPaymentStates.length, 12);
  assert.equal(terminalOperationStates.length, 9);
  assert.equal(UNSUPPORTED_CAPABILITY_LABEL, 'Não disponível para este provedor');

  // Parcelamento respeita parcela mínima e teto de parcelas
  const installments = computeInstallmentOptions(10000, 6, 3000);
  assert.deepEqual(
    installments.map((o) => o.count),
    [1, 2, 3],
  );
  assert.equal(installments[0].per_installment_cents, 10000);

  // Capabilities por provedor
  const pixOnly = providerCatalog.find((p) => p.provider_code === 'generic_pix_bank');
  assert.ok(pixOnly);
  assert.equal(isCapabilitySupported(pixOnly.supported_capabilities, 'pix_dynamic_qr'), true);
  assert.equal(isCapabilitySupported(pixOnly.supported_capabilities, 'card_credit_cash'), false);

  // Compartilhamento manual de Pix via WhatsApp sem depender de API oficial
  const share = buildManualWhatsAppPixShare({
    officeName: 'Escritório JN',
    protocol: 'JN-2026-000456',
    serviceSummary: 'CCIR e ITR',
    amountCents: 25000,
    pixCopyPaste: '00020126360014br.gov.bcb.pix0114chave-teste5204000053039865802BR',
    phoneDigits: '5511999999999',
  });
  assert.match(share.text, /JN-2026-000456/);
  assert.match(share.text, /250,00/);
  assert.match(share.waUrl, /^https:\/\/wa\.me\/5511999999999\?text=/);

  // Envelope de webhook válido vs inválido
  assert.equal(
    isValidWebhookEnvelope({
      contract_version: 1,
      source: 'generic_psp_pix_card',
      provider_account_ref: 'acct_01',
      environment: 'sandbox',
      office_id: OFFICE_ID,
      event_id: 'evt_123456',
      event_type: 'pix.confirmed',
      resource_ref: INTENT_ID,
      occurred_at: '2026-11-21T12:00:00Z',
      payload_digest: 'a'.repeat(64),
    }),
    true,
  );
  assert.equal(isValidWebhookEnvelope({ contract_version: 2 }), false);
});

test('Etapas 2 e 3 (Cenários 12, 13, 14, 19, 20): API /api/payment-checkout resumo, status, erro bancário, idempotência, provedor não configurado, maquininha e webhook', async () => {
  let mode:
    | 'missing_rpc'
    | 'summary_ready'
    | 'intent_pending'
    | 'intent_confirmed'
    | 'provider_error'
    | 'terminal_authorized' = 'missing_rpc';
  const seenKeys = new Set<string>();

  const provider = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? JSON.parse(raw) : {};

    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({ id: OFFICE_ID, aud: 'authenticated' }));
      return;
    }
    if (mode === 'missing_rpc') {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 'PGRST202', message: 'function not found' }));
      return;
    }
    if (mode === 'provider_error') {
      res.statusCode = 503;
      res.end(JSON.stringify({ code: 'PT503', message: 'PROVIDER_UNAVAILABLE' }));
      return;
    }
    if (req.url?.endsWith('client_payment_checkout_summary') && mode === 'summary_ready') {
      res.end(
        JSON.stringify({
          office_id: OFFICE_ID,
          charge: {
            charge_id: CHARGE_ID,
            request_id: OFFICE_ID,
            protocol: 'JN-2026-000500',
            service_summary: 'Regularização Fundiária',
            channel: 'portal',
            original_cents: 50000,
            approved_discount_cents: 5000,
            authorized_surcharge_cents: 0,
            card_fee_cents: 0,
            final_cents: 45000,
            paid_cents: 0,
            balance_cents: 45000,
            charge_status: 'aberta',
            charge_version: 2,
            installments: [],
            receipt: null,
          },
          payment_state: 'available',
          provider_configured: true,
          provider_message: null,
          available_methods: ['pix_qr', 'pix_copy_paste', 'credit_card', 'installments'],
          max_installments: 6,
          min_installment_cents: 5000,
          active_intent: null,
          recent_intents: [],
        }),
      );
      return;
    }
    if (req.url?.endsWith('payment_checkout_create_intent') || req.url?.endsWith('staff_payment_generate_pix')) {
      const key = String(body.p_idempotency_key ?? '');
      const replay = seenKeys.has(key);
      seenKeys.add(key);
      res.end(
        JSON.stringify({
          id: INTENT_ID,
          charge_id: CHARGE_ID,
          office_id: OFFICE_ID,
          method: 'pix_qr',
          state: mode === 'intent_confirmed' ? 'confirmed' : 'awaiting_payment',
          amount_cents: 45000,
          installments_count: 1,
          installment_amount_cents: 45000,
          provider_label: 'Banco Homologado',
          pix_qr_payload: '000201pix-qr',
          pix_copy_paste: '000201pix-copy-paste',
          expires_at: '2026-11-22T12:00:00Z',
          checkout_url: null,
          terminal_id: null,
          terminal_state: null,
          settlement_stage: mode === 'intent_confirmed' ? 'settled' : 'none',
          authorization_code: null,
          provider_reference: replay ? 'tx_replayed_1' : 'tx_new_1',
          safe_message: replay ? 'Reutilizando cobrança Pix ativa.' : null,
          updated_at: '2026-11-21T12:00:00Z',
        }),
      );
      return;
    }
    if (req.url?.endsWith('staff_payment_start_terminal') && mode === 'terminal_authorized') {
      res.end(
        JSON.stringify({
          id: INTENT_ID,
          charge_id: CHARGE_ID,
          office_id: OFFICE_ID,
          method: 'installments',
          state: 'processing',
          amount_cents: 45000,
          installments_count: 3,
          installment_amount_cents: 15000,
          provider_label: 'Adquirente Terminal',
          pix_qr_payload: null,
          pix_copy_paste: null,
          checkout_url: null,
          terminal_id: TERMINAL_ID,
          terminal_state: 'authorization_received',
          settlement_stage: 'authorized',
          authorization_code: 'AUT9988',
          provider_reference: 'term_01',
          safe_message: 'Autorizado na maquininha, aguardando captura.',
          updated_at: '2026-11-21T12:00:00Z',
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        id: INTENT_ID,
        charge_id: CHARGE_ID,
        office_id: OFFICE_ID,
        method: 'pix_qr',
        state: 'confirmed',
        amount_cents: 45000,
        installments_count: 1,
        installment_amount_cents: 45000,
        settlement_stage: 'settled',
        updated_at: '2026-11-21T12:05:00Z',
      }),
    );
  });

  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const old = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/payment-checkout`;

  const send = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer fixture', ...headers },
      body: JSON.stringify(body),
    });

  try {
    // Cenário 20: provedor não configurado (fail-closed)
    mode = 'missing_rpc';
    const unconf = await (await send('/client/summary', { office_id: OFFICE_ID, charge_id: CHARGE_ID })).json();
    assert.equal(unconf.data.payment_state, 'provider_unconfigured');
    assert.equal(unconf.data.provider_configured, false);
    assert.equal(
      (
        await send('/client/intent', {
          office_id: OFFICE_ID,
          charge_id: CHARGE_ID,
          expected_charge_version: 2,
          method: 'pix_qr',
          installments_count: 1,
          idempotency_key: 'pay-key-000001',
        })
      ).status,
      503,
    );

    // Cenário 12: cliente visualiza cobrança, desconto aprovado e saldo real
    mode = 'summary_ready';
    const ready = await (await send('/client/summary', { office_id: OFFICE_ID, charge_id: CHARGE_ID })).json();
    assert.equal(ready.data.payment_state, 'available');
    assert.equal(ready.data.charge.approved_discount_cents, 5000);
    assert.equal(ready.data.charge.balance_cents, 45000);

    // Cenário 13 + 19: pagamento pendente -> retry idempotente -> confirmação autoritativa
    mode = 'intent_pending';
    const first = await (
      await send('/client/intent', {
        office_id: OFFICE_ID,
        charge_id: CHARGE_ID,
        expected_charge_version: 2,
        method: 'pix_qr',
        installments_count: 1,
        idempotency_key: 'pay-key-idem-01',
      })
    ).json();
    assert.equal(first.data.state, 'awaiting_payment');
    assert.equal(first.data.provider_reference, 'tx_new_1');

    const retry = await (
      await send('/client/intent', {
        office_id: OFFICE_ID,
        charge_id: CHARGE_ID,
        expected_charge_version: 2,
        method: 'pix_qr',
        installments_count: 1,
        idempotency_key: 'pay-key-idem-01',
      })
    ).json();
    assert.equal(retry.data.provider_reference, 'tx_replayed_1');

    const confirmed = await (await send('/intent/status', { office_id: OFFICE_ID, intent_id: INTENT_ID })).json();
    assert.equal(confirmed.data.state, 'confirmed');
    assert.equal(confirmed.data.settlement_stage, 'settled');

    // Cenário 14: falha de integração bancária -> 503 seguro
    mode = 'provider_error';
    const bankErr = await send('/staff/pix', {
      office_id: OFFICE_ID,
      charge_id: CHARGE_ID,
      expected_charge_version: 2,
      amount_cents: 45000,
      idempotency_key: 'staff-pix-0001',
    });
    assert.equal(bankErr.status, 503);

    // Maquininha distingue autorização vs captura/liquidação e valida parcelamento no débito
    assert.equal(
      (
        await send('/staff/card-terminal', {
          office_id: OFFICE_ID,
          charge_id: CHARGE_ID,
          expected_charge_version: 2,
          terminal_id: TERMINAL_ID,
          sale_mode: 'debit',
          installments_count: 2,
          amount_cents: 45000,
          idempotency_key: 'term-key-0001',
        })
      ).status,
      422,
    );

    mode = 'terminal_authorized';
    const termRes = await (
      await send('/staff/card-terminal', {
        office_id: OFFICE_ID,
        charge_id: CHARGE_ID,
        expected_charge_version: 2,
        terminal_id: TERMINAL_ID,
        sale_mode: 'credit_installment',
        installments_count: 3,
        amount_cents: 45000,
        idempotency_key: 'term-key-0002',
      })
    ).json();
    assert.equal(termRes.data.terminal_state, 'authorization_received');
    assert.equal(termRes.data.settlement_stage, 'authorized');

    // Webhook sem assinatura -> 401; envelope inválido -> 422; válido -> 503 fail-closed até IA 2
    const whNoSig = await fetch(base + '/webhooks/generic_psp_pix_card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(whNoSig.status, 401);

    const whBadEnv = await fetch(base + '/webhooks/generic_psp_pix_card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jn-webhook-signature': 'sig_1234567890abcdef' },
      body: JSON.stringify({ contract_version: 99 }),
    });
    assert.equal(whBadEnv.status, 422);

    const whPending = await fetch(base + '/webhooks/generic_psp_pix_card', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-jn-webhook-signature': 'sig_1234567890abcdef' },
      body: JSON.stringify({
        contract_version: 1,
        source: 'generic_psp_pix_card',
        provider_account_ref: 'acct_01',
        environment: 'sandbox',
        office_id: OFFICE_ID,
        event_id: 'evt_001',
        event_type: 'pix.confirmed',
        resource_ref: INTENT_ID,
        occurred_at: '2026-11-21T12:00:00Z',
        payload_digest: 'b'.repeat(64),
      }),
    });
    assert.equal(whPending.status, 503);
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
