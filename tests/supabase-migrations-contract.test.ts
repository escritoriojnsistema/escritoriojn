import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  createRequestDeletionCleanupHandler,
  isSafeCleanupObject,
  type CleanupAdminClient,
} from '../supabase/functions/request-deletion-cleanup/handler.js';

const ROOT = process.cwd();

const EVOLUTION_MIGRATIONS = [
  'supabase/migrations/20261122120000_evolution_rbac_and_notifications.sql',
  'supabase/migrations/20261122120500_request_deletion_permanent.sql',
  'supabase/migrations/20261122121000_financial_approvals_workflow.sql',
  'supabase/migrations/20261122121500_payment_providers_and_checkout.sql',
];

const EVOLUTION_ROUTERS = [
  'server/modules/request-deletion/router.ts',
  'server/modules/financial-approvals/router.ts',
  'server/modules/payment-providers/router.ts',
  'server/modules/payment-checkout/router.ts',
];

function readAllEvolutionSql(): string {
  return EVOLUTION_MIGRATIONS.map((rel) => readFileSync(resolve(ROOT, rel), 'utf8')).join('\n\n');
}

function parsePublicFunctions(sql: string): Map<string, string[]> {
  const result = new Map<string, string[]>();
  const re = /CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+public\.([a-z0-9_]+)\s*\(([\s\S]*?)\)\s*RETURNS/gi;
  for (const match of sql.matchAll(re)) {
    const name = match[1];
    const paramsRaw = match[2].trim();
    const params: string[] = [];
    if (paramsRaw.length > 0) {
      for (const part of paramsRaw.split(',')) {
        const paramName = /^\s*([a-z0-9_]+)\s+/i.exec(part)?.[1];
        if (paramName) params.push(paramName);
      }
    }
    result.set(name, params);
  }
  return result;
}

function extractRouterRpcCalls(source: string): Array<{ fn: string; params: string[] }> {
  const calls: Array<{ fn: string; params: string[] }> = [];
  const re = /\.rpc\(\s*'([a-z0-9_]+)'\s*(?:,\s*\{([\s\S]*?)\})?\s*\)/g;
  for (const match of source.matchAll(re)) {
    const fn = match[1];
    const objBody = match[2] ?? '';
    const params: string[] = [];
    for (const pm of objBody.matchAll(/\b(p_[a-z0-9_]+)\s*:/g)) {
      params.push(pm[1]);
    }
    calls.push({ fn, params });
  }
  return calls;
}

test('IA 2 SQL Migrations: todos os RPCs e parâmetros chamados pelos 4 routers Express existem em public.* com SECURITY INVOKER e search_path vazio', () => {
  const sql = [readAllEvolutionSql(), readFileSync(resolve(ROOT,
    'supabase/migrations/20261122193331_cash_receiving_scope_and_provider_options.sql'), 'utf8')].join('\n\n');
  const publicFns = parsePublicFunctions(sql);

  let totalVerifiedCalls = 0;
  for (const rel of EVOLUTION_ROUTERS) {
    const src = readFileSync(resolve(ROOT, rel), 'utf8');
    const calls = extractRouterRpcCalls(src);
    assert.ok(calls.length > 0, `Esperava chamadas .rpc() em ${rel}`);
    for (const call of calls) {
      totalVerifiedCalls += 1;
      const sqlParams = publicFns.get(call.fn);
      assert.ok(sqlParams, `Função public.${call.fn} ausente nas migrations (chamada em ${rel})`);
      for (const p of call.params) {
        assert.ok(
          sqlParams.includes(p),
          `Parâmetro ${p} ausente em public.${call.fn}(${sqlParams.join(', ')}) (chamado em ${rel})`,
        );
      }
    }
  }
  assert.ok(totalVerifiedCalls >= 24, `Esperava >= 24 chamadas RPC verificadas, obteve ${totalVerifiedCalls}`);

  // Edge Function service_role RPCs also exist in public.*
  assert.ok(publicFns.has('request_deletion_claim_cleanup'));
  assert.ok(publicFns.has('request_deletion_complete_cleanup'));

  // Every checked function sets search_path = ''.
  const allFnHeaders = [...sql.matchAll(/CREATE(?:\s+OR\s+REPLACE)?\s+FUNCTION\s+(public|private)\.([a-z0-9_]+)\([\s\S]*?AS\s+\$\$/gi)];
  assert.ok(allFnHeaders.length >= 40);
  for (const m of allFnHeaders) {
    const schema = m[1];
    const name = m[2];
    const header = m[0];
    assert.match(header, /SET\s+search_path\s*=\s*''/i, `Função ${schema}.${name} sem SET search_path = ''`);
    if (schema === 'public') {
      assert.match(header, /SECURITY\s+INVOKER/i, `Wrapper public.${name} deve ser SECURITY INVOKER`);
    }
  }
});

test('IA 2 SQL Migrations: invariantes de segurança (tabelas privadas, RLS, REVOKE ALL, RBAC, sem DELETE storage.objects, service_role isolado)', () => {
  const sql = readAllEvolutionSql();

  // Zero executable SQL DELETE on storage.objects (strip single-line comments first)
  const sqlExecutable = sql.replace(/--[^\n]*/g, '');
  assert.doesNotMatch(sqlExecutable, /DELETE\s+FROM\s+storage\.objects/i);

  // Every CREATE TABLE is in private.* (never public.*)
  const tables = [...sql.matchAll(/CREATE\s+TABLE\s+([a-z0-9_]+)\.([a-z0-9_]+)/gi)];
  assert.equal(tables.length, 9, `Esperava 9 novas tabelas privadas, encontrou ${tables.length}`);
  for (const [, schema, table] of tables) {
    assert.equal(schema, 'private', `Tabela ${schema}.${table} deveria estar no schema private`);
  }

  // Every new table has RLS enabled and REVOKE ALL
  for (const t of [
    'request_deletion_operations',
    'financial_approvals',
    'payment_providers',
    'payment_pix_settings',
    'payment_online_card_settings',
    'payment_terminals',
    'payment_checkout_intents',
    'payment_webhook_events',
    'payment_provider_commands',
  ]) {
    assert.ok(
      sql.includes(`ALTER TABLE private.${t} ENABLE ROW LEVEL SECURITY`) || sql.includes(`'${t}'`),
      `RLS não encontrado para private.${t}`,
    );
  }
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /REVOKE ALL ON private\.request_deletion_operations FROM PUBLIC, anon, authenticated, service_role/);
  assert.match(sql, /REVOKE ALL ON private\.financial_approvals FROM PUBLIC, anon, authenticated, service_role/);

  // 4 RBAC permissions seeded idempotently
  for (const perm of [
    'requests.delete',
    'payments.manual.approve',
    'payments.providers.manage',
    'charges.discount.approve',
  ]) {
    assert.ok(sql.includes(`'${perm}'`), `Permissão ${perm} ausente na migration RBAC`);
  }
  assert.match(sql, /ON CONFLICT \(code\) DO NOTHING/i);

  // Service-role-only RPCs are NEVER granted to authenticated
  const authenticatedGrants = [...sql.matchAll(/GRANT\s+EXECUTE\s+ON\s+FUNCTION([^;]*?)TO\s+authenticated\s*;/gi)]
    .map((m) => m[1])
    .join('\n');
  for (const srvFn of [
    'request_deletion_claim_cleanup',
    'request_deletion_complete_cleanup',
    'payment_webhook_ingest',
    'payment_maintenance_sweep',
  ]) {
    assert.ok(!authenticatedGrants.includes(srvFn), `RPC service_role ${srvFn} não pode ser concedida a authenticated`);
  }

  // Schema alignment checks against existing tables (customers.name, profiles.display_name)
  assert.doesNotMatch(sql, /\bc\.full_name\b/);
  assert.doesNotMatch(sql, /\bm\.display_name\b/);
  assert.doesNotMatch(sql, /\bcand\.display_name\b/);
});

test('IA 2 Config: vercel.json cron e .env.example server-side sem valores secretos', () => {
  const vercel = JSON.parse(readFileSync(resolve(ROOT, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  assert.ok(Array.isArray(vercel.crons) && vercel.crons.length >= 1);
  assert.ok(vercel.crons.some((c) => c.path === '/api/payment-checkout/cron/reconcile'));

  const envExample = readFileSync(resolve(ROOT, '.env.example'), 'utf8');
  for (const key of [
    'SUPABASE_SERVICE_ROLE_KEY',
    'PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PSP_PIX_CARD',
    'PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_PIX_BANK',
    'PAYMENT_WEBHOOK_HMAC_SECRET_GENERIC_ACQUIRER_TERMINAL',
    'PAYMENT_RECONCILIATION_CRON_SECRET',
  ]) {
    const match = new RegExp(`^${key}=(.*)$`, 'm').exec(envExample);
    assert.ok(match, `Placeholder ${key}= ausente em .env.example`);
    assert.equal(match[1].trim(), '', `Placeholder ${key} em .env.example não pode conter valor`);
    assert.ok(!key.startsWith('VITE_'));
  }
});

test('Edge Function request-deletion-cleanup: autentica, remove anexos via Storage API e mantém falha parcial em storage_cleanup_failed', async () => {
  const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
  const OP_ID = '22222222-2222-4222-8222-222222222222';
  const FILE_OK = '33333333-3333-4333-8333-333333333333';
  const FILE_FAIL = '44444444-4444-4444-8444-444444444444';

  // Path validation rejects traversal & foreign buckets
  assert.equal(
    isSafeCleanupObject({
      file_id: FILE_OK,
      bucket: 'request-attachments',
      object_path: `${OFFICE_ID}/req/file.pdf`,
    }),
    true,
  );
  assert.equal(
    isSafeCleanupObject({
      file_id: FILE_OK,
      bucket: 'request-attachments',
      object_path: `${OFFICE_ID}/../secret.pdf`,
    }),
    false,
  );
  assert.equal(
    isSafeCleanupObject({
      file_id: FILE_OK,
      bucket: 'other-bucket',
      object_path: `${OFFICE_ID}/req/file.pdf`,
    }),
    false,
  );

  const removedPaths: string[] = [];
  const completeCalls: Array<Record<string, unknown>> = [];
  let failSecond = false;

  const mockAdmin: CleanupAdminClient = {
    async rpc(fn, args) {
      if (fn === 'request_deletion_claim_cleanup') {
        return {
          data: [
            {
              operation_id: OP_ID,
              office_id: OFFICE_ID,
              request_id: OFFICE_ID,
              protocol: 'JN-2026-000100',
              objects: [
                { file_id: FILE_OK, bucket: 'request-attachments', object_path: `${OFFICE_ID}/ok.pdf` },
                { file_id: FILE_FAIL, bucket: 'request-attachments', object_path: `${OFFICE_ID}/fail.pdf` },
              ],
            },
          ],
          error: null,
        };
      }
      if (fn === 'request_deletion_complete_cleanup') {
        completeCalls.push(args ?? {});
        const failedCount = Number(args?.p_failed_count ?? 0);
        return {
          data: {
            operation_id: OP_ID,
            status: failedCount === 0 ? 'completed' : 'storage_cleanup_failed',
          },
          error: null,
        };
      }
      return { data: null, error: { message: 'unknown rpc' } };
    },
    storage: {
      from() {
        return {
          async remove(paths: string[]) {
            if (failSecond && paths[0].includes('fail.pdf')) {
              return { data: null, error: { message: 'storage timeout' } };
            }
            removedPaths.push(...paths);
            return { data: paths, error: null };
          },
        };
      },
    },
  };

  const handler = createRequestDeletionCleanupHandler({
    url: 'https://example.supabase.co',
    anonKey: 'anon-key',
    serviceRoleKey: 'service-role-key',
    cronSecret: 'super-secret-cron-token-2026',
    createAdminClient: () => mockAdmin,
  });

  // 405 on GET
  assert.equal((await handler(new Request('https://fn.local/', { method: 'GET' }))).status, 405);
  // 401 without Authorization
  assert.equal((await handler(new Request('https://fn.local/', { method: 'POST' }))).status, 401);
  // 422 on invalid office_id
  const badBody = await handler(
    new Request('https://fn.local/', {
      method: 'POST',
      headers: { Authorization: 'Bearer super-secret-cron-token-2026' },
      body: JSON.stringify({ office_id: 'not-a-uuid' }),
    }),
  );
  assert.equal(badBody.status, 422);

  // Full cleanup -> completed
  failSecond = false;
  const okRes = await handler(
    new Request('https://fn.local/', {
      method: 'POST',
      headers: { Authorization: 'Bearer super-secret-cron-token-2026' },
      body: JSON.stringify({ office_id: OFFICE_ID }),
    }),
  );
  assert.equal(okRes.status, 200);
  const okJson = (await okRes.json()) as { data: { processed_operations: number; results: Array<{ result: { status: string } }> } };
  assert.equal(okJson.data.processed_operations, 1);
  assert.equal(okJson.data.results[0].result.status, 'completed');
  assert.equal(removedPaths.length, 2);
  assert.equal(completeCalls[0].p_failed_count, 0);

  // Partial failure -> storage_cleanup_failed (never false success)
  failSecond = true;
  const partialRes = await handler(
    new Request('https://fn.local/', {
      method: 'POST',
      headers: { Authorization: 'Bearer super-secret-cron-token-2026' },
      body: '{}',
    }),
  );
  assert.equal(partialRes.status, 200);
  const partialJson = (await partialRes.json()) as { data: { results: Array<{ failed_count: number; result: { status: string } }> } };
  assert.equal(partialJson.data.results[0].failed_count, 1);
  assert.equal(partialJson.data.results[0].result.status, 'storage_cleanup_failed');
  assert.deepEqual(completeCalls[1].p_removed_file_ids, [FILE_OK]);
});
