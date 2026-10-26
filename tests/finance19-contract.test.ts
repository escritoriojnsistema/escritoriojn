import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validQuickOperation,validReportFilters} from '../shared/finance19.js';
import {csvCell,financialCsv} from '../server/modules/finance/export.js';
const id='11111111-1111-4111-8111-111111111111';
const filters={view:'obligations',scope:'own',from_date:'2026-10-25',until_date:'2026-10-26',unit_id:null,operator_id:null,service_id:null,payment_type:'all',account_id:null,status:'all',customer_id:null};
const operation={session_id:id,expected_session_version:1,service_id:id,expected_service_version:1,quantity:10,adjustment:{kind:'none',value:0,reason:''},quoted_total_cents:500,payment_method_id:id,presented_cents:1000,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null,evidence:'Dinheiro recebido e conferido',idempotency_key:id};
test('19: quantidade10 e total500 são conferência otimista, payload financeiro é fechado',()=>{
 assert.equal(validQuickOperation(operation),true);
 for(const change of [{quantity:0},{quantity:10.5},{quoted_total_cents:5.5},{actor_id:id},{unit_price_cents:50},{expected_service_version:0},{evidence:' comprovante '},{adjustment:{kind:'discount',value:10001,reason:'Desconto'}}])assert.equal(validQuickOperation({...operation,...change}),false);
 assert.equal(validQuickOperation({...operation,quoted_total_cents:0,payment_method_id:null,presented_cents:null,fee_cents:0}),true);
});
test('19: filtros respeitam visão, datas reais, intervalo e nenhum campo de autoridade',()=>{
 assert.equal(validReportFilters(filters),true);
 for(const change of [{view:'other'},{from_date:'2026-02-30'},{until_date:'2026-10-25'},{from_date:'2020-01-01'},{unit_id:id},{payment_type:'pix'},{status:'confirmed'},{role_code:'owner'}])assert.equal(validReportFilters({...filters,...change}),false);
 assert.equal(validReportFilters({...filters,view:'movements',unit_id:id,payment_type:'pix',status:'confirmed'}),true);
 assert.equal(validReportFilters({...filters,view:'cash',status:'closed',account_id:id}),true);
 assert.equal(validReportFilters({...filters,view:'cash',service_id:id}),false);
});
test('19 CSV: neutraliza fórmulas e conserva vírgula, aspas e Unicode em uma célula',()=>{
 for(const value of ['=HYPERLINK("https://example.invalid")',' +cmd','-1+2','@SUM(1)','\t=1','\r=1','\uFEFF\u00a0=1'])assert.ok(csvCell(value).startsWith('"\''),JSON.stringify(value));
 assert.equal(csvCell('Xerox, "Ação"'),'"Xerox, ""Ação"""');assert.equal(csvCell('Serviço simples'),'"Serviço simples"');
 assert.throws(()=>financialCsv({} as never,[]));
});
