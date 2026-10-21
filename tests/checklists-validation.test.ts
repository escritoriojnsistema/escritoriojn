import test from 'node:test';
import assert from 'node:assert/strict';
import {validChecklistDefinition} from '../shared/checklists.js';
import {notices} from '../server/modules/checklists/dto.js';
const rule={key:'arquivo_a',label:'Arquivo A',requirement:'required',condition:null};
test('checklists12: modelos rejeitam expressões, chaves repetidas, extras e limites',()=>{
 const valid={name:'Documentos',items:[rule,{...rule,key:'arquivo_b',requirement:'conditional',condition:{field:'origin',equals:'portal'}}]};assert.equal(validChecklistDefinition(valid),true);
 for(const bad of [{...valid,items:[]},{...valid,items:[rule,rule]},{...valid,items:[{...rule,condition:{field:'priority',equals:'urgent'}}]},{...valid,items:[{...rule,requirement:'conditional',condition:{field:'cpf',equals:'x'}}]},{...valid,actor_id:'forged'},{...valid,items:[{...rule,label:'\u0000'}]},{...valid,items:Array.from({length:13},(_,n)=>({...rule,key:`item_${n}`}))}])assert.equal(validChecklistDefinition(bad),false,JSON.stringify(bad));
});
test('checklists12: notificação sem escopo elimina referência e DTO não aceita estado malformado',()=>{
 const id='00000000-0000-4000-a000-000000000121',value={items:[{id,kind:'pending',created_at:'2026-10-21T12:00:00Z',read_at:null,request_id:id,protocol:'JN-12',can_open:false,reason:'PRIVATE',title:'PRIVATE'}],total:1,unread:1,page:1,page_size:3};const result=notices(value);assert.equal(result.items[0].request_id,null);assert.equal(result.items[0].protocol,null);assert.ok(!JSON.stringify(result).includes('PRIVATE'));assert.throws(()=>notices({...value,items:[{...value.items[0],read_at:'invalid'}]}));
});
