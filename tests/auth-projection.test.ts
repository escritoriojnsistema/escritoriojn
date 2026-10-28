import assert from 'node:assert/strict';
import test from 'node:test';
import {projectAccessContexts,type AccessContext} from '../shared/access.js';

const uid='00000000-0000-4000-a000-000000000001';
const office='00000000-0000-4000-b000-000000000001';
const row={user_id:uid,office_id:office,role_code:'owner',permissions:['foundation.access','audit.read'],office_name:'Escritório de teste',display_name:'Pessoa de teste'};
function project(value:unknown,area?:'team'|'client',officeId?:string):AccessContext[]|null{
 return projectAccessContexts(value,uid,area,officeId);
}
test('projeção de acesso remove campos não publicados e copia permissões',()=>{
 const input={...row,internal:'não publicar',permissions:[...row.permissions]};
 const result=project([input],'team');
 assert.deepEqual(result,[row]);assert.notEqual(result![0],input);assert.notEqual(result![0].permissions,input.permissions);
});
test('projeção de acesso filtra portal, escritório e foundation vigentes',()=>{
 assert.deepEqual(project([row],'client'),[]);
 assert.deepEqual(project([{...row,role_code:'client'}],'team'),[]);
 assert.deepEqual(project([{...row,role_code:'client'}],'client'),[{...row,role_code:'client'}]);
 assert.deepEqual(project([row],'team','00000000-0000-4000-b000-000000000002'),[]);
 assert.deepEqual(project([{...row,permissions:['audit.read']}]),[]);
 assert.deepEqual(project([]),[]);
});
test('projeção de acesso rejeita UID divergente até em linha fora do portal',()=>{
 assert.equal(project([row,{...row,user_id:'00000000-0000-4000-a000-000000000002',role_code:'client'}],'team'),null);
});
test('projeção de acesso rejeita formas inválidas antes de selecionar linhas',()=>{
 for(const value of [null,{},[null],[{...row,role_code:'inventado'}],[{...row,permissions:['foundation.access',42]}],[{...row,office_id:'inválido'}],[{...row,display_name:42}],[{...row,permissions:Array(101).fill('foundation.access')}]])assert.equal(project(value),null);
 assert.equal(project(Array(101).fill(row)),null);
 assert.equal(project(Array(100).fill(row))?.length,100);
});
