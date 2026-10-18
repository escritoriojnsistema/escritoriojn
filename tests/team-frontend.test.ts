import test from 'node:test';
import assert from 'node:assert/strict';
import { validCpf, validFullName, invitationRoles, invitationLink } from '../src/features/team/validation.ts';

test('conferência de identidade rejeita CPF repetido ou dígito errado e nome incompleto', () => {
  assert.equal(validCpf('529.982.247-25'), true);
  assert.equal(validCpf('52998224724'), false);
  assert.equal(validCpf('11111111111'), false);
  assert.equal(validCpf('529982247'), false);
  assert.equal(validFullName('Ana Maria de Souza'), true);
  assert.equal(validFullName('Ana'), false);
});

test('users.manage não oferece criação de proprietário sem delegação específica', () => {
  const scope = { role_code: 'admin' as const, allowed_roles: ['employee', 'admin', 'owner'] as const, allowed_permissions: ['foundation.access'] as const, can_create_owner: false, can_delegate: false };
  assert.deepEqual(invitationRoles({ ...scope, allowed_roles: [...scope.allowed_roles], allowed_permissions: [...scope.allowed_permissions] }), ['employee', 'admin']);
  assert.deepEqual(invitationRoles({ ...scope, allowed_roles: [...scope.allowed_roles], allowed_permissions: [...scope.allowed_permissions], can_create_owner: true }), ['employee', 'admin', 'owner']);
});

test('link copiável de negócio contém somente o UUID do convite', () => {
  assert.equal(invitationLink('https://escritorio.example', '11111111-1111-4111-8111-111111111111'), 'https://escritorio.example/convite?id=11111111-1111-4111-8111-111111111111');
  assert.throws(() => invitationLink('https://escritorio.example', 'token-ou-cpf'));
});
