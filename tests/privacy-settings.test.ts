import test from 'node:test';
import assert from 'node:assert/strict';
import {validPrivacyController,privacySettings} from '../shared/privacySettings.js';
const controller={controller_name:'Controlador de teste',cnpj:'',contact_email:'privacy@example.test',contact_phone:'',address:'Endereço de teste'};
test('identificação exige responsável e canal, valida CNPJ e recusa autoridade adicional',()=>{
 assert.equal(validPrivacyController(controller),true);
 for(const bad of [{...controller,user_id:'forged'},{...controller,cnpj:'00000000000000'},{...controller,contact_email:'invalid'},{...controller,contact_email:'',contact_phone:''},{...controller,controller_name:'Nome\nsegredo'}])assert.equal(validPrivacyController(bad),false);
});
test('projeção pública identifica exemplos e remove metadados de gestão',()=>{
 const example=privacySettings({configured:false,revision:0});
 assert.match(example.controller.controller_name,/fictícios/);
 assert.equal(example.controller.contact_email,'privacidade@example.com');
 assert.deepEqual(privacySettings({configured:true,revision:2,controller:{...controller},updated_by:'private',office_id:'private'}),{configured:true,revision:2,controller});
 assert.throws(()=>privacySettings({configured:true,revision:2,controller:{...controller,secret:'private'}}));
});
