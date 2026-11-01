import test from 'node:test';
import assert from 'node:assert/strict';
import {validFolderCommand,projectFolderState} from '../shared/modelCommercialValidation.js';
const id='00000000-0000-4000-8000-000000000001';
test('pastas: comandos fechados, versões e nomes válidos',()=>{
 assert.equal(validFolderCommand({kind:'create',name:'Contratos rurais'}),true);
 assert.equal(validFolderCommand({kind:'create',name:' '}),false);
 assert.equal(validFolderCommand({kind:'create',name:'Pasta',office_id:id}),false);
 assert.equal(validFolderCommand({kind:'move',template_id:id,folder_id:null,expected_revision:0}),true);
 assert.equal(validFolderCommand({kind:'delete',folder_id:id,expected_revision:0}),false);
 assert.equal(validFolderCommand({kind:'rename',folder_id:id,name:'Nova pasta',expected_revision:1}),true);
});
test('pastas: projeção descarta extras e recusa localização desconhecida',()=>{
 const state={folders:[{id,name:'Contratos',revision:1,secret:'hidden'}],locations:[{template_id:id,folder_id:id,revision:1,secret:'hidden'}],can_manage:true,secret:'hidden'};
 assert.deepEqual(projectFolderState(state),{folders:[{id,name:'Contratos',revision:1}],locations:[{template_id:id,folder_id:id,revision:1}],can_manage:true});
 assert.throws(()=>projectFolderState({...state,can_manage:'true'}));
 assert.throws(()=>projectFolderState({...state,locations:[{template_id:id,folder_id:'invalid',revision:0}]}));
});
