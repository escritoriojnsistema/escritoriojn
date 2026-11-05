import test from 'node:test';import assert from 'node:assert/strict';
import {validReleaseCommand25,projectReleaseState25} from '../shared/documentRelease.js';
const id='00000000-0000-4000-8000-000000000001';
const command={kind:'request',expected_revision:1,expected_event_id:null,reason:'Saldo parcial autorizado para análise',expires_at:'2026-11-20T12:00:00Z'};
test('25: motivos comuns aceitos e controles recusados; autoridade sempre do servidor',()=>{
 for(const reason of ['Motivo valido','Saldo parcial autorizado para análise','12345','ABCDE'])assert.equal(validReleaseCommand25({...command,reason}),true);
 for(const reason of ['Texto\ncom controle','Texto\0com controle','  Motivo  ','abc'])assert.equal(validReleaseCommand25({...command,reason}),false);
 for(const v of [{...command,paid:true},{...command,expected_event_id:'fake'},{...command,expected_revision:0},{...command,expires_at:'infinity'},{...command,kind:'authorize'}])assert.equal(validReleaseCommand25(v),false);
 assert.equal(validReleaseCommand25({kind:'authorize',expected_revision:1,expected_event_id:id,reason:'Decisão financeira explícita'}),true);
});
test('25: projeção conserva escopo imutável e nega resposta incoerente',()=>{
 const exception={status:'authorized',expires_at:'2026-11-20T12:00:00Z',reason:'Exceção comercial auditada',revision:1,sha256:'a'.repeat(64),balance_cents:4000,charge_id:id};
 const state={publication_id:id,revision:1,last_event_id:id,can_request:true,can_decide:true,ready:true,blockers:[],approved:true,signed:true,financial:{charge_id:id,due_cents:10000,allocated_cents:6000,balance_cents:4000,fingerprint:'a'.repeat(64)},exception,history:[],history_total:2,page:1,page_size:5,object_path:'private'};
 assert.deepEqual(projectReleaseState25(state).exception,exception);assert.equal('object_path' in projectReleaseState25(state),false);
 for(const invalid of [{...state,ready:false},{...state,can_request:'true'},{...state,exception:{...exception,sha256:'fake'}},{...state,financial:{...state.financial,balance_cents:'4000'}}])assert.throws(()=>projectReleaseState25(invalid));
});
