import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationSession } from '../src/features/auth/invitationCallback.ts';

test('sessão implicit só é reconhecida para convite UUID e par de tokens único',()=>{
  const id='00000000-0000-4000-a000-000000000002';
  const fragment='#access_token=local-test.token.value&refresh_token=local-refresh&token_type=bearer&type=invite';
  assert.equal(invitationSession(new URLSearchParams(),fragment),null);
  assert.equal(invitationSession(new URLSearchParams('invite=arbitrary'),fragment),null);
  assert.equal(invitationSession(new URLSearchParams(`invite=${id}&invite=${id}`),fragment),null);
  assert.equal(invitationSession(new URLSearchParams(`invite=${id}`),fragment+'&access_token=second'),null);
  assert.equal(invitationSession(new URLSearchParams(`invite=${id}`),'#access_token=one'),null);
  assert.equal(invitationSession(new URLSearchParams(`invite=${id}&code=also-code`),fragment),null);
  assert.deepEqual(invitationSession(new URLSearchParams(`invite=${id}`),fragment),{id,access_token:'local-test.token.value',refresh_token:'local-refresh'});
});
