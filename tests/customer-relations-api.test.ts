import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import { assignablePermissions, permissionNames } from '../shared/team.js';
import { permissions } from '../server/modules/team/validation.js';

const office = '00000000-0000-4000-b000-000000000001';
const id = '00000000-0000-4000-a000-000000000002';
const target = '00000000-0000-4000-a000-000000000003';
const date = '2026-10-20T12:00:00Z';
const summary = { id, kind: 'person', name: 'Pessoa fictícia', identifier_masked: '***.***.***-25', created_at: date, version: 2 };
const relation = { id, version: 1, created_at: date, created_by: id, revoked_at: null, revoked_by: null, name: 'Pessoa fictícia' };
const state = {
  customer: summary, capabilities: { can_relate: true, can_verify: true, can_merge: true },
  assignments: [{ ...relation, membership_id: id, valid_from: date, valid_until: null, status: 'active' }],
  representations: [{ ...relation, representative_customer_id: target, kind: 'proxy', evidence: 'Referência privada', valid_from: date, valid_until: null, status: 'active', authorization_status: 'valid', grants_customer_access: false, portal_enabled: false }],
  identities: [{ ...relation, membership_id: id, evidence: 'Referência privada', status: 'verified', portal_enabled: false }],
  merges: [{ id, source_id: id, target_id: target, source_snapshot_id: id, target_snapshot_id: id, result_snapshot_id: id, created_at: date, actor_id: id }],
  truncated: { assignments: false, representations: false, identities: false, merges: false }, portal_enabled: false, access_lost: false,
};
const preview = { source: summary, target: { ...summary, id: target }, expected: { name: summary.name, kind: 'person', identifier_masked: summary.identifier_masked, contact_count: 1, copies_identifier: false, transfers_authority: false }, conflicts: [], can_merge: true, portal_enabled: false };
const command = { office_id: office, customer_id: id, action: 'assignment.grant', payload: { membership_id: id, valid_from: date, valid_until: null } };
const merge = { office_id: office, source_id: id, target_id: target, source_version: 2, target_version: 2, evidence: 'Referência privada', confirm: true };

test('API08 autentica uma vez, limita entradas e publica somente o contrato autorizado', async t => {
  const calls: { path: string; body: Record<string, unknown>; authorization: string | undefined }[] = [];
  let responseValue: unknown;
  let providerError: { code: string; message: string } | undefined;
  let authFailure = false;
  const provider = createServer(async (req, res) => {
    let raw = ''; for await (const part of req) raw += part;
    const body = raw ? JSON.parse(raw) : {};
    calls.push({ path: req.url!, body, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      if (authFailure) { res.statusCode = 401; res.end('{"code":"bad_jwt","msg":"expired"}'); return; }
      res.end(JSON.stringify({ id, aud: 'authenticated', role: 'authenticated', user_metadata: { role: 'owner' }, app_metadata: {} })); return;
    }
    if (providerError) { res.statusCode = 400; res.end(JSON.stringify({ ...providerError, details: 'private SQL 52998224725', hint: 'secret@example.test' })); return; }
    const name = req.url?.split('/').at(-1);
    const data = name === 'customer_relation_candidates' ? { kind: body.p_kind, items: [{ id, name: 'Pessoa fictícia', kind: body.p_kind === 'customers' ? 'person' : body.p_kind === 'client' ? 'client' : 'employee', contact_masked: body.p_kind === 'customers' ? null : 'p***@***', identifier_masked: body.p_kind === 'customers' ? summary.identifier_masked : null }], limit: 20 }
      : name === 'customer_merge_preview' ? preview : name === 'customer_merge' ? { merge_id: id, source_id: id, target_id: target, target_version: 2, state: { ...state, customer: { ...summary, id: target } } } : state;
    res.end(JSON.stringify(responseValue === undefined ? data : responseValue));
  });
  await new Promise<void>(r => provider.listen(0, '127.0.0.1', r));
  const old = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_fixture';
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(r => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/customer-relations`;
  const headers = { Authorization: 'Bearer verified-test-token', 'Content-Type': 'application/json' };
  const send = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const read = { office_id: office, customer_id: id };
  try {
    await t.test('anônimo e cookie não consultam o provedor; respostas são privadas', async () => {
      calls.length = 0;
      for (const path of ['/state', '/candidates', '/command', '/merge/preview', '/merge']) {
        const response = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: 'forged=session' }, body: '{}' });
        assert.equal(response.status, 401);
        assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
        assert.match(response.headers.get('vary') ?? '', /Authorization/);
      }
      assert.equal(calls.length, 0);
    });
    await t.test('cinco rotas mapeiam RPC exata com mesmo Bearer e request_id somente servidor', async () => {
      for (const [path, body, rpc] of [
        ['/state', read, 'customer_relations_state'], ['/candidates', { office_id: office, kind: 'team', query: 'pessoa@example.test' }, 'customer_relation_candidates'],
        ['/command', command, 'customer_relation_command'], ['/merge/preview', { office_id: office, source_id: id, target_id: target }, 'customer_merge_preview'], ['/merge', merge, 'customer_merge'],
      ] as const) {
        calls.length = 0; const response = await send(path, body); assert.equal(response.status, 200, path); await response.json();
        assert.deepEqual(calls.map(c => c.path), ['/auth/v1/user', `/rest/v1/rpc/${rpc}`]);
        assert.ok(calls.every(c => c.authorization === headers.Authorization));
        const expected: Record<string, unknown> = Object.fromEntries(Object.entries(body).map(([key, value]) => [`p_${key}`, value]));
        if (path === '/merge' || path === '/command') { assert.match(String(calls[1].body.p_request_id), /^[0-9a-f-]{36}$/); expected.p_request_id = calls[1].body.p_request_id; }
        assert.deepEqual(calls[1].body, expected);
        assert.ok(calls.every(c => !c.path.includes('example.test') && !c.path.includes('Referência')));
      }
    });
    await t.test('todos os seis comandos preservam payload e normalizam evidência privada', async () => {
      for (const [action, payload] of [
        ['assignment.grant', command.payload], ['assignment.revoke', { id, version: 1 }],
        ['representation.grant', { representative_customer_id: target, kind: 'guardian', evidence: ' Referência privada ', valid_from: '2024-02-29T23:59:59.123456-03:00', valid_until: '2024-03-01T03:00:00Z' }],
        ['representation.revoke', { id, version: 1 }], ['identity.verify', { membership_id: id, evidence: ' Referência privada ' }], ['identity.revoke', { id, version: 1 }],
      ]) {
        const response = await send('/command', { ...read, action, payload }); assert.equal(response.status, 200);
        assert.deepEqual(calls.at(-1)!.body.p_payload, { ...(payload as object), ...('evidence' in (payload as object) ? { evidence: 'Referência privada' } : {}) });
      }
    });
    await t.test('whitelist recursiva remove contatos, snapshots e evidência de merge dos DTOs', async () => {
      const extra = { identifier: '52998224725', email: 'secret@example.test', contacts: [{ value: 'secret@example.test' }], private: 'secret' };
      responseValue = { ...state, ...extra, customer: { ...summary, ...extra }, capabilities: { ...state.capabilities, ...extra }, truncated: { ...state.truncated, ...extra }, assignments: state.assignments.map(x => ({ ...x, ...extra })), representations: state.representations.map(x => ({ ...x, ...extra })), identities: state.identities.map(x => ({ ...x, ...extra })), merges: state.merges.map(x => ({ ...x, ...extra, evidence: 'merge evidence', snapshot: extra })) };
      assert.deepEqual((await (await send('/state', read)).json()).data, state);
      for (const kind of ['team', 'client', 'customers']) {
        const item = { id, name: 'Pessoa fictícia', kind: kind === 'customers' ? 'person' : kind === 'client' ? 'client' : 'employee', contact_masked: kind === 'customers' ? null : 'p***@***', identifier_masked: kind === 'customers' ? summary.identifier_masked : null };
        responseValue = { kind, items: [{ ...item, ...extra, evidence: 'private identity evidence' }], limit: 20, ...extra };
        assert.deepEqual((await (await send('/candidates', { office_id: office, kind, query: '' })).json()).data, { kind, items: [item], limit: 20 });
      }
      responseValue = { kind: 'team', items: [{ id, name: 'Pessoa fictícia', kind: 'employee', contact_masked: '****@***', identifier_masked: null }], limit: 20 };
      assert.equal((await send('/candidates', { office_id: office, kind: 'team', query: '' })).status, 200);
      responseValue = { ...preview, ...extra, evidence: 'private merge evidence', source: { ...summary, ...extra }, target: { ...preview.target, ...extra }, expected: { ...preview.expected, ...extra } };
      assert.deepEqual((await (await send('/merge/preview', { office_id: office, source_id: id, target_id: target })).json()).data, preview);
      responseValue = undefined;
    });
    await t.test('entrada inválida nunca chega à RPC, inclusive autoridade e datas normalizadas silenciosamente', async () => {
      const invalid: [string, unknown][] = [
        ['/state', { ...read, actor_id: id }], ['/state', { ...read, request_id: id }], ['/state', { ...read, office_id: 'bad' }], ['/state', []],
        ['/candidates', { office_id: office, kind: 'owner', query: '' }], ['/candidates', { office_id: office, kind: 'team', query: 'x'.repeat(121) }], ['/candidates', { office_id: office, kind: 'team', query: '\nsecret' }],
        ['/candidates', { office_id: office, kind: { toString: null }, query: '' }],
        ['/command', { ...command, action: 'permissions.grant' }], ['/command', { ...command, payload: { ...command.payload, permissions: ['customers.merge'] } }], ['/command', { ...command, payload: { ...command.payload, actor_id: id } }],
        ['/command', { ...command, payload: { membership_id: id, valid_from: date } }], ['/command', { ...command, payload: { ...command.payload, membership_id: 'bad' } }],
        ...['2026-02-29T00:00:00Z', '2024-02-30T00:00:00Z', '2026-04-31T00:00:00Z', '2026-13-01T00:00:00Z', '2026-10-20', '2026-10-20T12:00:00', '2026-10-20T24:00:00Z', '2026-10-20T12:00:60Z', '2026-10-20T12:00:00.1234567Z', '0000-01-01T00:00:00Z'].map(d => ['/command', { ...command, payload: { ...command.payload, valid_from: d } }] as [string, unknown]),
        ['/command', { ...command, payload: { ...command.payload, valid_until: date } }],
        ...[0, -1, 1.5, '1', 2147483647, null].map(version => ['/command', { ...read, action: 'identity.revoke', payload: { id, version } }] as [string, unknown]),
        ...['', ' ', 'x'.repeat(501), 'private\nreference'].map(evidence => ['/command', { ...read, action: 'identity.verify', payload: { membership_id: id, evidence } }] as [string, unknown]),
        ['/command', { ...read, action: 'representation.grant', payload: { representative_customer_id: target, kind: 'owner', evidence: 'ok', valid_from: date, valid_until: null } }],
        ['/merge', { ...merge, confirm: false }], ['/merge', { ...merge, confirm: 'true' }], ['/merge', { ...merge, target_version: 0 }], ['/merge', { ...merge, source_version: '2' }], ['/merge', { ...merge, evidence: '' }], ['/merge', { ...merge, actor_id: id }],
      ];
      calls.length = 0;
      for (const [path, body] of invalid) assert.equal((await send(path, body)).status, 422, JSON.stringify(body));
      assert.equal((await send('/state?query=52998224725', read)).status, 422);
      assert.equal((await send('/command?evidence=secret', command)).status, 422);
      assert.ok(calls.every(c => c.path === '/auth/v1/user'));
      assert.equal((await fetch(base + '/candidates', { headers })).status, 404);
    });
    await t.test('JSON estrito, tipo e limite de 4kb não chegam à RPC', async () => {
      calls.length = 0;
      for (const [body, type, status] of [['{', 'application/json', 400], ['null', 'application/json', 400], ['true', 'application/json', 400], ['{}', 'text/plain', 415], [JSON.stringify({ padding: 'x'.repeat(4200) }), 'application/json', 413]] as const) {
        assert.equal((await fetch(base + '/state', { method: 'POST', headers: { ...headers, 'Content-Type': type }, body })).status, status);
      }
      assert.ok(calls.every(c => c.path === '/auth/v1/user'));
    });
    await t.test('erros conhecidos exigem par código/mensagem; SQL e dados pessoais ficam ocultos', async () => {
      for (const [code, message, status] of [['PT401', 'AUTH_REQUIRED', 401], ['PT403', 'CUSTOMERS_FORBIDDEN', 403], ['PT404', 'CUSTOMER_NOT_FOUND', 404], ['PT409', 'CUSTOMER_CONFLICT', 409], ['PT422', 'CUSTOMERS_VALIDATION', 422], ['42501', 'permission denied private SQL', 403], ['PT403', 'CUSTOMER_CONFLICT', 503], ['XX000', 'private SQL 52998224725', 503], ['PT409', 'secret@example.test', 503]] as const) {
        providerError = { code, message }; calls.length = 0;
        const response = await send('/merge', merge); assert.equal(response.status, status);
        const raw = JSON.stringify(await response.json()); assert.ok(!/private SQL|52998224725|secret@example.test/.test(raw));
        assert.equal(calls.length, 2);
      }
      providerError = undefined; authFailure = true; calls.length = 0;
      assert.equal((await send('/state', read)).status, 401); assert.equal(calls.length, 1); authFailure = false;
    });
    await t.test('DTO inesperado é 503, inclusive máscaras, datas e estado terminal inseguro', async () => {
      for (const value of [null, [], { ...state, customer: { ...summary, version: 0 } }, { ...state, customer: { ...summary, created_at: '2026-02-30T00:00:00Z' } }, { ...state, portal_enabled: true }, { ...state, access_lost: true }, { ...state, identities: [{ ...state.identities[0], evidence: '' }] }, { ...state, representations: [{ ...state.representations[0], grants_customer_access: true }] }]) {
        responseValue = value; assert.equal((await send('/state', read)).status, 503);
      }
      for (const value of [{ kind: 'team', items: [{ id, name: 'Pessoa', kind: 'employee', contact_masked: 'secret@example.test', identifier_masked: null }], limit: 20 }, { kind: 'team', items: [], limit: 21 }, { kind: 'client', items: [], limit: 20 }]) {
        responseValue = value; assert.equal((await send('/candidates', { office_id: office, kind: 'team', query: '' })).status, 503);
      }
      responseValue = { ...preview, expected: { ...preview.expected, transfers_authority: true } };
      assert.equal((await send('/merge/preview', { office_id: office, source_id: id, target_id: target })).status, 503);
      responseValue = { merge_id: id, source_id: id, target_id: target, target_version: 999, state };
      assert.equal((await send('/merge', merge)).status, 503); responseValue = undefined;
    });
    await t.test('autorrevogação confirma sucesso com access_lost e estado seguro sem refetch', async () => {
      responseValue = { ...state, capabilities: { can_relate: false, can_verify: false, can_merge: false }, assignments: [], representations: [], identities: [], merges: [], access_lost: true };
      calls.length = 0;
      const response = await send('/command', { ...read, action: 'assignment.revoke', payload: { id, version: 1 } });
      assert.equal(response.status, 200); assert.deepEqual((await response.json()).data, responseValue); assert.equal(calls.length, 2);
      responseValue = undefined;
    });
  } finally {
    for (const [index, name] of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].entries()) {
      if (old[index] === undefined) delete process.env[name]; else process.env[name] = old[index];
    }
    server.closeAllConnections(); server.close(); provider.closeAllConnections(); provider.close();
  }
});

test('capacidades08 são explicitamente atribuíveis sem padrão implícito ou ampliação por payload', () => {
  for (const permission of ['customers.relate', 'customers.verify', 'customers.merge'] as const) {
    assert.ok((assignablePermissions as readonly string[]).includes(permission));
    assert.ok(permissions(['foundation.access', permission]));
    assert.ok(permissionNames[permission as keyof typeof permissionNames].length > 10);
    assert.equal(permissions([permission]), false);
  }
  assert.equal(permissions(['foundation.access', 'customers.merge', 'customers.merge']), false);
  assert.equal(permissions(['foundation.access', 'customers.admin']), false);
});
