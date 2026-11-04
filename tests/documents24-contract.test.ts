import test from 'node:test';import assert from 'node:assert/strict';
import {validSignatureCommand,projectSignatureState} from '../shared/documentSignatureValidation.js';
const id='00000000-0000-4000-8000-000000000001';
const stamp={expected_revision:1,expected_event_id:null,reason:'Conferência da versão atual'};
const config={...stamp,kind:'configure',mode:'external',exit_policy:'after_settlement',expected_signers:['João','Sônia']};
export const signatureFixture24={publication_id:id,document_id:id,request_id:id,revision:1,mode:'external',exit_policy:'after_settlement',expected_signers:['João','Sônia'],verified_signers:[],status:'pending',last_event_id:null,can_manage:true,can_validate:true,can_exit:false,exit_blockers:['payment'],file:null,evidence:null,signed_on:null,custody:null,notary_reference:null,history:[],history_total:0,page:1,page_size:5};
test('24: comandos exigem revisão/evento exatos e não aceitam dispensa implícita ou autoridade forjada',()=>{
 assert.equal(validSignatureCommand(config),true);
 for(const value of [{...config,expected_revision:0},{...config,expected_event_id:'fake'},{...config,paid:true},{...config,expected_signers:[]},{...config,expected_signers:['João','João']},{...config,expected_signers:['   ']},{...config,reason:'x\u0000'},{...config,mode:'none'}])assert.equal(validSignatureCommand(value),false,JSON.stringify(value));
 assert.equal(validSignatureCommand({...config,mode:'none',expected_signers:[]}),true);
 assert.equal(validSignatureCommand({...stamp,kind:'import',file_id:id}),true);
 assert.equal(validSignatureCommand({...stamp,kind:'revoke'}),true);
});
test('24: validação externa exige hash/evidência e ato físico exige data real/custódia',()=>{
 const external={...stamp,kind:'validate',result:'validated',sha256:'a'.repeat(64),verified_signers:['João'],evidence:'Conferido no VALIDAR/ITI em laboratório'};
 assert.equal(validSignatureCommand(external),true);assert.equal(validSignatureCommand({...external,sha256:'fake'}),false);assert.equal(validSignatureCommand({...external,verified_signers:[]}),false);assert.equal(validSignatureCommand({...external,result:'invalid',verified_signers:[]}),true);assert.equal(validSignatureCommand({...external,evidence:'x'}),false);
 const physical={...stamp,kind:'physical',verified_signers:['João'],evidence:'Via física conferida presencialmente',signed_on:'2026-11-04',custody:'Pasta física local',notary_reference:''};
 assert.equal(validSignatureCommand(physical),true);assert.equal(validSignatureCommand({...physical,signed_on:'2026-02-30'}),false);assert.equal(validSignatureCommand({...physical,custody:''}),false);assert.equal(validSignatureCommand({...physical,signed_on:'2026-11-04T00:00:00Z'}),false);
});
test('24: projeção remove paths/segredos e falha fechada para estados inconsistentes',()=>{
 const input={...signatureFixture24,object_path:'private',secret:'hidden',history:[{id,kind:'configure',actor_name:'Operadora',created_at:'2026-11-04T12:00:00Z',reason:'Conferência manual',payload:{secret:1}}],history_total:1};
 const output=projectSignatureState(input);assert.equal('object_path'in output,false);assert.equal('secret'in output,false);assert.equal('payload'in output.history[0],false);
 assert.equal(projectSignatureState({...input,history:[{...input.history[0],kind:'physical_legacy'}]}).history[0].kind,'physical_legacy');
 assert.throws(()=>projectSignatureState({...input,status:'signed_by_server'}));assert.throws(()=>projectSignatureState({...input,can_manage:'true'}));assert.throws(()=>projectSignatureState({...input,can_exit:true,exit_blockers:['payment']}));
 assert.throws(()=>projectSignatureState({...input,file:{id,name:'assinado.pdf',sha256:'fake',size_bytes:20,status:'disponivel',scanner_status:'clean'}}));
});
