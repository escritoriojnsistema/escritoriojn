// Disposable PostgreSQL harness only. No database URL, hosted fixture or prior evidence writes.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
const office='00000000-0000-4000-e000-000000000151';
const identity=(n=151)=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
const lit=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
const closure=op=>`SELECT public.closure_operate('${office}',${lit(op)})`;
export function prepareClosures({sql}){
 sql(`CREATE TABLE test.closure_aliases_before18 AS SELECT p.oid,md5(p.prosrc) hash FROM pg_proc p WHERE p.pronamespace='private'::regnamespace AND(p.proname LIKE 'cash_%before%' OR p.proname IN('cash_operate','cash_statement_record'));CREATE TABLE test.closure_reports_before18 AS SELECT id,to_jsonb(r) snapshot FROM private.audit_reports r;CREATE TABLE test.closure_saved18(op jsonb,result jsonb);GRANT SELECT ON test.closure_saved18 TO authenticated;`);
 const f=JSON.parse(sql(identity()+'SELECT test.payment_fixture();').trim());
 const op={kind:'close',session_id:f.session,expected_version:1,idempotency_key:randomUUID(),counted_cents:10000,reason:'Fecho legado antes de ativar18'};
 const result=JSON.parse(sql(identity()+`SELECT public.cash_operate('${office}',${lit(op)});`).trim());
 sql(`INSERT INTO test.closure_saved18 VALUES(${lit(op)},${lit(result)});`);
}
export async function raceClosures({sql,openSql,until}){
 let output='';
 const fixture=()=>JSON.parse(sql(identity()+'SELECT test.payment_fixture();').trim());
 const close=f=>JSON.parse(sql(identity()+`SELECT test.closure_op(${lit(f)});`).trim());
 const payment=f=>JSON.parse(sql(identity()+`SELECT test.payment_op(${lit(f)},1000);`).trim());
 for(const scenario of ['same-key','close-payment','payment-close','transfer-close','close-transfer']){
  const f=fixture(),op=close(f),pay=payment(f);
  const transfer={kind:'sangria',session_id:f.session,expected_session_version:1,idempotency_key:randomUUID(),source_account_id:f.cashaccount,destination_account_id:f.bank,amount_cents:1000,reason:'Sangria concorrente com fecho18',evidence:'Conferencia manual sintetica18'};
  const payCall=`SELECT public.payment_operate('${office}',${lit(pay)})`,transferCall=`SELECT public.transfer_operate('${office}',${lit(transfer)})`;
  const first=scenario==='payment-close'?payCall:scenario==='transfer-close'?transferCall:closure(op);
  const second=scenario==='close-payment'?payCall:scenario==='close-transfer'?transferCall:closure(op);
  const a=openSql();let b;
  try{
   a.child.stdin.write(`BEGIN;${identity()}${first};\n\\echo CLOSURE18_HELD\n`);await until(()=>a.output().includes('CLOSURE18_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_closure18_race';${identity()}${scenario==='same-key'?second:`SELECT test.expect_error(${lit(second)},'PT409','18 race ${scenario}: blocked after shared lock')`};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_closure18_race' AND wait_event_type='Lock');").trim()==='t');
   a.child.stdin.end('COMMIT;\n');await a.result;const result=await b.result;if(scenario!=='same-key')output+=result;
   const closed=['same-key','close-payment','close-transfer'].includes(scenario);
   output+=sql(`SELECT test.assert_true((SELECT status='${closed?'closed':'open'}' AND version=2 FROM private.cash_sessions WHERE id='${f.session}') AND(SELECT count(*) FROM private.cash_closures WHERE session_id='${f.session}')=${closed?1:0} AND(SELECT count(*) FROM private.cash_entries WHERE session_id='${f.session}')=${scenario==='transfer-close'?2:1},'18 race ${scenario}: atomic snapshot ledger and version');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 // Revoke Auth while the operation waits after acquiring the office lock, at the session lock.
 {
  const f=fixture(),op=close(f),a=openSql();let b;try{
   a.child.stdin.write(`BEGIN;SELECT id FROM private.cash_sessions WHERE id='${f.session}' FOR UPDATE;\n\\echo CLOSURE18_SESSION_HELD\n`);await until(()=>a.output().includes('CLOSURE18_SESSION_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_closure18_revoke_session';${identity()}SELECT test.expect_error(${lit(closure(op))},'PT401','18 race: Auth revoked after office lock while waiting session');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_closure18_revoke_session' AND wait_event_type='Lock');").trim()==='t');
   sql("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000151';");a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
   output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_closures WHERE session_id='${f.session}') AND NOT EXISTS(SELECT FROM private.cash_entries WHERE session_id='${f.session}'),'18 race: revoked Auth leaves no snapshot or ledger');`);
  }finally{a.child.kill();b?.child.kill();sql("INSERT INTO auth.sessions(id,user_id,not_after)VALUES('00000000-0000-4000-c000-000000000151','00000000-0000-4000-a000-000000000151',clock_timestamp()+interval '1 day')ON CONFLICT DO NOTHING;");}
 }
 // Review capability revoked while waiting for the existing office lock. Normal current grants API.
 {
  const f=fixture(),op={...close(f)};op.counts[0].counted_cents++;
  const record=JSON.parse(sql(identity()+closure(op)+';').trim()).record;
  const caps=['foundation.access','cash.read','cash.read_all','cash.closure.approve'];
  const grant=permissions=>`SELECT public.team_set_member('${office}','00000000-0000-4000-b000-000000000153','admin',true,ARRAY[${permissions.map(lit).join(',')}],gen_random_uuid());`;
  sql(identity()+grant(caps));
  const review={kind:'review',session_id:f.session,expected_version:2,idempotency_key:randomUUID(),record_id:record.id,expected_record_version:1,decision:'approve',reason:'Revisao concorrente com revogacao18'};
  const a=openSql();let b;try{
   a.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo CLOSURE18_CAP_HELD\n`);await until(()=>a.output().includes('CLOSURE18_CAP_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_closure18_revoke_cap';${identity(153)}SELECT test.expect_error(${lit(closure(review))},'PT403','18 race: review capability revoked while waiting office');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_closure18_revoke_cap' AND wait_event_type='Lock');").trim()==='t');
   a.child.stdin.write(identity()+grant(caps.filter(c=>c!=='cash.closure.approve')));a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;
   output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_closure_reviews WHERE record_id='${record.id}') AND NOT EXISTS(SELECT FROM private.cash_commands WHERE kind='closure' AND idempotency_key='${review.idempotency_key}'),'18 race: revoked review leaves no decision or saved result');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 return output;
}
export function benchmarkClosures({sql}){
 const f=JSON.parse(sql(identity()+'SELECT test.payment_fixture();').trim()),times=[];
 for(let n=0;n<12;n++){const started=performance.now();sql(identity()+`SELECT public.closure_state('${office}','${f.session}',1,1);`);times.push(performance.now()-started);}
 times.sort((a,b)=>a-b);
 const explain=sql(`EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON) SELECT * FROM private.cash_entries WHERE office_id='${office}' AND session_id='${f.session}';`);
 mkdirSync('docs/evidencias/etapa-18',{recursive:true});writeFileSync('docs/evidencias/etapa-18/desempenho-banco-local.json',JSON.stringify({environment:'Disposable PostgreSQL17; includes Docker/psql process; no hosted SLA',samples:times.length,median_ms:times[5],p95_ms:times[11],explain:JSON.parse(explain.trim())},null,2)+'\n');
 return sql(`SELECT test.assert_true((SELECT count(*) FROM private.cash_closures WHERE session_id='${f.session}')=0,'18: read measurements produce no snapshots');`);
}
