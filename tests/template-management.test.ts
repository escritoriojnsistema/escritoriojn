import test from 'node:test';
import assert from 'node:assert/strict';
import {templateDetail} from '../server/modules/templates/dto.js';
import {detail,version,user} from './fixtures/templates.js';

test('leitor de modelos recebe histórico aprovado menor que o total de versões',()=>{
 const approved={...version,approved_at:'2026-10-26T02:00:00.000Z',approved_by:user,approved_by_name:'Revisor',approval_reason:'Conferido'};
 const value=templateDetail({...detail,latest_version:3,history_total:1,can_manage:false,can_approve:false,versions:[approved],private:'hidden'});
 assert.equal(value.history_total,1);
 assert.equal(value.latest_version,3);
 assert.equal(value.versions[0].content,version.content);
 assert.equal('private' in value,false);
 assert.throws(()=>templateDetail({...detail,history_total:2}));
 assert.throws(()=>templateDetail({...detail,can_manage:false,can_approve:false}),'DTO fails closed if the provider returns a draft to a reader');
});

import {validVersionCommand} from '../shared/modelCommercialValidation.js';
test('edição na mesma versão transporta carimbo e rejeita campos forjados',()=>{
 const command={kind:'edit',version_id:version.id,definition:Object.fromEntries(['code','name','kind','content','demonstration','effective_from','effective_until','variables','signature_policy','review_required'].map(k=>[k,version[k as keyof typeof version]])),reason:'Correção autorizada',expected_edited_at:'2026-11-03T12:00:00.123456+00:00'};
 assert.equal(validVersionCommand(command),true);assert.equal(validVersionCommand({...command,expected_edited_at:null}),true);
 for(const stamp of ['invalido',42,{},''])assert.equal(validVersionCommand({...command,expected_edited_at:stamp}),false);
 assert.equal(validVersionCommand({...command,actor_id:user}),false);
});
