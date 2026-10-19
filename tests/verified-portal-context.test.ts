import test from 'node:test';
import assert from 'node:assert/strict';
import type { Session } from '@supabase/supabase-js';
import type { AccessResponse } from '../shared/access.ts';
import { rememberVerifiedPortal, consumeVerifiedPortal } from '../src/features/auth/verifiedPortalContext.ts';

const uid = '22222222-2222-4222-8222-222222222222';
const sid = '33333333-3333-4333-8333-333333333333';
function session(user = uid, sessionId = sid, suffix = 'verified'): Session {
  return { user: { id: user }, access_token: `e30.${Buffer.from(JSON.stringify({ sub: user, session_id: sessionId })).toString('base64url')}.${suffix}`, refresh_token: 'local-refresh' } as Session;
}
function response(role: 'owner' | 'client' = 'owner'): AccessResponse {
  return { data: { user: { id: uid }, contexts: [{ office_id: sid, user_id: uid, role_code: role, permissions: ['foundation.access'], office_name: 'Teste local', display_name: null }] } };
}

test('contexto verificado passa uma única vez para a exata sessão e portal', () => {
  const proof = response();
  rememberVerifiedPortal(session(), 'team', proof);
  assert.deepEqual(consumeVerifiedPortal(session(), 'team'), proof.data.contexts);
  assert.equal(consumeVerifiedPortal(session(), 'team'), undefined);
});

test('handoff recusa UID, session_id, token, refresh token e portal diferentes', () => {
  for (const candidate of [session('44444444-4444-4444-8444-444444444444'), session(uid, '55555555-5555-4555-8555-555555555555'), session(uid, sid, 'rotated'), { ...session(), refresh_token: 'different' }]) {
    rememberVerifiedPortal(session(), 'team', response());
    assert.equal(consumeVerifiedPortal(candidate, 'team'), undefined);
    assert.equal(consumeVerifiedPortal(session(), 'team'), undefined);
  }
  rememberVerifiedPortal(session(), 'team', response());
  assert.equal(consumeVerifiedPortal(session(), 'client'), undefined);
});

test('apenas resposta validada da identidade e área corretas pode ser entregue', () => {
  for (const proof of [null, {}, response('client'), { data: { ...response().data, user: { id: sid } } }]) {
    rememberVerifiedPortal(session(), 'team', proof);
    assert.equal(consumeVerifiedPortal(session(), 'team'), undefined);
  }
  const proof = response('client');
  rememberVerifiedPortal(session(), 'client', proof);
  assert.deepEqual(consumeVerifiedPortal(session(), 'client'), proof.data.contexts);
});

test('handoff cancelado, vencido ou substituído não reaparece', context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const cancelOld = rememberVerifiedPortal(session(), 'team', response());
  rememberVerifiedPortal(session(), 'team', response());
  cancelOld();
  assert.ok(consumeVerifiedPortal(session(), 'team'));
  const cancel = rememberVerifiedPortal(session(), 'team', response());
  cancel();
  assert.equal(consumeVerifiedPortal(session(), 'team'), undefined);
  rememberVerifiedPortal(session(), 'team', response());
  context.mock.timers.tick(15_001);
  assert.equal(consumeVerifiedPortal(session(), 'team'), undefined);
});
