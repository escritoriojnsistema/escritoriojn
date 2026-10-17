import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { app } from '../server/app.ts';

test('API pública: health real sem configuração e rota desconhecida segura', async (t) => {
  const server = createServer(app);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())));
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const health = await fetch(`${url}/api/health`);
  assert.equal(health.status, 200);
  assert.match(health.headers.get('content-type') ?? '', /application\/json/);
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.equal(health.headers.get('x-powered-by'), null);
  assert.deepEqual(await health.json(), { data: { status: 'ok', service: 'escritorio-jn-api' } });
  for (const path of ['/api', '/api/inexistente']) {
    const response = await fetch(`${url}${path}`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.error.code, 'NOT_FOUND');
    assert.equal(body.error.request_id, response.headers.get('x-request-id'));
    assert.match(body.error.request_id, /^[a-f0-9-]{36}$/);
  }
  const post = await fetch(`${url}/api/health`, { method: 'POST' });
  assert.equal(post.status, 404);
  assert.equal((await post.json()).error.code, 'NOT_FOUND');
});
