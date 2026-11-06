import test from 'node:test';
import assert from 'node:assert/strict';
import {validCategoryCommand} from '../shared/categories.js';
const command={kind:'create',name:'Rural',reason:'Organização'};
test('new categories require an explicit level',()=>{
 assert.equal(validCategoryCommand(command),false);
 for(const execution_level of [1,2,3])assert.equal(validCategoryCommand({...command,execution_level}),true);
 for(const execution_level of [null,0,4,'1'])assert.equal(validCategoryCommand({...command,execution_level}),false);
});
test('category edits explicitly classify pending legacy categories',()=>{
 assert.equal(validCategoryCommand({kind:'rename',category_id:'11111111-1111-4111-8111-111111111111',expected_revision:1,name:'Rural',execution_level:2,reason:'Classificação'}),true);
});
