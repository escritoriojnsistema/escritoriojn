import test from 'node:test';import assert from 'node:assert/strict';
import {validSpecializedCommand,specializedState,specializedProgress} from '../shared/specialized.js';
import {validUploadInput} from '../server/modules/attachments/validation.js';
import {requestDetail} from '../server/modules/requests/dto.js';
import {assignablePermissions} from '../shared/team.js';
import {permissionModules} from '../shared/permissionModules.js';
const id='30000000-0000-4000-8000-000000000001',date='2026-11-10T12:00:00.000Z';
test('30: manual deadlines require real dates, source, responsible and alert; reject generic day counting and injected authority',()=>{
 const c={kind:'deadline',expected_version:1,type:'externo',label:'Prazo conferido',due_on:'2026-12-10',alert_on:'2026-12-09',checked_on:'2026-11-10',source:'Ofício conferido',responsible_id:id};
 assert.equal(validSpecializedCommand(c),true);for(const extra of [{source:''},{responsible_id:''},{due_on:'2026-02-31'},{alert_on:'2026-12-11'},{count_days:10},{actor_id:id},{checked_on:'10/11/2026'}])assert.equal(validSpecializedCommand({...c,...extra}),false);
 assert.equal(validSpecializedCommand({kind:'note',expected_version:1,text:'Estratégia privada'}),true);
 assert.equal(validSpecializedCommand({kind:'open',item_id:id,property_id:id}),false);
});
test('30: explicit public projection strips private notes and medical/internal fields in client detail',()=>{
 const progress={kind:'aposentadoria',stage:'complementacao',pending:'Enviar documento legível',updated_at:date,notes:'SEGREDO',medical_file:'SEGREDO',external_reference:'SEGREDO'};
 assert.deepEqual(Object.keys(specializedProgress(progress)).sort(),['kind','pending','stage','updated_at']);
 const detail=requestDetail({id,protocol:'AT-30',title:'Atendimento',public_status:'recebido',created_at:date,updated_at:date,portal:true,assignee_name:null,message:'',services:[],specialized_progress:progress,notes:'SEGREDO'});
 assert.ok(!JSON.stringify(detail).includes('SEGREDO'));assert.equal(detail.specialized_progress?.kind,'aposentadoria');
});
test('30: state allowlist and bounds fail closed on malformed private data',()=>{
 const v={case:null,items:[],owners:[],participants:[],notes:[],deadlines:[],total_deadlines:0,page:1,can_open:true,can_configure:false,storage_path:'SEGREDO'};
 assert.equal(JSON.stringify(specializedState(v)).includes('SEGREDO'),false);assert.throws(()=>specializedState({...v,notes:[{text:'x',created_at:'invalid'}]}));
});
test('30: medical and strategic uploads use the existing validation contract; capabilities appear in explicit team grants',()=>{
 const upload={request_id:id,request_item_id:id,name:'restrito.pdf',mime_type:'application/pdf',size_bytes:20,sha256:'a'.repeat(64),idempotency_key:id};
 for(const classification of ['medico','estrategico'])assert.equal(validUploadInput({...upload,classification}),true);
 for(const cap of ['specialized.read','specialized.manage','specialized.conduct','specialized.sensitive'] as const){assert.ok(assignablePermissions.includes(cap));assert.ok(permissionModules.find(x=>x.id==='specialized')?.permissions.includes(cap));}
});
test('30: expense association accepts only existing identity/version, never browser amount or payment status',()=>{
 const c={kind:'expense',expected_version:1,expense_id:id,expected_expense_version:2};assert.equal(validSpecializedCommand(c),true);assert.equal(validSpecializedCommand({...c,amount_cents:100}),false);assert.equal(validSpecializedCommand({...c,status:'paid'}),false);assert.equal(validSpecializedCommand({...c,expected_expense_version:0}),false);
});
