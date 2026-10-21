import test from 'node:test';
import assert from 'node:assert/strict';
import {validRequestMutation} from '../server/modules/requests/validation.js';
import {requestOptions,requestDetail} from '../server/modules/requests/dto.js';
const id='11111111-1111-4111-8111-111111111111',time='2026-10-21T12:00:00Z';
test('ajustes: retomada tem contrato próprio, sem alvo arbitrário',()=>{
 assert.ok(validRequestMutation({kind:'reclaim',reason:'Retomar atendimento'}));
 assert.equal(validRequestMutation({kind:'reclaim',reason:'Retomar',assignee_id:id}),false);
 assert.equal(validRequestMutation({kind:'reclaim',reason:''}),false);
});
test('ajustes: diretório mostra função e elegibilidade sem vazar dados de conta',()=>{
 const result=requestOptions({items:[{id,label:'Pessoa fictícia',role_code:'admin',eligible:false,email:'private@example.test'}],total:1,page:1,page_size:3});
 assert.deepEqual(result.items,[{id,label:'Pessoa fictícia',role_code:'admin',eligible:false}]);
 assert.throws(()=>requestOptions({items:[{id,label:'Pessoa',role_code:'client',eligible:true}],total:1,page:1,page_size:3}));
});
test('ajustes: cliente recebe somente nome do atendente além da projeção existente',()=>{
 const result=requestDetail({id,protocol:'JN-2026-000001',title:'Pedido próprio',public_status:'recebido',created_at:time,updated_at:time,portal:true,message:'Mensagem',services:[],assignee_name:'Ana Fictícia',role_code:'owner',internal_note:'Segredo',assignee_id:id});
 assert.equal(result.portal&&result.assignee_name,'Ana Fictícia');
 assert.ok(!JSON.stringify(result).includes('Segredo'));assert.ok(!('role_code' in result));assert.ok(!('assignee_id' in result));
});
