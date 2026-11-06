import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import express from 'express';
import { categoriesRouter } from '../server/modules/categories/router.js';
import { validCategoryCommand } from '../shared/categories.js';
import { categoriesState } from '../server/modules/categories/dto.js';

const office = '00000000-0000-4000-e000-000000000731';
const id = '00000000-0000-4000-a000-000000000731';
const key = '00000000-0000-4000-c000-000000000731';
const category = { id, name: 'Rural', revision: 1, is_documents: false, created_at: '2026-11-02T14:00:00.000Z', services: 2 };

test('categorias: comandos estritos exigem motivo e versão, sem autoridade do navegador', () => {
  assert.equal(validCategoryCommand({ kind: 'create', name: 'Rural', execution_level:3, reason: 'Organizar catálogo' }), true);
  assert.equal(validCategoryCommand({ kind: 'rename', category_id: id, expected_revision: 1, name: 'Rural e imóveis', execution_level:2, reason: 'Ajustar rótulo' }), true);
  assert.equal(validCategoryCommand({ kind: 'delete', category_id: id, expected_revision: 1, reason: 'Sem uso' }), true);
  for (const command of [
    { kind: 'create', name: 'Rural' }, { kind: 'create', name: '', reason: 'Teste' },
    { kind: 'create', name: 'Rural', reason: '' }, { kind: 'create', name: 'Rural\nFiscal', reason: 'Teste' },
    { kind: 'create', name: 'Rural', reason: 'Teste', actor_id: id },
    { kind: 'rename', category_id: id, expected_revision: 0, name: 'Rural', reason: 'Teste' },
    { kind: 'delete', category_id: id, expected_revision: 1.5, reason: 'Teste' },
    { kind: 'delete', category_id: id, expected_revision: 2147483646, reason: 'Teste' },
  ]) assert.equal(validCategoryCommand(command), false, JSON.stringify(command));
});

test('categorias: projeção retém apenas metadados necessários e rejeita fonte inválida', () => {
  assert.deepEqual(categoriesState({ can_manage: false, items: [{ ...category, private_notes: 'segredo' }], actor_id: id }), {
    can_manage: false, items: [{ id, name: 'Rural', revision: 1, is_documents: false }],
  });
  assert.deepEqual(categoriesState({ can_manage: true, items: [category] }), { can_manage: true, items: [category] });
  for (const value of [
    { can_manage: true, items: [{ ...category, services: '2' }] },
    { can_manage: false, items: [{ ...category, is_documents: null }] },
    { can_manage: false, items: [category, category] },
    { can_manage: false, items: [{ ...category, revision: '1' }] },
  ]) assert.throws(() => categoriesState(value));
});

test('categorias: API autenticada preserva chave e mapeia erros sem expor detalhes privados', async t => {
  let mode = 'ok';
  const calls: { url: string; body: Record<string, unknown>; authorization?: string }[] = [];
  const provider = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    calls.push({ url: req.url ?? '', body: raw ? JSON.parse(raw) : {}, authorization: req.headers.authorization });
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') { res.end(JSON.stringify({ id, aud: 'authenticated' })); return; }
    if (mode !== 'ok' && mode !== 'malformed') {
      const errors: Record<string, [number, string]> = { forbidden: [403, 'CATEGORIES_FORBIDDEN'], in_use: [409, 'CATEGORY_IN_USE'], conflict: [409, 'CATEGORY_CONFLICT'], validation: [422, 'CATEGORIES_VALIDATION'], internal: [500, 'SQL private secret'] };
      const [status, message] = errors[mode]; res.statusCode = status;
      res.end(JSON.stringify({ code: `PT${status}`, message })); return;
    }
    res.end(JSON.stringify({ can_manage: true, items: [{ ...category, revision: mode === 'malformed' ? '1' : 1 }], private: 'secret' }));
  });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  const previous = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test';
  const app = express(); app.use('/api/categories', categoriesRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/categories`;
  const headers = { Authorization: 'Bearer categories-test-token', 'Content-Type': 'application/json' };
  const send = (path: string, body: unknown) => fetch(base + path, { method: 'POST', headers, body: JSON.stringify(body) });
  const command = { office_id: office, command: { kind: 'rename', category_id: id, expected_revision: 1, name: 'Rural e imóveis', execution_level:2, reason: 'Organizar catálogo' }, idempotency_key: key };
  try {
    await t.test('anônimo negado e Bearer preservado até a fonte oficial', async () => {
      assert.equal((await fetch(base + '/state', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ office_id: office }) })).status, 401);
      assert.equal(calls.length, 0);
      const response = await send('/state', { office_id: office });
      assert.equal(response.status, 200); assert.match(response.headers.get('cache-control') ?? '', /private.*no-store/);
      assert.deepEqual(calls.map(call => call.url), ['/auth/v1/user', '/rest/v1/rpc/service_categories_state']);
      assert.ok(calls.every(call => call.authorization === 'Bearer categories-test-token'));
      assert.equal((await response.json()).data.private, undefined);
    });
    await t.test('idempotência pertence ao chamador e não muda no retry', async () => {
      for (let attempt = 0; attempt < 2; attempt++) {
        assert.equal((await send('/command', command)).status, 200);
        assert.deepEqual(calls.at(-1)?.body, { p_office_id: office, p_command: command.command, p_idempotency_key: key });
      }
    });
    await t.test('corpo estrito rejeita chave/autoridade/categoria forjados antes da RPC', async () => {
      for (const body of [{ ...command, actor_id: id }, { ...command, idempotency_key: 'inválida' }, { ...command, command: { ...command.command, reason: '' } }, { ...command, command: { ...command.command, expected_revision: '1' } }]) {
        const before = calls.length; assert.equal((await send('/command', body)).status, 422);
        assert.equal(calls.length, before + 1);
      }
      assert.equal((await send('/state?office_id=forged', { office_id: office })).status, 422);
    });
    await t.test('403, conflito, uso, validação e indisponibilidade são seguros', async () => {
      for (const [value, status] of [['forbidden', 403], ['in_use', 409], ['conflict', 409], ['validation', 422], ['internal', 503], ['malformed', 503]] as const) {
        mode = value; const response = await send('/command', command); assert.equal(response.status, status);
        const text = await response.text(); assert.ok(!text.includes('SQL private'));
        if (value === 'in_use') assert.match(text, /histórico de serviços/);
      }
    });
  } finally {
    for (const [i, name] of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].entries()) if (previous[i] === undefined) delete process.env[name]; else process.env[name] = previous[i];
    server.closeAllConnections(); server.close(); provider.closeAllConnections(); provider.close();
  }
});
