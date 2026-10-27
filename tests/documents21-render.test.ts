import test from 'node:test';import assert from 'node:assert/strict';
import {documentMoneyWords,resolveDocument} from '../shared/documentRender.js';
import {validDraftInput,validParticipants,validDocumentOperation} from '../shared/documents.js';
import {definition21,source21,participants21,draft21,id21} from './fixtures/documents21.js';
test('documentos21: valores por extenso exatos, singulares, centavos e limites',()=>{
 for(const [c,w] of [[0,'zero reais'],[1,'um centavo'],[2,'dois centavos'],[100,'um real'],[101,'um real e um centavo'],[10000,'cem reais'],[10100,'cento e um reais'],[100000,'mil reais'],[110000,'mil e cem reais'],[110100,'mil cento e um reais'],[100000000,'um milhão de reais'],[200000001,'dois milhões de reais e um centavo'],[123456789,'um milhão duzentos e trinta e quatro mil quinhentos e sessenta e sete reais e oitenta e nove centavos']] as const)assert.equal(documentMoneyWords(c),w,String(c));
 assert.match(documentMoneyWords(99999999999),/noventa e nove centavos$/);for(const c of [-1,.5,100000000000,NaN,Infinity])assert.throws(()=>documentMoneyWords(c));
});
test('documentos21: resolução conserva papéis/fontes e usa datasBR e valores com extenso',()=>{const r=resolveDocument(definition21,draft21,source21,participants21);assert.deepEqual(r.issues,[]);assert.match(r.rendered_content,/Bruno Comprador compra de Sônia Vendedora/);assert.match(r.rendered_content,/26\/10\/2026/);assert.match(r.rendered_content,/R\$ 10,50 \(dez reais e cinquenta centavos\)/);assert.equal(source21.service.total_cents,1050);});
test('documentos21: obrigatório ausente, placeholder removido ou parte ausente não se finaliza',()=>{
 assert.ok(resolveDocument(definition21,{...draft21,overrides:{}},source21,participants21).issues.some(i=>i.key==='cliente.endereco'&&i.code==='required'));
 assert.ok(resolveDocument(definition21,{...draft21,content:draft21.content.replace('{{valores.total}}','10 reais')},source21,participants21).issues.some(i=>i.code==='missing_placeholder'));
 assert.ok(resolveDocument(definition21,draft21,source21,participants21.filter(p=>p.role!=='buyer')).issues.some(i=>i.code==='participant_required'));
});
test('documentos21: rascunho parcial/HTML literal é preservado sem executar nem inventar dados',()=>{const input={...draft21,content:'<img src=x onerror=alert(1)> {{cliente.endereco}} {{desconhecido}} {{datas.'};assert.equal(validDraftInput(input),true);const r=resolveDocument(definition21,input,source21,participants21);assert.ok(r.issues.some(i=>i.code==='unknown_variable'));assert.ok(r.issues.some(i=>i.code==='invalid_placeholder'));assert.match(r.rendered_content,/<img src=x onerror=alert\(1\)>/);assert.match(r.rendered_content,/{{desconhecido}}/);});
test('documentos21: data inexistente, CPF e decimal inválidos viram pendências claras',()=>{
 for(const value of ['2026-02-30','0000-01-01','2026-10-'])assert.ok(resolveDocument(definition21,{...draft21,overrides:{...draft21.overrides,'datas.emissao':value}},source21,participants21).issues.some(i=>i.key==='datas.emissao'&&i.code==='invalid_value'));
 for(const value of ['-1','1.001','1,50','1000000000',''])assert.ok(resolveDocument(definition21,{...draft21,overrides:{...draft21.overrides,'valores.total':value}},source21,participants21).issues.some(i=>i.key==='valores.total'));
 assert.match(resolveDocument(definition21,{...draft21,overrides:{...draft21.overrides,'valores.total':'999999999.99'}},source21,participants21).formatted['valores.total'],/^R\$ 999\.999\.999,99$/);
});
test('documentos21: contratos fechados, participantes limitados, chaves e revisão esperada',()=>{
 assert.equal(validParticipants(participants21.map(({role,customer_id,label})=>({role,customer_id,label}))),true);assert.equal(validParticipants([{role:'buyer',customer_id:id21(1),label:'Comprador'},{role:'seller',customer_id:id21(1),label:'Vendedor'}]),false);
 assert.equal(validDraftInput({...draft21,overrides:{'auth.token':'forjado'}}),false);assert.equal(validDraftInput({...draft21,actor_id:id21(1)}),false);
 assert.equal(validDocumentOperation({kind:'save',expected_revision:1,input:draft21,idempotency_key:id21(1)}),true);assert.equal(validDocumentOperation({kind:'prepare',expected_revision:0,idempotency_key:id21(1)}),false);
});
test('documentos21: expansão excessiva conserva rascunho literal e bloqueia conclusão sem truncar',()=>{const content='{{cliente.endereco}}'.repeat(1000);const r=resolveDocument(definition21,{...draft21,content,overrides:{'cliente.endereco':'a'.repeat(500)}},source21,participants21);assert.equal(r.rendered_content,content);assert.ok(r.issues.some(i=>i.key==='content'&&i.code==='invalid_value'));assert.equal(content.length,20000);});
test('documentos21: identidade UUID ignora caixa em comprador, vendedor e pares',()=>{const id='abcdefab-1234-4abc-8abc-abcdefabcdef';const part=(role:'buyer'|'seller'|'other',customer_id:string)=>({role,customer_id,label:'Parte'});assert.equal(validParticipants([part('buyer',id),part('seller',id.toUpperCase())]),false);assert.equal(validParticipants([part('other',id),part('other',id.toUpperCase())]),false);});
