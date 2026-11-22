import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import {
  computePayloadSha256,
  providerWebhookEnvKey,
  verifyCronBearer,
  verifyWebhookHmac,
} from '../server/modules/payment-checkout/webhookSecurity.js';

const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const INTENT_ID = '33333333-3333-4333-8333-333333333333';

function sign(secret: string, rawBody: string, timestamp?: string): string {
  const payload = timestamp ? `${timestamp}.${rawBody}` : rawBody;
  return `sha256=${createHmac('sha256', secret).update(payload, 'utf8').digest('hex')}`;
}

test('Webhook HMAC helper: valida assinatura, detecta adulteração e bloqueia replay por timestamp expirado', () => {
  const secret = 'test-webhook-secret-minimum-32-chars';
  const raw = JSON.stringify({ event_id: 'evt_1', amount_cents: 5000 });
  const nowMs = Date.UTC(2026, 10, 22, 12, 0, 0);
  const freshTs = String(Math.floor(nowMs / 1000));
  const staleTs = String(Math.floor(nowMs / 1000) - 600);

  assert.equal(providerWebhookEnvKey('generic_psp_pix_card'), 'PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PSP_PIX_CARD');

  const valid = verifyWebhookHmac({
    rawBody: Buffer.from(raw, 'utf8'),
    signatureHeader: sign(secret, raw, freshTs),
    timestampHeader: freshTs,
    secret,
    nowMs,
  });
  assert.equal(valid.ok, true);
  if (valid.ok) {
    assert.equal(valid.payloadSha256, computePayloadSha256(raw));
  }

  // Tampered payload rejected
  const tampered = verifyWebhookHmac({
    rawBody: Buffer.from(raw.replace('5000', '100'), 'utf8'),
    signatureHeader: sign(secret, raw, freshTs),
    timestampHeader: freshTs,
    secret,
    nowMs,
  });
  assert.deepEqual(tampered, { ok: false, code: 'WEBHOOK_SIGNATURE_INVALID' });

  // Expired timestamp rejected (> 5 min skew)
  const expired = verifyWebhookHmac({
    rawBody: Buffer.from(raw, 'utf8'),
    signatureHeader: sign(secret, raw, staleTs),
    timestampHeader: staleTs,
    secret,
    nowMs,
  });
  assert.deepEqual(expired, { ok: false, code: 'WEBHOOK_TIMESTAMP_EXPIRED' });

  // Cron bearer checks
  assert.deepEqual(verifyCronBearer('Bearer abc', undefined), {
    ok: false,
    status: 503,
    code: 'CRON_SECRET_UNCONFIGURED',
  });
  assert.deepEqual(verifyCronBearer('Bearer wrong', 'valid-cron-secret-2026'), {
    ok: false,
    status: 401,
    code: 'CRON_UNAUTHORIZED',
  });
  assert.deepEqual(verifyCronBearer('Bearer valid-cron-secret-2026', 'valid-cron-secret-2026'), { ok: true });
});

test('Express /api/payment-checkout: webhook HMAC assinado persiste via service_role e cron /cron/reconcile exige Bearer', async () => {
  const seenEvents = new Set<string>();
  const captured: { lastWebhookRpcBody: Record<string, unknown> | null } = { lastWebhookRpcBody: null };
  let sweepCalls = 0;

  const mockSupabase = createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};

    if (req.url?.endsWith('/rest/v1/rpc/payment_webhook_ingest')) {
      captured.lastWebhookRpcBody = body;
      const eventId = String(body.p_event_id ?? '');
      if (seenEvents.has(eventId)) {
        res.end(JSON.stringify({ status: 'ignored_duplicate', event_id: eventId }));
        return;
      }
      seenEvents.add(eventId);
      res.end(
        JSON.stringify({
          status: 'processed',
          event_id: eventId,
          intent_id: INTENT_ID,
          state: 'confirmed',
          settlement_stage: 'settled',
        }),
      );
      return;
    }

    if (req.url?.endsWith('/rest/v1/rpc/payment_maintenance_sweep')) {
      sweepCalls += 1;
      res.end(
        JSON.stringify({
          expired_intents: 2,
          expired_approvals: 1,
          ran_at: '2026-11-22T12:00:00Z',
        }),
      );
      return;
    }

    res.statusCode = 404;
    res.end(JSON.stringify({ code: 'PGRST202' }));
  });

  await new Promise<void>((r) => mockSupabase.listen(0, '127.0.0.1', r));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/payment-checkout`;

  const envKeys = [
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PSP_PIX_CARD',
    'PAYMENT_RECONCILIATION_CRON_SECRET',
  ] as const;
  const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));

  try {
    process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(mockSupabase.address() as { port: number }).port}`;
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_service_role_fixture_secret_key';
    const webhookSecret = 'psp-hmac-secret-key-2026-production';
    process.env.PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PSP_PIX_CARD = webhookSecret;

    const envelope = {
      contract_version: 1,
      source: 'generic_psp_pix_card',
      provider_account_ref: 'acct_01',
      environment: 'sandbox',
      office_id: OFFICE_ID,
      event_id: 'evt_signed_001',
      event_type: 'payment.confirmed',
      resource_ref: 'tx_ref_001',
      occurred_at: '2026-11-22T12:00:00Z',
      payload_digest: 'c'.repeat(64),
    };
    const rawBody = JSON.stringify(envelope);
    const nowTs = String(Math.floor(Date.now() / 1000));

    // Invalid signature -> 401
    const badSig = await fetch(`${base}/webhooks/generic_psp_pix_card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jn-webhook-signature': `sha256=${'0'.repeat(64)}`,
        'x-jn-webhook-timestamp': nowTs,
      },
      body: rawBody,
    });
    assert.equal(badSig.status, 401);

    // Expired timestamp -> 401
    const oldTs = String(Math.floor(Date.now() / 1000) - 900);
    const expiredRes = await fetch(`${base}/webhooks/generic_psp_pix_card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jn-webhook-signature': sign(webhookSecret, rawBody, oldTs),
        'x-jn-webhook-timestamp': oldTs,
      },
      body: rawBody,
    });
    assert.equal(expiredRes.status, 401);

    // Valid signature -> 200 processed + server-computed SHA-256
    const validRes = await fetch(`${base}/webhooks/generic_psp_pix_card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jn-webhook-signature': sign(webhookSecret, rawBody, nowTs),
        'x-jn-webhook-timestamp': nowTs,
      },
      body: rawBody,
    });
    assert.equal(validRes.status, 200);
    const validJson = (await validRes.json()) as { data: { status: string; state: string } };
    assert.equal(validJson.data.status, 'processed');
    assert.equal(validJson.data.state, 'confirmed');
    assert.equal(captured.lastWebhookRpcBody?.p_payload_sha256, computePayloadSha256(rawBody));

    // Duplicate event replay -> 200 ignored_duplicate
    const dupRes = await fetch(`${base}/webhooks/generic_psp_pix_card`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jn-webhook-signature': sign(webhookSecret, rawBody, nowTs),
        'x-jn-webhook-timestamp': nowTs,
      },
      body: rawBody,
    });
    assert.equal(dupRes.status, 200);
    const dupJson = (await dupRes.json()) as { data: { status: string } };
    assert.equal(dupJson.data.status, 'ignored_duplicate');

    // Cron unconfigured -> 503
    delete process.env.PAYMENT_RECONCILIATION_CRON_SECRET;
    const cronUnconf = await fetch(`${base}/cron/reconcile`, { method: 'GET' });
    assert.equal(cronUnconf.status, 503);

    // Cron invalid bearer -> 401
    process.env.PAYMENT_RECONCILIATION_CRON_SECRET = 'cron-secret-token-2026-prod';
    const cronDenied = await fetch(`${base}/cron/reconcile`, {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong-token-value' },
    });
    assert.equal(cronDenied.status, 401);

    // Cron valid bearer -> 200 maintenance sweep
    const cronOk = await fetch(`${base}/cron/reconcile`, {
      method: 'GET',
      headers: { Authorization: 'Bearer cron-secret-token-2026-prod' },
    });
    assert.equal(cronOk.status, 200);
    const cronJson = (await cronOk.json()) as { data: { expired_intents: number; expired_approvals: number } };
    assert.equal(cronJson.data.expired_intents, 2);
    assert.equal(cronJson.data.expired_approvals, 1);
    assert.equal(sweepCalls, 1);
  } finally {
    for (const k of envKeys) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    server.closeAllConnections();
    server.close();
    mockSupabase.closeAllConnections();
    mockSupabase.close();
  }
});
