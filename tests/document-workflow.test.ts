import test from 'node:test';import assert from 'node:assert/strict';
import {validWorkflowCommand,projectWorkflowState,projectPortalDocuments} from '../shared/documentWorkflowValidation.js';
const id='00000000-0000-4000-8000-000000000001';
test('fluxo: operações não aceitam pagamento/aprovação forjados e exigem versão',()=>{
 assert.equal(validWorkflowCommand({kind:'freeze',expected_revision:1,reason:'Revisão concluída'}),true);
 assert.equal(validWorkflowCommand({kind:'handoff',publication_id:id,expected_revision:1,reason:'Enviar ao caixa'}),true);
 assert.equal(validWorkflowCommand({kind:'handoff',publication_id:id,expected_revision:0,reason:'Enviar ao caixa'}),false);
 assert.equal(validWorkflowCommand({kind:'approve',publication_id:id,expected_revision:1,reason:'Revisado',paid:true}),false);
});
test('fluxo: portal expõe somente disponibilidade e não retorna conteúdo/caminho/autoria',()=>{
 const value={items:[{id,title:'Contrato rural',protocol:'DOC-1',created_at:'2026-11-01T00:00:00Z',ready:false,blockers:['payment'],content:'privado',object_path:'privado',created_by:id}],total:1,page:1,page_size:5};
 assert.deepEqual(Object.keys(projectPortalDocuments(value).items[0]).sort(),['blockers','created_at','id','protocol','ready','title']);
 assert.throws(()=>projectPortalDocuments({...value,items:[{...value.items[0],ready:'true'}]}));
 assert.throws(()=>projectWorkflowState({document_id:id,current_revision:1,can_work:true,can_review:false,publications:[{id}]}));
});
