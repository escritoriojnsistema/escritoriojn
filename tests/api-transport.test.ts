import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import handler from '../api/[...path].ts';

test('Function Express atende POST público sem persistência e rejeita entradas inválidas', async (t) => {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = (body: string, type = 'application/json') => fetch(`${base}/api/validate`, { method: 'POST', headers: { 'Content-Type': type }, body });
  const valid = await post(JSON.stringify({ message: 'teste de transporte' }));
  assert.equal(valid.status, 200);
  assert.deepEqual(await valid.json(), { data: { valid: true } });
  for (const body of [{}, [], { message: '' }, { message: '   ' }, { message: 5 }, { message: 'x'.repeat(121) }, { message: 'ok', extra: true }]) {
    const response = await post(JSON.stringify(body));
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'VALIDATION_ERROR');
  }
  for (const [body, type, status, code] of [
    ['{invalid', 'application/json', 400, 'INVALID_JSON'],
    ['x'.repeat(1100), 'application/json', 413, 'PAYLOAD_TOO_LARGE'],
    ['mensagem', 'text/plain', 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ] as const) {
    const response = await post(body, type);
    assert.equal(response.status, status);
    assert.match(response.headers.get('content-type') ?? '', /application\/json/);
    const result = await response.json();
    assert.equal(result.error.code, code);
    assert.equal(result.error.request_id, response.headers.get('x-request-id'));
    assert.ok(!JSON.stringify(result).includes(body));
  }
});
