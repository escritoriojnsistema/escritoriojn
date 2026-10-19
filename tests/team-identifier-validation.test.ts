import test from 'node:test';
import assert from 'node:assert/strict';
import { validCpf } from '../src/features/team/validation.ts';
import { cpf } from '../server/modules/team/validation.ts';

test('convites no cliente e servidor aceitam apenas CPF numérico ou canônico', () => {
  for (const validate of [validCpf, cpf]) {
    assert.equal(validate('52998224725'), true);
    assert.equal(validate('529.982.247-25'), true);
    for (const value of [' 52998224725', '52998224725 ', '529 982 247 25', '529-982-247.25', '.52998224725', '52998224725\n', '52998224725a']) {
      assert.equal(validate(value), false, `Recusar formato não canônico: ${JSON.stringify(value)}`);
    }
  }
  for (const value of [null, undefined, 52998224725, {}, []]) assert.equal(cpf(value), false);
});
