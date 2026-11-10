import test from 'node:test';import assert from 'node:assert/strict';import {isAccessResponse,projectAccessContexts} from '../shared/access.ts';
const uid='11111111-1111-4111-8111-111111111111',office='22222222-2222-4222-8222-222222222222';
const row={office_id:office,user_id:uid,office_name:'Escritório',display_name:'Maria de Teste',role_code:'client',permissions:[]};
test('31: verified client context does not need or receive internal foundation permission',()=>{assert.equal(isAccessResponse({data:{user:{id:uid},contexts:[row]}}),true);assert.deepEqual(projectAccessContexts([row],uid,'client'),[row]);assert.deepEqual(projectAccessContexts([row],uid,'team'),[]);assert.equal(isAccessResponse({data:{user:{id:uid},contexts:[{...row,role_code:'employee'}]}}),false);});
