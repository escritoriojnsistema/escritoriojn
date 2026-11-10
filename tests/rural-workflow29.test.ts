import test from 'node:test';import assert from 'node:assert/strict';
import {validRuralWorkflowCommand,ruralWorkflowState,ruralProgress} from '../shared/ruralWorkflow.js';
const id='29000000-0000-4000-8000-000000000001';
test('29: commands reject authority injection, partial versions and unsupported transitions',()=>{
 assert.ok(validRuralWorkflowCommand({kind:'open',item_id:id,property_id:id}));
 assert.ok(validRuralWorkflowCommand({kind:'handoff',expected_version:1,owner_id:id}));
 assert.ok(validRuralWorkflowCommand({kind:'complete',expected_version:2,external_reference:'Referência externa informada',file_id:id}));
 for(const c of [{kind:'advance',expected_version:1,stage:'concluido'},{kind:'complete',expected_version:2,external_reference:' ',file_id:id},{kind:'complement',expected_version:0,pending:'Documento'},{kind:'handoff',expected_version:1,owner_id:id,role:'owner'},{kind:'configure',item_id:id,service_kind:'ITR',expected_version:0}])assert.equal(validRuralWorkflowCommand(c),false);
});
test('29: projection strips private fields and rejects malformed progress',()=>{
 const progress={kind:'CAR',stage:'complementacao',pending:'Enviar documento legível',updated_at:'2026-11-10T12:00:00.000Z'};
 assert.deepEqual(ruralProgress({...progress,file_id:id,secret:'private'}),progress);
 assert.throws(()=>ruralProgress({...progress,stage:'aceito_pelo_orgao'}));
 const s={case:null,properties:[],items:[],owners:[],history:[],history_total:0,page:1,can_configure:false,can_open:false};
 assert.deepEqual(ruralWorkflowState({...s,secret:'private'}),s);
 assert.throws(()=>ruralWorkflowState({...s,properties:Array(6).fill({id,name:'Nome'})}));
});
