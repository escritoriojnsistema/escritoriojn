import test from 'node:test';
import assert from 'node:assert/strict';
import {validWorkflowCommand} from '../shared/documentWorkflowValidation.js';
import {projectReviewQueue,projectPublicReviews} from '../shared/editorialReviewValidation.js';
const id='00000000-0000-4000-8000-000000000001';
test('23: devolver, rejeitar e retirar exigem motivo, revisão e evento esperado',()=>{
 for(const kind of ['approve','reject','return','withdraw']){
  assert.equal(validWorkflowCommand({kind,publication_id:id,expected_revision:2,expected_event_id:id,reason:'Conferência humana'}),true);
  assert.equal(validWorkflowCommand({kind,publication_id:id,expected_revision:2,expected_event_id:'forjado',reason:'Conferência'}),false);
  assert.equal(validWorkflowCommand({kind,publication_id:id,expected_revision:2,expected_event_id:id,reason:'',paid:true}),false);
 }
 assert.equal(validWorkflowCommand({kind:'freeze',expected_revision:2,expected_event_id:null,reviewer_id:id,due_at:'2026-11-05T12:00:00.000Z',reason:'Encaminhar para responsável'}),true);
 assert.equal(validWorkflowCommand({kind:'freeze',expected_revision:2,reviewer_id:'inválido',reason:'Encaminhar'}),false);
});
test('23: fila valida identidade, pendências e metadados sem vazar snapshot',()=>{
 const review={status:'in_review',reviewer_id:null,reviewer_name:null,prepared_by_name:'Equipe',due_at:null,submitted_at:'2026-11-03T12:00:00Z',last_event_id:id,last_reason:'Conferir conteúdo',last_actor_name:'Equipe',can_decide:true,can_withdraw:false,can_submit:false};
 const row={document_id:id,request_id:id,publication_id:id,protocol:'AT-000001',title:'Declaração',revision:2,pending_count:0,review,content:'privado'};
 const page=projectReviewQueue({items:[row],total:1,page:1,page_size:3});assert.equal(page.items[0].review.status,'in_review');assert.equal('content' in page.items[0],false);
 assert.throws(()=>projectReviewQueue({items:[{...row,review:{...review,status:'paid'}}],total:1,page:1,page_size:3}));
});
test('23: acompanhamento do cliente remove motivo interno e autores',()=>{
 const page=projectPublicReviews({items:[{title:'Declaração',revision:2,status:'returned',updated_at:'2026-11-03T12:00:00Z',reason:'SEGREDO',actor_id:id,content:'PRIVADO'}],page:1,page_size:3,total:1});
 assert.deepEqual(Object.keys(page.items[0]).sort(),['revision','status','title','updated_at']);
});
