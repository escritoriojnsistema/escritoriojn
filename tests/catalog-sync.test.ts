import test from 'node:test';import assert from 'node:assert/strict';
import {projectPublicOffer} from '../shared/modelCommercialValidation.js';
const id='00000000-0000-4000-8000-000000000001';
const offer={template_id:id,template_version_id:id,service_version_id:id,offer_revision:1,name:'Modelo aprovado',template_code:'DOC-01',folder_id:id,folder_name:'Contratos',folder_category:'Contratos',instructions:'Descrição pública',price_cents:4000,service_id:id,service_code:'SERV-01',service_name:'Serviço cadastrado',service_category:'Rural',service_checklist:['Documento de identificação'],variables:[],can_book:false};
test('catálogo conserva serviço e disponibilidade sem expor conteúdo interno',()=>{
 const v=projectPublicOffer({...offer,content:'interno',actor_id:id});assert.equal(v.service_name,'Serviço cadastrado');assert.equal(v.can_book,false);assert.equal('content' in v,false);assert.equal('actor_id' in v,false);assert.deepEqual(v.service_checklist,['Documento de identificação']);
});
test('catálogo rejeita disponibilidade/serviço forjados em resposta inconsistente',()=>{assert.throws(()=>projectPublicOffer({...offer,can_book:'true'}));assert.throws(()=>projectPublicOffer({...offer,service_name:''}));});
