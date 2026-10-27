import test from 'node:test';
import assert from 'node:assert/strict';
import * as templates from '../shared/templates.js';
import {validDraftInput} from '../shared/documents.js';
import {resolveDocument} from '../shared/documentRender.js';
import {templateDetail} from '../server/modules/templates/dto.js';
import {documentDetail} from '../server/modules/documents/dto.js';
import {declaration,detail,version} from './fixtures/templates.js';
import {document21,source21,participants21} from './fixtures/documents21.js';
const custom=(key:string,type:templates.VariableType='text',required=true):templates.TemplateVariable=>({key,label:key,type,required});
const definition=(variables:templates.TemplateVariable[]):templates.TemplateInput=>({...declaration,variables,content:variables.map(v=>'{{'+v.key+'}}').join('\n')});

test('pós21: campos manuais declarados aceitam sete tipos e limite80, com gramática exata',()=>{
 const keys=['documento.nome','documento.data','documento.preco','documento.quantidade','documento.cpf','documento.cnpj','documento.identificador'];
 const types=['text','date','money','number','cpf','cnpj','tax_id'] as templates.VariableType[];
 assert.equal(templates.validTemplate(definition(keys.map((k,i)=>custom(k,types[i])))),true);
 assert.equal(templates.isCustomTemplateKey('documento.'+'a'.repeat(64)),true);
 for(const key of ['documento.'+'a'.repeat(65),'documento.Nome','documento.a.b','cliente.cnpj','documento._nome','documento.a-b','documento.a\n'])assert.equal(templates.isCustomTemplateKey(key),false,key);
 const eighty=Array.from({length:80},(_,i)=>custom('documento.campo_'+i));
 assert.equal(templates.validTemplate(definition(eighty)),true);
 assert.equal(templates.validTemplate(definition([...eighty,custom('documento.extra')])) ,false);
 for(const bad of [{...definition([custom('documento.nome')]),content:'{{documento.outro}}'},definition([custom('documento.nome'),custom('documento.nome')]),{...declaration,variables:declaration.variables.map(v=>({...v,type:'cpf'}))}])assert.equal(templates.validTemplate(bad),false);
 assert.equal(Object.keys(templates.templateVariables).length,14);
});
test('pós21: overrides custom usam2000 pontosUnicode; campos antigos preservam500/nomes120',()=>{
 const d=definition([custom('documento.nome')]);const input={content:d.content,overrides:{'documento.nome':'😀'.repeat(2000)},money_in_words:false};
 assert.equal(validDraftInput(input,d),true);assert.equal(validDraftInput(input),true);
 assert.equal(validDraftInput({...input,overrides:{'documento.nome':'😀'.repeat(2001)}},d),false);
 assert.equal(validDraftInput({...input,overrides:{'documento.nao_declarado':'x'}},d),false);
 assert.equal(validDraftInput({...input,overrides:{'cliente.endereco':'x'.repeat(501)}}),false);
 assert.equal(validDraftInput({...input,overrides:{'cliente.nome':'x'.repeat(500)}}),true);assert.equal(validDraftInput({...input,overrides:{'cliente.nome':'x'.repeat(501)}}),false);
 assert.equal(templates.templateValueLimit('documento.nome'),2000);assert.equal(templates.templateValueLimit('cliente.nome'),120);assert.equal(templates.templateValueLimit('cliente.endereco'),500);
 const eighty=definition(Array.from({length:80},(_,i)=>custom('documento.campo_'+i)));
 const overrides=Object.fromEntries(eighty.variables.map(v=>[v.key,'x']));assert.equal(validDraftInput({...input,overrides},eighty),true);assert.equal(validDraftInput({...input,overrides:{...overrides,'documento.extra':'x'}}),false);
});
test('pós21: custom permanece manual e requer placeholder, sem inferir pessoa/papel/preço pela chave',()=>{
 const d=definition([custom('documento.cliente_nome'),custom('documento.participante_comprador_cpf'),custom('documento.valores_total','money')]);
 const empty={content:d.content,overrides:{},money_in_words:true};const pending=resolveDocument(d,empty,source21,participants21);
 assert.equal(pending.issues.filter(i=>i.code==='required').length,3);assert.deepEqual(pending.values,{'documento.cliente_nome':null,'documento.participante_comprador_cpf':null,'documento.valores_total':null});
 const filled={...empty,overrides:{'documento.cliente_nome':'Manual','documento.participante_comprador_cpf':'texto livre','documento.valores_total':'200.50'}};
 const r=resolveDocument(d,filled,source21,[]);assert.deepEqual(r.issues,[]);assert.match(r.rendered_content,/duzentos reais e cinquenta centavos/);assert.equal(source21.service.total_cents,1050);
 assert.ok(resolveDocument(d,{...filled,content:'texto apagado'},source21,[]).issues.some(i=>i.code==='missing_placeholder'));
});
test('pós21: CPF/CNPJ tipados validam dígitos; texto Unicode e datas/valores conservam regras',()=>{
 const d=definition([custom('documento.cpf','cpf'),custom('documento.cnpj','cnpj'),custom('documento.texto'),custom('documento.dia','date'),custom('documento.numero','number')]);
 const input={content:d.content,overrides:{'documento.cpf':'52998224725','documento.cnpj':'11222333000181','documento.texto':'😀'.repeat(2000),'documento.dia':'2026-10-27','documento.numero':'12.500'},money_in_words:false};
 const r=resolveDocument(d,input,source21,[]);assert.deepEqual(r.issues,[]);assert.equal(r.formatted['documento.cpf'],'529.982.247-25');assert.equal(r.formatted['documento.cnpj'],'11.222.333/0001-81');assert.equal(r.values['documento.cnpj'],'11222333000181');assert.equal(r.formatted['documento.numero'],'12,5');
 for(const [key,value] of [['documento.cpf','11111111111'],['documento.cnpj','11222333000182'],['documento.texto','😀'.repeat(2001)],['documento.dia','2026-02-30'],['documento.numero','1,5']])assert.ok(resolveDocument(d,{...input,overrides:{...input.overrides,[key]:value}},source21,[]).issues.some(i=>i.key===key&&i.code==='invalid_value'),key);
});
test('pós21: DTO preserva autoria técnica somente com importaçãoUUID e aceita legado humano',()=>{
 const technical={...version,created_by:null,created_by_name:'Importação técnica',source_import_id:'00000000-0000-4000-a000-000000000999'};
 assert.equal(templateDetail({...detail,versions:[technical]}).versions[0].created_by,null);
 assert.equal(templateDetail({...detail,versions:[technical]}).versions[0].source_import_id,technical.source_import_id);
 assert.equal(templateDetail(detail).versions[0].created_by,version.created_by);
 for(const v of [{...technical,source_import_id:null},{...technical,source_import_id:'forjado'},{...technical,source_import_id:undefined},{...version,source_import_id:technical.source_import_id}])assert.throws(()=>templateDetail({...detail,versions:[v]}));
});
test('pós21: DTO documental aceita resolução manual2000 e recusa override não declarado',()=>{
 const d=definition([custom('documento.texto')]);const input={content:d.content,overrides:{'documento.texto':'😀'.repeat(2000)},money_in_words:false};
 const resolution=resolveDocument(d,input,source21,[]);const dto={...document21,template:{...document21.template,definition:d},input,...resolution};
 assert.equal(documentDetail(dto).values['documento.texto'],input.overrides['documento.texto']);assert.throws(()=>documentDetail({...dto,input:{...input,overrides:{'documento.outro':'x'}}}));
});

test('pós21: rascunho legado com nome121a500 permanece consultável com pendência, sem preparar',()=>{
 const d=definition([custom('cliente.nome')]);for(const length of [121,500]){const input={content:d.content,overrides:{'cliente.nome':'x'.repeat(length)},money_in_words:false};const resolution=resolveDocument(d,input,source21,[]);assert.ok(resolution.issues.some(i=>i.key==='cliente.nome'&&i.code==='invalid_value'));assert.equal(validDraftInput(input,d),true);const dto={...document21,template:{...document21.template,definition:d},input,...resolution};assert.equal(documentDetail(dto).input.overrides['cliente.nome'].length,length);}
});

test('pós21: tax_id manual aceita CPF/PJ por dígitos verificadores e recusa12/13 ou checksum inválido',()=>{
 const d=definition([custom('documento.identificador','tax_id')]);assert.equal(templates.validTemplate(d),true);
 for(const [value,formatted] of [['52998224725','529.982.247-25'],['11222333000181','11.222.333/0001-81']]){const r=resolveDocument(d,{content:d.content,overrides:{'documento.identificador':value},money_in_words:false},source21,[]);assert.deepEqual(r.issues,[]);assert.equal(r.values['documento.identificador'],value);assert.equal(r.formatted['documento.identificador'],formatted);}
 for(const value of ['52998224724','11222333000182','112223330001','1122233300018','11111111111'])assert.ok(resolveDocument(d,{content:d.content,overrides:{'documento.identificador':value},money_in_words:false},source21,[]).issues.some(i=>i.code==='invalid_value'),value);
 assert.equal(templates.templateVariables['cliente.cpf'].type,'text');assert.equal(Object.keys(templates.templateVariables).length,14);
});
