import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLoginEmail,
  resolveInitialLoginNotice,
  validateLoginCredentials,
} from '../src/features/access/loginFormModel.ts';

test('resolveInitialLoginNotice prioritizes active feedback and handles route state', () => {
  assert.equal(resolveInitialLoginNotice(null, null), null);
  assert.deepEqual(resolveInitialLoginNotice({ sessionExpired: true }, null), {
    text: 'Sua sessão expirou. Entre novamente para continuar.',
    error: true,
  });
  assert.deepEqual(resolveInitialLoginNotice({ passwordUpdated: true }, null), {
    text: 'Senha atualizada. Entre com sua nova senha.',
    error: false,
  });
  const active = { text: 'E-mail ou senha inválidos.', error: true };
  assert.deepEqual(resolveInitialLoginNotice({ sessionExpired: true }, active), active);
});

test('normalizeLoginEmail trims whitespace and handles empty values', () => {
  assert.equal(normalizeLoginEmail('  cliente@escritorio.com.br  '), 'cliente@escritorio.com.br');
  assert.equal(normalizeLoginEmail(null), '');
});

test('validateLoginCredentials rejects missing or malformed email and empty password', () => {
  assert.equal(validateLoginCredentials('', 'segredo123'), 'Informe seu e-mail de acesso.');
  assert.equal(validateLoginCredentials('cpf-sem-arroba', 'segredo123'), 'Informe um endereço de e-mail válido.');
  assert.equal(validateLoginCredentials('cliente@exemplo.com', ''), 'Informe sua senha para continuar.');
  assert.equal(validateLoginCredentials('cliente@exemplo.com', 'segredo123'), null);
});
