// Only called by the disposable SQL harness. No hosted connection option.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
const office='00000000-0000-4000-e000-000000000151';
const identity=(n=151)=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
const lit=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
const call=op=>`SELECT public.payment_operate('${office}',${lit(op)})`;
export async function racePayments({sql,openSql,until}){
 let output='';const fixture=()=>JSON.parse(sql(identity()+`SELECT test.payment_fixture();`).trim());
 const operation=(f,amount=6000)=>JSON.parse(sql(identity()+`SELECT test.payment_op(${lit(f)},${amount});`).trim());
 for(const scenario of ['same-command','different-sessions','close-confirm']){
  const f=fixture();let first=operation(f),second={...first,idempotency_key:randomUUID()};
  if(scenario==='same-command')second=first;
  if(scenario==='different-sessions'){const other=fixture();second={...operation(other),allocations:first.allocations};}
  if(scenario==='close-confirm'){
   const pending=JSON.parse(sql(identity()+call({...first,status:'pending'})+';').trim()).payments.items[0];
   first={kind:'close',session_id:f.session,expected_version:1,idempotency_key:randomUUID(),counted_cents:10000,reason:'Fecho de corrida15'};
   second={kind:'confirm',session_id:f.session,expected_version:2,idempotency_key:randomUUID(),payment_id:pending.id,evidence:'Conferencia apos espera15'};
  }
  const a=openSql();let b;try{
   a.child.stdin.write(`BEGIN;${identity()}${scenario==='close-confirm'?`SELECT public.cash_operate('${office}',${lit(first)})`:call(first)};\n\\echo PAYMENT_LOCK_HELD\n`);
   await until(()=>a.output().includes('PAYMENT_LOCK_HELD'));b=openSql();b.child.stdin.end(`SET application_name='jn_payment15_race';${identity()}${scenario==='same-command'?call(second):`SELECT test.expect_error(${lit(call(second))},'PT409','15: corrida ${scenario} impede sobrealocacao/confirmacao')`};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_payment15_race' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.end('COMMIT;\n');await a.result;const result=await b.result;if(scenario!=='same-command')output+=result;
   output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.payments WHERE session_id='${f.session}')=1 AND(SELECT coalesce(sum(applied_cents),0) FROM private.cash_entries WHERE session_id='${f.session}')=${scenario==='close-confirm'?0:6000},'15: corrida ${scenario} produz um efeito');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 // Revoke the real session while the new RPC waits at its office lock.
 const f=fixture(),op=operation(f),lock=openSql();let pending;
 try{
  lock.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo PAYMENT_REVOKE_HELD\n`);await until(()=>lock.output().includes('PAYMENT_REVOKE_HELD'));
  pending=openSql();pending.child.stdin.end(`SET application_name='jn_payment15_revoke';${identity()}SELECT test.expect_error(${lit(call(op))},'PT401','15: sessao revogada durante lock bloqueia comando');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_payment15_revoke' AND wait_event_type='Lock');").trim()==='t');
  // Raw fixture revocation models Auth invalidation; restore only this synthetic session.
  lock.child.stdin.write("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000151';COMMIT;\n");lock.child.stdin.end();await lock.result;output+=await pending.result;
  output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.payments WHERE session_id='${f.session}'),'15: revogacao deixa zero efeito');`);
 }finally{lock.child.kill();pending?.child.kill();sql("INSERT INTO auth.sessions(id,user_id,not_after)VALUES('00000000-0000-4000-c000-000000000151','00000000-0000-4000-a000-000000000151',clock_timestamp()+interval '1 day')ON CONFLICT DO NOTHING;");}
 return output;
}
export function benchmarkPayments({sql}){
 const f=JSON.parse(sql(identity()+`SELECT test.payment_fixture();`).trim()),samples=[];let version=1;
 for(let n=0;n<30;n++){
  const op={kind:'record',session_id:f.session,expected_version:version,idempotency_key:randomUUID(),evidence:'Conferencia local benchmark15',payment_method_id:f.pix,status:'confirmed',allocations:f.charges.map(c=>({charge_id:c.id,expected_charge_version:1,amount_cents:1})),presented_cents:null,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null};
  const start=performance.now();const result=JSON.parse(sql(identity()+call(op)+';').trim());samples.push(performance.now()-start);version=result.session.version;
 }
 samples.sort((a,b)=>a-b);const evidence={scenario:'30 comandos locais sequenciais, duas alocacoes cada, RPC+ledger+auditoria+avisos+extrato+pagina, inclui processo Docker/psql',samples:samples.length,median_ms:samples[14],p95_ms:samples[28],max_ms:samples[29],limitation:'Laboratorio descartavel; nao mede rede/browser hospedado ou SLA.'};
 writeFileSync('docs/evidencias/etapa-15/desempenho-local.json',JSON.stringify(evidence,null,2)+'\n');
 return sql(`SELECT test.assert_true((SELECT sum(applied_cents) FROM private.cash_entries WHERE session_id='${f.session}')=60 AND(SELECT count(*) FROM private.payments WHERE session_id='${f.session}')=30,'15: benchmark conserva fonte unica e totais exatos');`);
}
