import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';

test('login da equipe exige prova antes de consultar o histórico de convite', async () => {
  const invite = '11111111-1111-4111-8111-111111111111';
  const email = 'fixture@example.test';
  const password = 'test-password';
  const serviceKey = 'fixture-server-key-only';
  const calls: { path: string; auth?: string; body: unknown }[] = [];
  let providerCode = 'email_not_confirmed';
  const provider = createServer(async (req, res) => {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    calls.push({ path: req.url!, auth: req.headers.authorization, body: JSON.parse(raw) });
    res.setHeader('Content-Type', 'application/json');
    if (req.url?.startsWith('/auth/v1/token')) {
      res.statusCode = 400;
      res.setHeader('x-supabase-api-version', '2024-01-01');
      res.end(JSON.stringify({ code: providerCode, msg: 'provider detail' }));
    } else {
      res.end(JSON.stringify('invitation_expired'));
    }
  });
  await new Promise<void>(resolve => provider.listen(0, '127.0.0.1', resolve));
  const saved = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY, process.env.SUPABASE_SERVICE_ROLE_KEY];
  const names = ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_test_fixture';
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const send = (body: unknown) => fetch(`http://127.0.0.1:${(server.address() as { port: number }).port}/api/auth/team-login-guidance`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  try {
    assert.equal((await send({ email })).status, 422);
    assert.equal(calls.length, 0);
    const expired = await send({ email, password });
    assert.equal(expired.status, 200);
    assert.match(expired.headers.get('cache-control') ?? '', /no-store/);
    assert.deepEqual(await expired.json(), { guidance: 'invitation_expired' });
    assert.deepEqual(calls.map(c => c.path), ['/auth/v1/token?grant_type=password', '/rest/v1/rpc/team_login_guidance']);
    assert.deepEqual(calls[1].body, { p_email: email, p_invitation_id: null });
    assert.equal(calls[1].auth, 'Bearer ' + serviceKey);

    calls.length = 0;
    providerCode = 'invalid_credentials';
    const denied = await send({ email, password });
    assert.deepEqual(await denied.json(), { guidance: 'unavailable' });
    assert.equal(calls.length, 1);

    calls.length = 0;
    const link = await send({ email, invitation_id: invite });
    assert.deepEqual(await link.json(), { guidance: 'invitation_expired' });
    assert.deepEqual(calls.map(c => c.path), ['/rest/v1/rpc/team_login_guidance']);
    assert.deepEqual(calls[0].body, { p_email: email, p_invitation_id: invite });
  } finally {
    await Promise.all([new Promise<void>(resolve => server.close(() => resolve())), new Promise<void>(resolve => provider.close(() => resolve()))]);
    names.forEach((name, index) => {
      if (saved[index] === undefined) delete process.env[name]; else process.env[name] = saved[index];
    });
  }
});
