import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryReturn } from '../src/features/auth/recoveryReturn';
import { privacyPolicyVersion, optionalTechnologies, necessaryPreference } from '../src/features/privacy/policy';
test('recuperação retorna à Conta do contexto verificado sem encerrar sessão',()=>{
 assert.equal(recoveryReturn('authorized',['client'],'client'),'/minha-conta');
 assert.equal(recoveryReturn('authorized',['staff'],'team'),'/conta');
 assert.equal(recoveryReturn('authorized',['staff','client'],'client'),'/minha-conta');
 assert.equal(recoveryReturn('authorized',['staff','client'],'team'),'/conta');
 assert.equal(recoveryReturn('signedOut',[],'client'),'/login-cliente');
 assert.equal(recoveryReturn('denied',[],'team'),'/login');
});
test('nenhuma autorização opcional fictícia é registrada',()=>{
 assert.deepEqual(optionalTechnologies,[]);
 assert.equal(necessaryPreference.policyVersion,privacyPolicyVersion);
 assert.equal(necessaryPreference.optional,false);
 assert.equal(necessaryPreference.consent,false);
});
