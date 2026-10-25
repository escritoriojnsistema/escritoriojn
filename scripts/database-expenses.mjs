// Disposable PostgreSQL harness only. Never accepts a database URL.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
const office='00000000-0000-4000-e000-000000000151';
const identity=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000151","session_id":"00000000-0000-4000-c000-000000000151"}';`;
const lit=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
export async function raceExpenses({sql,openSql,until}){
 let output='';
 for(const scenario of ['same-key','distinct-key','close-transfer','session-revoked']){
  const f=JSON.parse(sql(identity+'SELECT test.payment_fixture();').trim());
  const op={kind:'sangria',idempotency_key:randomUUID(),session_id:f.session,expected_session_version:1,source_account_id:f.cashaccount,destination_account_id:f.bank,amount_cents:6000,reason:'Movimentacao concorrente local17',evidence:'Conferencia do laboratorio local17'};
  const call=operation=>`SELECT public.transfer_operate('${office}',${lit(operation)})`;
  const a=openSql();let b;try{
   const first=scenario==='session-revoked'?`SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE`:scenario==='close-transfer'?`SELECT public.cash_operate('${office}',${lit({kind:'close',session_id:f.session,expected_version:1,idempotency_key:randomUUID(),counted_cents:10000,reason:'Fecho concorrente antes de transferencia'})})`:call(op);
   a.child.stdin.write(`BEGIN;${scenario==='session-revoked'?'':identity}${first};\n\\echo FINANCE17_HELD\n`);await until(()=>a.output().includes('FINANCE17_HELD'));
   const second=scenario==='distinct-key'?{...op,idempotency_key:randomUUID()}:op;
   b=openSql();b.child.stdin.end(`SET application_name='jn_finance17_race';${identity}${scenario==='same-key'?call(second):`SELECT test.expect_error(${lit(call(second))},'${scenario==='session-revoked'?'PT401':'PT409'}','17 corrida: ${scenario} blocked after lock')`};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance17_race' AND wait_event_type='Lock');").trim()==='t');
   if(scenario==='session-revoked')a.child.stdin.write("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000151';");
   a.child.stdin.end('COMMIT;\n');await a.result;const result=await b.result;if(scenario!=='same-key')output+=result;
   output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.financial_transfers WHERE session_id='${f.session}')=${['same-key','distinct-key'].includes(scenario)?1:0} AND(SELECT count(*) FROM private.cash_entries WHERE session_id='${f.session}' AND kind IN('transfer_in','transfer_out'))=${['same-key','distinct-key'].includes(scenario)?2:0},'17 corrida: ${scenario} atomic paired ledger');`);
  }finally{a.child.kill();b?.child.kill();if(scenario==='session-revoked')sql("INSERT INTO auth.sessions(id,user_id,not_after)VALUES('00000000-0000-4000-c000-000000000151','00000000-0000-4000-a000-000000000151',clock_timestamp()+interval '1 day');");}
 }
 for(const scenario of ['expense-same-key','expense-distinct-key','receipt-distinct-key']){
  const f=JSON.parse(sql(identity+'SELECT test.payment_fixture();').trim());let first,second,entity;
  if(scenario==='receipt-distinct-key'){
   const paid=JSON.parse(sql(identity+`SELECT public.payment_operate('${office}',test.payment_op(${lit(f)},1000));`).trim());entity=paid.payments.items[0].id;
   first=`SELECT public.payment_receipt('${office}','${entity}','${randomUUID()}')`;second=`SELECT public.payment_receipt('${office}','${entity}','${randomUUID()}')`;
  }else{
   const created=JSON.parse(sql(identity+`SELECT public.expense_operate('${office}',${lit({kind:'create',idempotency_key:randomUUID(),category:'Material',payee:'Fornecedor local17',description:'Despesa de concorrencia17',due_date:'2027-01-01',amount_cents:6000,evidence:'Comprovante local de teste17'})});`).trim());entity=created.expense.id;
   sql(identity+`SELECT public.expense_operate('${office}',${lit({kind:'approve',idempotency_key:randomUUID(),expense_id:entity,expected_version:1,evidence:'Aprovacao local de teste17'})});`);
   const pay={kind:'pay',idempotency_key:randomUUID(),expense_id:entity,expected_version:2,session_id:f.session,expected_session_version:1,account_id:f.cashaccount,evidence:'Pagamento local de teste17'};
   first=`SELECT public.expense_operate('${office}',${lit(pay)})`;second=scenario==='expense-same-key'?first:`SELECT public.expense_operate('${office}',${lit({...pay,idempotency_key:randomUUID()})})`;
  }
  const a=openSql();let b;try{
   a.child.stdin.write(`BEGIN;${identity}${first};\n\\echo FINANCE17_OTHER_HELD\n`);await until(()=>a.output().includes('FINANCE17_OTHER_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_finance17_other';${identity}${scenario==='expense-distinct-key'?`SELECT test.expect_error(${lit(second)},'PT409','17 corrida: expense different keys cannot double pay')`:second};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance17_other' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.end('COMMIT;\n');await a.result;const result=await b.result;if(scenario==='expense-distinct-key')output+=result;
   output+=sql(`SELECT test.assert_true(${scenario==='receipt-distinct-key'?`(SELECT count(*) FROM private.payment_receipts WHERE payment_id='${entity}')=1`:`(SELECT count(*) FROM private.cash_entries WHERE session_id='${f.session}' AND kind='expense_paid')=1`},'17 corrida: ${scenario} persistent single result');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 // Capability revocation while approve waits must defeat the originally eligible caller.
 {
  const create={kind:'create',idempotency_key:randomUUID(),category:'Material',payee:'Fornecedor local17',description:'Despesa para revogacao17',due_date:'2027-01-01',amount_cents:100,evidence:'Comprovante local de teste17'};
  const expense=JSON.parse(sql(identity+`SELECT public.expense_operate('${office}',${lit(create)});`).trim()).expense;
  const caps=['foundation.access','cash.read','expenses.read','expenses.approve'];
  const grant=permissions=>`SELECT public.team_set_member('${office}','00000000-0000-4000-b000-000000000153','admin',true,ARRAY[${permissions.map(lit).join(',')}],gen_random_uuid());`;
  sql(identity+grant(caps));
  const caller=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000153","session_id":"00000000-0000-4000-c000-000000000153"}';`;
  const approve=`SELECT public.expense_operate('${office}',${lit({kind:'approve',idempotency_key:randomUUID(),expense_id:expense.id,expected_version:1,evidence:'Aprovacao antes da revogacao17'})})`;
  const a=openSql();let b;try{
   a.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo APPROVAL17_HELD\n`);await until(()=>a.output().includes('APPROVAL17_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_approval17_revoke';${caller}SELECT test.expect_error(${lit(approve)},'PT403','17 revogacao: expenses.approve revalidated after lock');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_approval17_revoke' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.write(identity+grant(caps.filter(c=>c!=='expenses.approve')));a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
   output+=sql(`SELECT test.assert_true((SELECT status='pending' AND version=1 FROM private.expenses WHERE id='${expense.id}') AND(SELECT count(*) FROM private.expense_history WHERE expense_id='${expense.id}')=1,'17 revogacao: denied approval leaves expense/history unchanged');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 return output;
}

export function benchmarkExpenses({sql}){
 const f=JSON.parse(sql(identity+'SELECT test.payment_fixture();').trim());const times={page:[],transfer:[]};let version=1;
 for(let n=0;n<20;n++){
  const before=performance.now();sql(identity+`SELECT public.finance17_page('${office}','${f.session}',1);`);times.page.push(performance.now()-before);
  const transfer={kind:n%2===0?'sangria':'reforco',idempotency_key:randomUUID(),session_id:f.session,expected_session_version:version,source_account_id:n%2===0?f.cashaccount:f.bank,destination_account_id:n%2===0?f.bank:f.cashaccount,amount_cents:1,reason:'Medicao local de transferencia17',evidence:'Conferencia sintetica local17'};
  const started=performance.now();try{sql(identity+`SELECT public.transfer_operate('${office}',${lit(transfer)});`);}catch(error){throw new Error(`Benchmark17 iteration ${n}, expected ${version}, source ${transfer.source_account_id}, destination ${transfer.destination_account_id}; actual ${sql(`SELECT jsonb_build_object('session',to_jsonb(s),'source_funds',private.finance17_funds('${office}',s.id,'${transfer.source_account_id}')) FROM private.cash_sessions s WHERE s.id='${f.session}';`)}; ${error.message}`);}times.transfer.push(performance.now()-started);version++;
 }
 const measures=Object.fromEntries(Object.entries(times).map(([key,values])=>{values.sort((a,b)=>a-b);return[key,{samples:values.length,median_ms:values[9],p95_ms:values[18],max_ms:values[19]}];}));
 mkdirSync('docs/evidencias/etapa-17',{recursive:true});writeFileSync('docs/evidencias/etapa-17/desempenho-local.json',JSON.stringify({environment:'Disposable PostgreSQL17; authenticated RPC; includes Docker/psql process',scenario:'20 pages +20 paired one-cent transfers alternating sangria/reforco on one own session',measures,limitation:'Local laboratory only; no hosted load, latency or SLA claim'},null,2)+'\n');
 return sql(`SELECT test.assert_true((SELECT count(*) FROM private.financial_transfers WHERE session_id='${f.session}')=20 AND(SELECT count(*) FROM private.cash_entries WHERE session_id='${f.session}' AND kind IN('transfer_in','transfer_out'))=40 AND(SELECT coalesce(sum(cash_cents),0) FROM private.cash_entries WHERE session_id='${f.session}')=0,'17: benchmark20 paired transfers preserve funds');`);
}
