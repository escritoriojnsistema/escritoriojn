import test from 'node:test';
import assert from 'node:assert/strict';
import { templateIssues, validTemplate, templateVariables } from '../shared/templates.js';
import {declaration} from './fixtures/templates.js';

test('modelos20: declaração de homologação reconhece nome/data e não perde demonstração',()=>{
 assert.equal(validTemplate(declaration),true);assert.deepEqual(templateIssues(declaration),[]);
 assert.equal(templateVariables['datas.emissao'].type,'date');assert.equal(templateVariables['valores.total'].type,'money');
});
test('modelos20: variáveis desconhecidas, incompletas, duplicadas e tipos divergentes são recusados',()=>{
 for(const change of [{content:'{{admin.token}}'},{content:'{{cliente.nome}'},{content:'{{cliente.nome}} }}'},{variables:[...declaration.variables,declaration.variables[0]]},{variables:[]},{variables:[{...declaration.variables[0],type:'date'},declaration.variables[1]]},{variables:[{...declaration.variables[0],required:'sim'},declaration.variables[1]]}])assert.equal(validTemplate({...declaration,...change}),false,JSON.stringify(change));
 assert.match(templateIssues({...declaration,variables:[]}).join(' '),/variáve/i);
});
test('modelos20: datas canônicas, limites e objetos fechados',()=>{
 for(const change of [{effective_from:'2026-02-30T00:00:00.000Z'},{effective_until:'infinity'},{effective_from:'2026-10-27T00:00:00.000Z',effective_until:'2026-10-26T00:00:00.000Z'},{review_required:'true'},{code:'invalido'},{kind:'invoice'},{signature_policy:'govbr_automatico'},{approved_by:'forjado'},{name:'a'.repeat(121)},{content:'\u0000'},{content:'a'.repeat(30001)}])assert.equal(validTemplate({...declaration,...change}),false,JSON.stringify(change).slice(0,150));
 assert.equal(validTemplate({...declaration,content:'😀'.repeat(30000),variables:[]}),true);
 assert.equal(validTemplate({...declaration,content:'<script>alert(1)</script>',variables:[]}),true,'texto é literal; UI deve escapar');
});
