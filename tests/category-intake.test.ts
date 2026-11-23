import {test} from 'node:test';import assert from 'node:assert/strict';
import {categoryAnswerError,categoryForm,categoryRequestState,validCategoryFormCommand,validCategoryRequestCommand,type CategoryField,type CategoryDocumentSlot} from '../shared/categoryIntake';
const id='00000000-0000-4000-8000-000000000001';
const field:CategoryField={key:'cadastro',label:'Cadastro',type:'cpf',required:true,options:[]};
const slot:CategoryDocumentSlot={key:'identidade',label:'Documento de identificação',required:true,max_files:2,max_bytes:1048576,mime_types:['application/pdf'],classification:'identificacao'};
const command={expected_revision:0,enabled:true,instructions:'Conferir dados',fields:[field],documents:[slot],reason:'Publicação fictícia'};
test('category intake: exact configuration rejects duplicate/unknown keys, unsupported files and authority injection',()=>{
 assert.equal(validCategoryFormCommand(command),true);for(const v of [{...command,role:'owner'},{...command,fields:[field,field]},{...command,documents:[slot,slot]},{...command,documents:[{...slot,max_bytes:10485761}]},{...command,documents:[{...slot,mime_types:['text/html']}]},{...command,fields:[{...field,type:'select',options:['única']}]}])assert.equal(validCategoryFormCommand(v),false);
});
test('category intake: category-specific typed values reject invalid CPF/date/select/number and unknown answers',()=>{
 assert.equal(categoryAnswerError([field],{cadastro:'52998224725'}),undefined);assert.match(categoryAnswerError([field],{cadastro:'11111111111'})!,/Cadastro/);assert.match(categoryAnswerError([field],{})!,/Preencha/);assert.equal(categoryAnswerError([field],{},false),undefined);
 for(const [type,value,options]of [['date','2026-02-30',[]],['number','1,20',[]],['select','outro',['A','B']],['email','sem-email',[]]]as const)assert.match(categoryAnswerError([{...field,type,options:[...options]}],{cadastro:value})!,/Cadastro/);
 assert.match(categoryAnswerError([field],{outro:'privado'})!,/campos/);
});
test('category intake: public projection strips private metadata and malformed response fails closed',()=>{
 const v={category_id:id,revision:1,enabled:true,instructions:'',fields:[field],documents:[slot],can_manage:false,has_services:false,actor_token:'secret'};assert.equal('actor_token'in categoryForm(v),false);assert.throws(()=>categoryForm({...v,documents:[{...slot,max_files:99}]}));assert.equal(categoryRequestState(null),null);
});
test('category intake: commands cannot choose arbitrary request, permissions or cross-file payload',()=>{
 assert.equal(validCategoryRequestCommand({kind:'bind_file',slot_key:'identidade',file_id:id}),true);assert.equal(validCategoryRequestCommand({kind:'bind_file',slot_key:'identidade',file_id:id,request_id:id}),false);assert.equal(validCategoryRequestCommand({kind:'submit',price:0}),false);assert.equal(validCategoryRequestCommand({kind:'save',answers:{cadastro:'52998224725'},message:''}),true);
});

test('category intake: masks and custom types preserve one fiscal identifier and reject credentials',()=>{
 const fiscal:CategoryField={...field,type:'cpf_cnpj'};
 const rural:CategoryField={key:'rural',label:'Identificador do imóvel',type:'text',required:true,options:[],
  response_name:'Identificador rural',model:{name:'CIB',mask:'*******-0'}};
 assert.equal(validCategoryFormCommand({...command,fields:[fiscal,rural]}),true);
 for(const doc of ['52998224725','11.222.333/0001-81','12.ABC.345/01DE-35','12ABC34501DE35']){
  assert.equal(categoryAnswerError([fiscal,rural],{cadastro:doc,rural:'AB12CD3-0'}),undefined);
 }
 for(const doc of ['52998224725,11222333000181','12ABC34501DE36','11111111111']){
  assert.match(categoryAnswerError([fiscal],{cadastro:doc})!,/válido/);
 }
 assert.match(categoryAnswerError([rural],{rural:'AB12CD3/0'})!,/formato/);
 assert.equal(validCategoryFormCommand({...command,fields:[{...rural,label:'Senha gov.br'}]}),false);
 assert.equal(validCategoryFormCommand({...command,fields:[{...rural,model:{name:'Formato livre',mask:'^(.*)+$'}}]}),false);
});
