// Only the caller-owned disposable PG harness is accepted, never a hosted URL.
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {mkdirSync,writeFileSync} from 'node:fs';
const office='00000000-0000-4000-e000-000000000151';
const id=n=>`00000000-0000-4000-b000-${String(n).padStart(12,'0')}`;
const identity=(n=151)=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
const lit=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
const call=op=>`SELECT public.correction_operate('${office}',${lit(op)})`;
const caps=['foundation.access','cash.read','cash.open','cash.read_all','requests.read','requests.read_all','charges.read','charges.adjust'];
export async function raceCorrections({sql,openSql,until}){
 let output='';
 const fixture=()=>JSON.parse(sql(identity()+`SELECT test.correction_fixture();`).trim());
 const operation=(f,amount=4000)=>({kind:'reverse',session_id:f.session,expected_version:2,idempotency_key:randomUUID(),allocation_id:f.allocation,refund_now:false,amount_cents:amount,reason:'Correcao concorrente local16',evidence:'Conferencia concorrente local16'});
 function colleague(f){
  sql(identity()+`SELECT public.team_set_member('${office}','${id(153)}','admin',true,ARRAY[${caps.map(lit).join(',')}],gen_random_uuid());`);
  return JSON.parse(sql(identity(153)+`SELECT public.cash_open('${office}','${f.unit}','${f.cashaccount}',10000,gen_random_uuid());`).trim()).sessions.find(s=>s.unit_id===f.unit).id;
 }
 for(const scenario of ['same-key','distinct-sessions-reverse','distinct-sessions-refund','close-correction','adjust-after-reversal','cancel-after-reversal']){
  const f=fixture();let first=operation(f),second={...first,idempotency_key:randomUUID()},secondActor=151,firstCall;
  if(scenario==='same-key')second=first;
  if(scenario.startsWith('distinct-sessions')){second.session_id=colleague(f);second.expected_version=1;secondActor=153;}
  if(scenario==='distinct-sessions-refund'){
   const pending=JSON.parse(sql(identity()+call(operation(f,6000))+';').trim());
   const source=JSON.parse(sql(identity()+`SELECT public.correction_sources('${office}','${f.session}','refund','',1);`).trim()).items[0];
   first={kind:'refund',session_id:f.session,expected_version:pending.session.version,idempotency_key:randomUUID(),reversal_id:source.reversal_id,amount_cents:4000,reason:'Devolucao concorrente local16',evidence:'Dinheiro devolvido no laboratorio16'};second={...first,session_id:second.session_id,expected_version:1,idempotency_key:randomUUID()};
  }
  if(scenario==='close-correction'){
   firstCall=`SELECT public.cash_operate('${office}',${lit({kind:'close',session_id:f.session,expected_version:2,idempotency_key:randomUUID(),counted_cents:16000,reason:'Fechar durante correcao local16'})})`;
   second={...second,expected_version:3};
  }else if(scenario==='adjust-after-reversal'){
   second=`SELECT public.charges_mutate('${office}','${f.charges[0].id}',1,'{"kind":"adjust","delta_cents":-9000,"reason":"Ajuste abaixo do restante alocado","installments":[{"due_date":"2027-01-01","amount_cents":1000}]}',gen_random_uuid())`;
  }else if(scenario==='cancel-after-reversal'){
   first=operation(f,6000);second=`SELECT public.charges_mutate('${office}','${f.charges[0].id}',1,'{"kind":"cancel","reason":"Cancelar apos reversao logica"}',gen_random_uuid())`;
  }
  firstCall??=call(first);if(scenario.startsWith('distinct-sessions'))firstCall+=`;SELECT public.request_mutate('${office}','${f.charges[0].request_id}',1,${lit({kind:'transfer',assignee_id:id(153),reason:'Transferir apos primeira correcao concorrente'})},gen_random_uuid())`;const bCall=typeof second==='string'?second:call(second),a=openSql();let b;
  try{
   a.child.stdin.write(`BEGIN;${identity()}${firstCall};\n\\echo CORRECTION_HELD\n`);await until(()=>a.output().includes('CORRECTION_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_correction16_race';${identity(secondActor)}${['same-key','cancel-after-reversal'].includes(scenario)?bCall:`SELECT test.expect_error(${lit(bCall)},'PT409','16 corrida: ${scenario} respeita limite ou fecho')`};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_correction16_race' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.end('COMMIT;\n');await a.result;const result=await b.result;if(!['same-key','cancel-after-reversal'].includes(scenario))output+=result;
   output+=sql(`SELECT test.assert_true((SELECT coalesce(sum(amount_cents),0) FROM private.payment_reversals WHERE allocation_id='${f.allocation}')=${scenario==='close-correction'?0:scenario==='distinct-sessions-refund'||scenario==='cancel-after-reversal'?6000:4000} AND(SELECT coalesce(sum(amount_cents),0) FROM private.payment_refunds WHERE reversal_id IN(SELECT id FROM private.payment_reversals WHERE allocation_id='${f.allocation}'))=${scenario==='distinct-sessions-refund'?4000:0},'16 corrida: ${scenario} conserva limites e fonte unica');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 // Authoritative state may change while the RPC waits. Re-check identity, capability and scope.
 for(const scenario of ['session','capability','responsibility']){
  const f=fixture();let op=operation(f),actor=151;
  if(scenario==='capability'){op.session_id=colleague(f);op.expected_version=1;actor=153;sql(identity()+`SELECT public.request_mutate('${office}','${f.charges[0].request_id}',1,${lit({kind:'transfer',assignee_id:id(153),reason:'Atribuicao autorizada antes de revogar capacidade'})},gen_random_uuid());`);}
  const a=openSql();let b;try{
   a.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo REVOKE16_HELD\n`);await until(()=>a.output().includes('REVOKE16_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_correction16_revoke';${identity(actor)}SELECT test.expect_error(${lit(call(op))},'${scenario==='session'?'PT401':'PT403'}','16 revogacao: ${scenario} apos espera bloqueia correcao');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_correction16_revoke' AND wait_event_type='Lock');").trim()==='t');
   if(scenario==='session')a.child.stdin.write("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000151';");
   if(scenario==='capability')a.child.stdin.write(identity()+`SELECT public.team_set_member('${office}','${id(153)}','admin',true,ARRAY[${caps.filter(c=>c!=='charges.adjust').map(lit).join(',')}],gen_random_uuid());`);
   if(scenario==='responsibility')a.child.stdin.write(identity()+`SELECT public.request_mutate('${office}','${f.charges[0].request_id}',1,${lit({kind:'transfer',assignee_id:id(153),reason:'Transferir durante espera da correcao'})},gen_random_uuid());`);
   a.child.stdin.end('COMMIT;\n');await a.result;output+=await b.result;output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.payment_reversals WHERE allocation_id='${f.allocation}'),'16 revogacao: ${scenario} deixa zero efeito');`);
  }finally{a.child.kill();b?.child.kill();if(scenario==='session')sql("INSERT INTO auth.sessions(id,user_id,not_after)VALUES('00000000-0000-4000-c000-000000000151','00000000-0000-4000-a000-000000000151',clock_timestamp()+interval '1 day');");}
 }
 return output;
}
export function benchmarkCorrections({sql}){
 const f=JSON.parse(sql(identity()+`SELECT test.correction_fixture('pix');`).trim());const samples=[];let version=2;
 for(let n=0;n<20;n++){
  const op={kind:'reverse',session_id:f.session,expected_version:version,idempotency_key:randomUUID(),allocation_id:f.allocation,refund_now:n%2===0,amount_cents:1,reason:'Benchmark local proporcional16',evidence:'Evidencia sintetica local16'};
  const start=performance.now();const v=JSON.parse(sql(identity()+call(op)+';').trim());samples.push(performance.now()-start);version=v.session.version;
 }
 samples.sort((a,b)=>a-b);mkdirSync('docs/evidencias/etapa-16',{recursive:true});writeFileSync('docs/evidencias/etapa-16/desempenho-local.json',JSON.stringify({scenario:'20 correcoes sequenciais, metade com devolucao conjunta; transacao, ledger, limites, audit, avisos e retorno oficial; inclui processo Docker/psql',samples:20,median_ms:samples[9],p95_ms:samples[18],max_ms:samples[19],limitation:'Laboratorio local; nao mede SLA ou latencia de rede hospedada.'},null,2)+'\n');
 return sql(`SELECT test.assert_true((SELECT sum(amount_cents) FROM private.payment_reversals WHERE allocation_id='${f.allocation}')=20 AND(SELECT sum(f.amount_cents) FROM private.payment_refunds f JOIN private.payment_reversals r ON r.office_id=f.office_id AND r.id=f.reversal_id WHERE r.allocation_id='${f.allocation}')=10,'16: benchmark preserva20estornados10devolvidos');`);
}
