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
