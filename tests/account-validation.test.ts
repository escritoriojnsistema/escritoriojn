import test from 'node:test';
import assert from 'node:assert/strict';
import {validAccountInput} from '../shared/account.js';

test('Conta valida nome, CPF e e-mail e recusa campos de autoridade',()=>{
 const input={name:'Pessoa de teste',cpf:'52998224725',email:'pessoa@example.test'};
 assert.equal(validAccountInput(input),true);
 for(const invalid of [{...input,cpf:'52998224724'},{...input,name:'A\nB'},{...input,email:'invalid'}, {...input,role_code:'owner'},{...input,user_id:'outro'}, {...input,cpf:'529.982.247-25'}])assert.equal(validAccountInput(invalid),false);
 assert.equal(validAccountInput({...input,cpf:null}),true);
});
