import test from 'node:test';
import assert from 'node:assert/strict';
import {parseImport37,validImportInput37,importExample37,validImportReport37} from '../shared/imports37.ts';
test('37: arquivo limitado preserva linhas inválidas para rejeição individual e evita coerção de centavos',()=>{
 const input=parseImport37(JSON.stringify(importExample37));assert.equal(input.rows.length,5);assert.equal(input.expected_debit_cents,0);assert.equal((input.rows[4] as any).name,'');
 for(const change of [{rows:[]},{rows:Array(101).fill({})},{as_of:'2026-02-30'},{expected_debit_cents:'0'},{expected_credit_cents:-1},{secret:'forbidden'}])assert.throws(()=>parseImport37(JSON.stringify({...importExample37,...change})));
 assert.throws(()=>parseImport37(' '.repeat(262145)));assert.throws(()=>parseImport37('{broken'));
});
test('37: relatório de lote não aceita valores financeiros inexatos ou autoridade/arquivo liberado',()=>{
 const report={batch_id:null,status:'preview',fingerprint:'a'.repeat(64),source:'Fonte',as_of:'2026-11-15',rows:[{row:1,source_id:'C001',name:'Pessoa',outcome:'create',reason:'NEW',opening_cents:0,customer_id:null,file_id:null}],debit_cents:0,credit_cents:0,expected_debit_cents:0,expected_credit_cents:0,ready:true};
 assert.equal(validImportReport37(report),true);assert.equal(validImportReport37({...report,debit_cents:0.1}),false);assert.equal(validImportReport37({...report,rows:[{...report.rows[0],outcome:'approved'}]}),false);
});
test('37: validação limita profundidade e recusa estruturas cíclicas sem lançar RangeError',()=>{
 let deep:unknown='value';for(let i=0;i<20;i++)deep={nested:deep};
 assert.throws(()=>parseImport37(JSON.stringify({...importExample37,rows:[deep]})),/Confira/);const cyclic:any={};cyclic.self=cyclic;assert.equal(validImportInput37({...importExample37,rows:[cyclic]}),false);
});
