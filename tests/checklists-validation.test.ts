import test from 'node:test';
import assert from 'node:assert/strict';
import {checklistScopesForOrigin,validChecklistDefinition} from '../shared/checklists.js';
import {model,notices,view} from '../server/modules/checklists/dto.js';
const rule={key:'arquivo_a',label:'Arquivo A',requirement:'required',condition:null};
test('checklists12: modelos rejeitam expressões, chaves repetidas, extras e limites',()=>{
 const valid={name:'Documentos',items:[rule,{...rule,key:'arquivo_b',requirement:'conditional',condition:{field:'origin',equals:'portal'}}]};assert.equal(validChecklistDefinition(valid),true);
 for(const bad of [{...valid,items:[]},{...valid,items:[rule,rule]},{...valid,items:[{...rule,condition:{field:'priority',equals:'urgent'}}]},{...valid,items:[{...rule,requirement:'conditional',condition:{field:'cpf',equals:'x'}}]},{...valid,actor_id:'forged'},{...valid,items:[{...rule,label:'\u0000'}]},{...valid,items:Array.from({length:13},(_,n)=>({...rule,key:`item_${n}`}))}])assert.equal(validChecklistDefinition(bad),false,JSON.stringify(bad));
});
test('checklists escopados: presencial aplica só o interno; portal aplica cliente e interno',()=>{
 assert.deepEqual(checklistScopesForOrigin('presencial'),['internal']);
 assert.deepEqual(checklistScopesForOrigin('whatsapp'),['client','internal']);
 assert.deepEqual(checklistScopesForOrigin('portal'),['client','internal']);
});
test('checklists escopados: DTO exige escopo no modelo e item, e origem no atendimento',()=>{
 const id='00000000-0000-4000-a000-000000000121',definition={name:'Documentos',items:[rule]},base={service_id:id,scope:'client',version:1,definition,history:[]};
 assert.equal(model(base).scope,'client');
 assert.throws(()=>model({...base,scope:'externo'}));
 const entry={id,key:'arquivo_a',label:'Arquivo A',scope:'internal',requirement:'required',condition:null,applicable:true,status:'pendente',file_id:null,version:1,reason:'Checklist aplicado',actor_name:null,updated_at:'2026-10-21T12:00:00Z',file_status:null};
 const request={request_id:id,request_version:1,protocol:'JN-12',closed:false,origin:'presencial',assignee_id:null,can_transfer:false,items:[{id,service_id:id,name:'Serviço'}],selected_item_id:id,instance:{id,source:'Interno v1',name:'Conferência',pending:1,received:0,can_update:true,can_waive:false,entries:[entry],history:[]}};
 assert.equal(view(request).origin,'presencial');
 assert.throws(()=>view({...request,origin:'outro'}));
});
test('checklists12: notificação sem escopo elimina referência e DTO não aceita estado malformado',()=>{
 const id='00000000-0000-4000-a000-000000000121',value={items:[{id,kind:'pending',created_at:'2026-10-21T12:00:00Z',read_at:null,request_id:id,protocol:'JN-12',can_open:false,reason:'PRIVATE',title:'PRIVATE'}],total:1,unread:1,page:1,page_size:3};const result=notices(value);assert.equal(result.items[0].request_id,null);assert.equal(result.items[0].protocol,null);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.throws(()=>notices({...value,items:[{...value.items[0],read_at:'invalid'}]}));
});
