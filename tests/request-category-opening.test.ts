import test from 'node:test';
import assert from 'node:assert/strict';
import {validCreateRequest} from '../server/modules/requests/validation.js';
const category='11111111-1111-4111-8111-111111111111';
const input={origin:'presencial',category_id:category,title:'Atendimento',message:'Dados coletados',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',items:[],internal_note:''};
test('staff category opening accepts category with no services and derives its mode on the server',()=>{
 assert.equal(validCreateRequest(input),true);
 for(const extra of [{preintake:true},{mode:'execution'},{execution_level:1}])assert.equal(validCreateRequest({...input,...extra}),false);
});
test('staff category opening requires valid central identity and message limits',()=>{
 assert.equal(validCreateRequest({...input,category_id:'Rural'}),false);
 assert.equal(validCreateRequest({...input,message:'a'.repeat(2001)}),false);
 assert.equal(validCreateRequest({...input,category_id:undefined}),false);
});
