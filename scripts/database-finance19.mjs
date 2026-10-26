// This module can mutate only the disposable runner's injected PostgreSQL connection.
import {setTimeout as delay} from 'node:timers/promises';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
const office='00000000-0000-4000-e000-000000000151';
const identity=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';`;
const lit=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
export async function raceFinance19({sql,openSql,until}){
 let output='';
 for(const scenario of ['quick-quick','close-quick','quick-close']){
 const f=JSON.parse(sql(identity+'SELECT test.quick_fixture19();').trim());
 const op=JSON.parse(sql(identity+`SELECT test.quick_op19(${lit(f)});`).trim());
 const cl=JSON.parse(sql(identity+`SELECT test.closure_op(${lit(f)});`).trim());
 const quick=`SELECT public.quick_operate('${office}',${lit(op)})`;
 const close=`SELECT public.closure_operate('${office}',${lit(cl)})`;
 const a=openSql();let b;
 try{
 a.child.stdin.write(`BEGIN;${identity}${scenario==='close-quick'?close:quick};\n\\echo FINANCE19_HELD\n`);
 await until(()=>a.output().includes('FINANCE19_HELD'));
 b=openSql();b.child.stdin.end(`SET application_name='jn_finance19_race';${identity}${scenario==='quick-quick'?quick:`SELECT test.expect_error(${lit(scenario==='close-quick'?quick:close)},'PT409','19 race ${scenario}: version and close serialized')`};`);
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance19_race' AND wait_event_type='Lock');").trim()==='t');
 a.child.stdin.end('COMMIT;\n');await a.result;output+=(await b.result).split('\n').filter(line=>line.startsWith('PASS:')).join('\n')+'\n';
 output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.quick_operations WHERE session_id='${f.session}')=${scenario==='close-quick'?0:1},'19 race ${scenario}: one atomic result');`);
 }finally{a.child.kill();b?.child.kill();}
 }
 // Revoke the real Auth session while quick waits after its office lock.
 {
 const f=JSON.parse(sql(identity+'SELECT test.quick_fixture19();').trim()),op=JSON.parse(sql(identity+`SELECT test.quick_op19(${lit(f)});`).trim());
 const a=openSql();let b;try{
 a.child.stdin.write(`BEGIN;SELECT id FROM private.cash_sessions WHERE id='${f.session}' FOR UPDATE;\n\\echo FINANCE19_AUTH_HELD\n`);await until(()=>a.output().includes('FINANCE19_AUTH_HELD'));
 b=openSql();b.child.stdin.end(`SET application_name='jn_finance19_auth';${identity}SELECT test.expect_error(${lit(`SELECT public.quick_operate('${office}',${lit(op)})`)},'PT401','19: Auth revoked while waiting session');`);
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance19_auth' AND wait_event_type='Lock');").trim()==='t');
 sql("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000151';");a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
 output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.quick_operations WHERE session_id='${f.session}'),'19: Auth revocation leaves no quick result');`);
 }finally{a.child.kill();b?.child.kill();sql("INSERT INTO auth.sessions(id,user_id,not_after)VALUES('00000000-0000-4000-c000-000000000151','00000000-0000-4000-a000-000000000151',clock_timestamp()+interval '1 day')ON CONFLICT DO NOTHING;");}
 }
 // A scheduled price becomes current during a genuine session-lock wait.
 for(const lockTarget of ['session','method']){
 const f=JSON.parse(sql(identity+'SELECT test.quick_fixture19();').trim());
 const definition=JSON.parse(sql(`SELECT v.definition FROM public.services s JOIN public.service_versions v ON v.service_id=s.id WHERE s.office_id='${office}' AND s.code='QUICK19' ORDER BY number DESC LIMIT 1;`).trim());
 const def={...definition,code:'WAIT19-'+lockTarget.toUpperCase(),effective_from:null};
 const service=JSON.parse(sql(identity+`SELECT public.service_create('${office}',${lit(def)},'Servico sintetico espera19','${randomUUID()}');`).trim());
 const target=sql("SELECT to_char((clock_timestamp()+interval '3 seconds')AT TIME ZONE 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"');").trim();
 sql(identity+`SELECT public.service_publish('${office}','${service.id}',${lit({...def,price_cents:51,effective_from:target})},1,'Preco agendado durante espera19','${randomUUID()}');`);
 const op={...JSON.parse(sql(identity+`SELECT test.quick_op19(${lit(f)});`).trim()),service_id:service.id};
 const a=openSql();let b;try{
 a.child.stdin.write(`BEGIN;SELECT id FROM ${lockTarget==='session'?'private.cash_sessions':'private.payment_methods'} WHERE id='${lockTarget==='session'?f.session:f.cash}' FOR UPDATE;\n\\echo FINANCE19_PRICE_HELD\n`);await until(()=>a.output().includes('FINANCE19_PRICE_HELD'));
 b=openSql();b.child.stdin.end(`SET application_name='jn_finance19_price';${identity}SELECT test.expect_error(${lit(`SELECT public.quick_operate('${office}',${lit(op)})`)},'PT409','19: effective price selected after ${lockTarget} lock wait');`);
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance19_price' AND wait_event_type='Lock');").trim()==='t');await delay(3100);
 a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
 output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.quick_operations WHERE session_id='${f.session}'),'19: stale price ${lockTarget} wait rolls back all work');`);
 }finally{a.child.kill();b?.child.kill();}
 }
 // Current capability revocation wins over a quick request already waiting on office authority.
 {
 const caps=['foundation.access','cash.read','cash.open','quick.perform','services.read','services.perform','requests.read','requests.create','requests.update','charges.read','charges.create','finance.reports.read','finance.reports.export'];
 const grant=permissions=>`SELECT public.team_set_member('${office}','00000000-0000-4000-b000-000000000152','employee',true,ARRAY[${permissions.map(lit).join(',')}],gen_random_uuid());`;
 sql(identity+grant(caps));
 const f=JSON.parse(sql(identity+'SELECT test.quick_fixture19();').trim());
 const employee=identity.replaceAll('000000000151','000000000152');
 const opened=JSON.parse(sql(employee+`SELECT public.cash_open('${office}','${f.unit}','${f.cashaccount}',10000,gen_random_uuid());`).trim());
 const op={...JSON.parse(sql(identity+`SELECT test.quick_op19(${lit(f)});`).trim()),session_id:opened.sessions[0].id};
 const a=openSql();let b;try{
 a.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo FINANCE19_CAP_HELD\n`);await until(()=>a.output().includes('FINANCE19_CAP_HELD'));
 b=openSql();b.child.stdin.end(`SET application_name='jn_finance19_cap';${employee}SELECT test.expect_error(${lit(`SELECT public.quick_operate('${office}',${lit(op)})`)},'PT403','19: quick.perform revoked during office wait');`);
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance19_cap' AND wait_event_type='Lock');").trim()==='t');
 a.child.stdin.write(identity+grant(caps.filter(c=>c!=='quick.perform')));a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
 output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_commands WHERE kind='quick' AND idempotency_key='${op.idempotency_key}'),'19: revoked capability wait leaves no command');`);
 }finally{a.child.kill();b?.child.kill();}
 }
 // Read/export replay cannot cross a customer-lock wait with an already revoked Auth session.
 for(const scenario of ['chunk','authorize-replay']){
 const customer=sql(`SELECT id FROM public.customers WHERE office_id='${office}' AND name='Nome pessoal fora do relatorio19' ORDER BY created_at DESC LIMIT 1;`).trim();
 const snapshot=JSON.parse(sql(identity+`SELECT public.finance_report_begin('${office}',test.report_filter19()||jsonb_build_object('customer_id','${customer}'),gen_random_uuid());`).trim());
 const key=randomUUID();const authorize=`SELECT public.finance_report_authorize('${office}','${snapshot.id}','csv','${key}')`;
 if(scenario==='authorize-replay')sql(identity+authorize+';');
 const call=scenario==='chunk'?`SELECT public.finance_report_chunk('${office}','${snapshot.id}',0)`:authorize;
 const a=openSql();let b;try{
 a.child.stdin.write(`BEGIN;SELECT id FROM public.customers WHERE id='${customer}' FOR UPDATE;\n\\echo FINANCE19_CUSTOMER_HELD\n`);await until(()=>a.output().includes('FINANCE19_CUSTOMER_HELD'));
 b=openSql();b.child.stdin.end(`SET application_name='jn_finance19_customer';${identity}SELECT test.expect_error(${lit(call)},'PT401','19: ${scenario} Auth revoked during customer lock wait');`);
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance19_customer' AND wait_event_type='Lock');").trim()==='t');
 sql("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000151';");a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
 }finally{a.child.kill();b?.child.kill();sql("INSERT INTO auth.sessions(id,user_id,not_after)VALUES('00000000-0000-4000-c000-000000000151','00000000-0000-4000-a000-000000000151',clock_timestamp()+interval '1 day')ON CONFLICT DO NOTHING;");}
 }
 return output;
}
export function benchmarkFinance19({sql}){
 const views={};
 for(const view of ['obligations','movements','cash']){
 const times=[];
 for(let n=0;n<12;n++){const started=performance.now();sql(identity+`SELECT public.finance_report_page('${office}',test.report_filter19('${view}'),1);`);times.push(performance.now()-started);}
 times.sort((a,b)=>a-b);views[view]={samples:times.length,median_ms:times[5],p95_ms:times[11]};
 }
 const projection=JSON.parse(sql(identity+`RESET ROLE;SELECT jsonb_build_object('total',b->'total','captured',jsonb_array_length(b->'items'),'payload_bytes',octet_length(b::text)) FROM(SELECT private.finance19_build('${office}',test.report_filter19('obligations'),5,0)b)x;`).trim());
 const explain=JSON.parse(sql(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)SELECT * FROM private.cash_entries WHERE office_id='${office}' AND created_at>=current_date AND created_at<current_date+1;`).trim());
 mkdirSync('docs/evidencias/etapa-19',{recursive:true});writeFileSync('docs/evidencias/etapa-19/desempenho-banco-local.json',JSON.stringify({environment:'Disposable PostgreSQL17; includes Docker/psql process; no hosted SLA',views,projection,explain},null,2)+'\n');
 return 'PASS: 19 local three-view timings, limited5 projection and EXPLAIN recorded without rewriting measurements14–18\n';
}
// Seed one genuine pre15 card receipt before the historical15 backfill runs.
export const finance19LegacySeed=`
SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
DO $fixture$ DECLARE office uuid:='00000000-0000-4000-e000-000000000151';u uuid;cash uuid;bank uuid;method uuid;cashmethod uuid;s uuid;svc uuid;r uuid;c uuid;entry uuid;BEGIN
 u:=(public.cash_configure(office,'{"kind":"unit","id":null,"expected_version":null,"name":"Legado cartao19","active":true}',gen_random_uuid())->'resource'->>'id')::uuid;
 cash:=(public.cash_configure(office,jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Especie legado19','active',true,'unit_id',u,'type','cash'),gen_random_uuid())->'resource'->>'id')::uuid;
 bank:=(public.cash_configure(office,jsonb_build_object('kind','account','id',NULL,'expected_version',NULL,'name','Banco legado19','active',true,'unit_id',u,'type','bank'),gen_random_uuid())->'resource'->>'id')::uuid;
 method:=(public.cash_configure(office,jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Cartao legado19','active',true,'unit_id',u,'type','card','destination_account_id',bank),gen_random_uuid())->'resource'->>'id')::uuid;
 cashmethod:=(public.cash_configure(office,jsonb_build_object('kind','payment_method','id',NULL,'expected_version',NULL,'name','Dinheiro legado19','active',true,'unit_id',u,'type','cash','destination_account_id',cash),gen_random_uuid())->'resource'->>'id')::uuid;
 s:=(public.cash_open(office,u,cash,1000,gen_random_uuid())->'sessions'->0->>'id')::uuid;
 svc:=(public.services_page(office,'FINANCE15',1,5)->'items'->0->>'id')::uuid;
 r:=(public.request_create(office,jsonb_build_object('origin','presencial','title','Cartao anterior15 sintetico19','customer_id',NULL,'assignee_id','00000000-0000-4000-b000-000000000151','priority','normal','priority_reason','','internal_note','','items',jsonb_build_array(jsonb_build_object('service_id',svc,'quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))),gen_random_uuid(),gen_random_uuid())->>'id')::uuid;
 c:=(public.charges_create(office,r,'[{"due_date":"2027-01-01","amount_cents":10000}]',gen_random_uuid())->'charge'->>'id')::uuid;
 entry:=(public.cash_operate(office,jsonb_build_object('kind','receive','session_id',s,'expected_version',1,'idempotency_key',gen_random_uuid(),'charge_id',c,'expected_charge_version',1,'payment_method_id',method,'amount_cents',1000))->'entries'->0->>'id')::uuid;
 PERFORM public.cash_operate(office,jsonb_build_object('kind','refund','session_id',s,'expected_version',2,'idempotency_key',gen_random_uuid(),'entry_id',entry,'amount_cents',200,'reason','Devolucao legado cartao19'));
 PERFORM public.cash_operate(office,jsonb_build_object('kind','reverse','session_id',s,'expected_version',3,'idempotency_key',gen_random_uuid(),'entry_id',entry,'amount_cents',800,'reason','Reversao legado cartao19'));
 entry:=(public.cash_operate(office,jsonb_build_object('kind','receive','session_id',s,'expected_version',4,'idempotency_key',gen_random_uuid(),'charge_id',c,'expected_charge_version',1,'payment_method_id',cashmethod,'amount_cents',1500))->'entries'->0->>'id')::uuid;
 PERFORM public.cash_operate(office,jsonb_build_object('kind','refund','session_id',s,'expected_version',5,'idempotency_key',gen_random_uuid(),'entry_id',entry,'amount_cents',500,'reason','Devolucao legado especie19'));
 PERFORM public.cash_operate(office,jsonb_build_object('kind','reverse','session_id',s,'expected_version',6,'idempotency_key',gen_random_uuid(),'entry_id',entry,'amount_cents',1000,'reason','Reversao legado especie19'));
END $fixture$;RESET ROLE;`;
export function verifyFinance19Legacy({sql}){
 const filters=`jsonb_build_object('view','movements','scope','own','from_date',current_date::text,'until_date',(current_date+1)::text,'unit_id',(SELECT id FROM test.report_legacy19_unit),'operator_id',NULL,'service_id',NULL,'payment_type','all','account_id',NULL,'status','all','customer_id',NULL)`;
 return sql(`RESET ROLE;CREATE TABLE test.report_legacy19_unit AS SELECT id FROM private.cash_units WHERE name='Legado cartao19';
 CREATE TABLE test.report_legacy19_source AS SELECT e.* FROM private.cash_entries e WHERE unit_id=(SELECT id FROM test.report_legacy19_unit);
 GRANT SELECT ON test.report_legacy19_unit,test.report_legacy19_source TO authenticated;
 SELECT test.assert_true((SELECT count(*) FROM test.report_legacy19_source WHERE kind='refunded')=2 AND(SELECT count(*) FROM test.report_legacy19_source WHERE kind='reversed')=2 AND(SELECT sum(applied_cents)=0 AND sum(cash_cents)=0 FROM test.report_legacy19_source),'19 historico: both genuine pre15 legacy kinds retain allocation/funds effects');
 SELECT test.assert_true((SELECT a.allocated_cents=0 AND a.balance_cents=10000 FROM private.charges_amounts('${office}',(SELECT charge_id FROM test.report_legacy19_source LIMIT 1))a),'19 historico: balance13 equals immutable legacy ledger net allocation0');
 SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';
 SELECT public.finance_report_page('${office}',${filters},1) AS legacy_page19 \\gset
 SELECT test.assert_true(:'legacy_page19'::jsonb @> '{"total":11,"summary":{"received_cents":2500,"reversed_cents":2500,"refund_cents":2500,"fee_cents":null,"unknown_fee_count":1}}','19 historico: legacy refunded AND reversed project both facts, received2500 once, unknown card fee remains null');
 SELECT public.finance_report_begin('${office}',${filters},gen_random_uuid()) AS legacy_snap19 \\gset
 SELECT public.finance_report_chunk('${office}',(:'legacy_snap19'::jsonb->>'id')::uuid,0) AS legacy_chunk19 \\gset
 SELECT test.assert_true(NOT EXISTS(SELECT FROM test.report_legacy19_source e WHERE kind IN('refunded','reversed') AND(SELECT count(*) FROM jsonb_array_elements(:'legacy_chunk19'::jsonb->'items')r WHERE(r->>'id')::uuid=e.id AND r->>'kind' IN('refund','reversal') AND(r->>'amount_cents')::bigint=e.amount_cents)<>2),'19 historico: each original legacy row has exactly one refund and reversal projection');
 SELECT test.assert_true(public.finance_report_page('${office}',${filters}||'{"view":"cash"}',1) @> '{"total":1,"items":[{"expected_cents":1000,"status":"open"}],"summary":{"cash_expected_cents":1000,"received_cents":null}}','19 historico: physical cash remains fund1000 after both legacy fund effects');
 SELECT test.assert_true(public.finance_report_page('${office}',${filters},1)->'items'=:'legacy_page19'::jsonb->'items','19 historico: timestamp/id/kind gives stable pagination for paired legacy projections');`);
}
