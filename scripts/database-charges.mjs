// Only called by the disposable local database runner; no remote database option.
import {randomUUID} from 'node:crypto';
const office='00000000-0000-4000-e000-000000000131';
const actor=n=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
const plan='[{"due_date":"2026-11-01","amount_cents":4000}]';
const create=id=>`SELECT public.charges_create('${office}','${id}','${plan}','${randomUUID()}')`;
export async function raceCharges({sql,openSql,until}){
 const service=sql(`SELECT id FROM public.services WHERE code='CHARGE40' AND office_id='${office}';`).trim();
 const fixture=()=>sql(`${actor(131)}SELECT public.request_create('${office}',jsonb_build_object('origin','presencial','title','Corrida13 ficticia','customer_id',NULL,'assignee_id','00000000-0000-4000-b000-000000000131','priority','normal','priority_reason','','internal_note','','items',jsonb_build_array(jsonb_build_object('service_id','${service}','quantity',1,'adjustment','{"kind":"none","value":0,"reason":""}'::jsonb,'fields','{}'::jsonb,'participant_ids','[]'::jsonb,'checklist','[]'::jsonb))),gen_random_uuid(),gen_random_uuid())->>'id';`).trim();
 let output='';
 // Identical retries across two connections return one persisted result.
 const request=fixture(),command=create(request),a=openSql();let b;
 try{
  a.child.stdin.write(`BEGIN;${actor(131)}${command};\n\\echo CHARGE_CREATED\n`);await until(()=>a.output().includes('CHARGE_CREATED'));
  b=openSql();b.child.stdin.end(`SET application_name='jn_charges_retry';${actor(131)}${command};`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_charges_retry' AND wait_event_type='Lock');").trim()==='t');
  a.child.stdin.end('COMMIT;\n');await a.result;const repeated=JSON.parse((await b.result).trim());
  if(repeated.charge.due_cents!==4000)throw Error('Concurrent charge retry returned wrong debt.');
  output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.charges WHERE office_id='${office}' AND request_id='${request}')=1 AND (SELECT count(*) FROM private.charge_events WHERE charge_id='${repeated.charge.id}')=1,'cobrancas13: corrida mesma chave cria uma obrigacao/evento');`);
  const c=openSql();let d;
  try{
   c.child.stdin.write(`BEGIN;${actor(131)}SELECT public.charges_mutate('${office}','${repeated.charge.id}',1,'{"kind":"adjust","delta_cents":100,"reason":"Ajuste concorrente ficticio","installments":[{"due_date":"2026-11-01","amount_cents":4100}]}','${randomUUID()}');\n\\echo CHARGE_ADJUSTED\n`);await until(()=>c.output().includes('CHARGE_ADJUSTED'));
   d=openSql();d.child.stdin.end(`SET application_name='jn_charges_version';${actor(131)}SELECT test.expect_error($q$SELECT public.charges_mutate('${office}','${repeated.charge.id}',1,'{"kind":"cancel","reason":"Cancelamento concorrente"}','${randomUUID()}')$q$,'PT409','cobrancas13: versao serializa comandos financeiros diferentes');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_charges_version' AND wait_event_type='Lock');").trim()==='t');
   c.child.stdin.end('COMMIT;\n');await c.result;output+=await d.result;
  }finally{c.child.kill();d?.child.kill();}
 }finally{a.child.kill();b?.child.kill();}
 // A committed transfer takes effect before a blocked financial decision resumes.
 const transferred=fixture();const charged=JSON.parse(sql(`${actor(131)}${create(transferred)};`).trim());
 const transfer=openSql();let mutate;
 try{
  transfer.child.stdin.write(`BEGIN;${actor(131)}SELECT public.request_mutate('${office}','${transferred}',1,'{"kind":"transfer","assignee_id":"00000000-0000-4000-b000-000000000132","reason":"Transferencia concorrente13"}',gen_random_uuid());\n\\echo CHARGE_TRANSFERRED\n`);await until(()=>transfer.output().includes('CHARGE_TRANSFERRED'));
  mutate=openSql();mutate.child.stdin.end(`SET application_name='jn_charges_transferred';${actor(131)}SELECT test.expect_error($q$SELECT public.charges_mutate('${office}','${charged.charge.id}',1,'{"kind":"cancel","reason":"Responsabilidade anterior"}',gen_random_uuid())$q$,'PT403','cobrancas13: transferencia durante espera revoga escrita financeira');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_charges_transferred' AND wait_event_type='Lock');").trim()==='t');
  transfer.child.stdin.end('COMMIT;\n');await transfer.result;output+=await mutate.result;
 }finally{transfer.child.kill();mutate?.child.kill();}
 // Session revocation while a command is blocked must prevent any financial event.
 const lock=openSql();let revoked;
 try{
  lock.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo CHARGE_SESSION_LOCK\n`);await until(()=>lock.output().includes('CHARGE_SESSION_LOCK'));
  revoked=openSql();revoked.child.stdin.end(`SET application_name='jn_charges_revoked';${actor(132)}SELECT test.expect_error($q$SELECT public.charges_mutate('${office}','${charged.charge.id}',1,'{"kind":"cancel","reason":"Sessao revogada na espera"}',gen_random_uuid())$q$,'PT401','cobrancas13: sessao encerrada durante espera nao registra evento');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_charges_revoked' AND wait_event_type='Lock');").trim()==='t');
  sql("DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000132';");
  lock.child.stdin.end('COMMIT;\n');await lock.result;output+=await revoked.result;
  output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.charge_events WHERE charge_id='${charged.charge.id}')=1,'cobrancas13: transferencia/logout preservam obrigacao sem decisao');`);
 }finally{lock.child.kill();revoked?.child.kill();}
 return output;
}
export async function benchmarkCharges({sql,openSql}){
 if(process.env.JN_CHARGES_BENCHMARK!=='1')return;
 // Populate a separate fictitious office dataset only inside this runner's container.
 sql(`INSERT INTO public.requests(id,office_id,protocol,title,origin,status,created_by,assignee_id,priority,idempotency_key,payload_digest)
 SELECT gen_random_uuid(),'${office}','BENCH13-'||n,'Obrigacao benchmark ficticia','presencial','aberto','00000000-0000-4000-a000-000000000131','00000000-0000-4000-b000-000000000131','normal',gen_random_uuid(),'fixture' FROM generate_series(1,10000)n;
 INSERT INTO private.charges(office_id,request_id,created_by)SELECT office_id,id,created_by FROM public.requests WHERE office_id='${office}' AND protocol LIKE 'BENCH13-%';
 INSERT INTO public.request_items(office_id,request_id,service_id,version_id,snapshot,fields,participant_ids,checklist)
 SELECT r.office_id,r.id,i.service_id,i.version_id,i.snapshot,i.fields,i.participant_ids,i.checklist FROM public.requests r CROSS JOIN LATERAL(SELECT i.* FROM public.request_items i JOIN public.requests q ON q.id=i.request_id WHERE q.office_id='${office}' AND q.title='Corrida13 ficticia' LIMIT 1)i WHERE r.office_id='${office}' AND r.protocol LIKE 'BENCH13-%';
 INSERT INTO private.charge_items(office_id,charge_id,request_item_id,snapshot,quantity,unit_price_cents,total_cents)SELECT i.office_id,c.id,i.id,i.snapshot,1,4000,4000 FROM private.charges c JOIN public.requests r ON r.id=c.request_id JOIN public.request_items i ON i.request_id=r.id WHERE r.office_id='${office}' AND r.protocol LIKE 'BENCH13-%';
 INSERT INTO private.charge_events(office_id,charge_id,version,kind,delta_cents,reason,actor_id)SELECT c.office_id,c.id,1,'created',4000,'Benchmark local ficticio',c.created_by FROM private.charges c JOIN public.requests r ON r.id=c.request_id WHERE r.office_id='${office}' AND r.protocol LIKE 'BENCH13-%';
 INSERT INTO private.charge_installments(office_id,charge_id,version,number,due_date,amount_cents)SELECT c.office_id,c.id,1,1,'2026-11-01',4000 FROM private.charges c JOIN public.requests r ON r.id=c.request_id WHERE r.office_id='${office}' AND r.protocol LIKE 'BENCH13-%';
 ANALYZE private.charges;ANALYZE private.charge_items;ANALYZE private.charge_events;ANALYZE private.charge_installments;ANALYZE public.requests;ANALYZE public.request_items;`);
 const request=sql(`SELECT id FROM public.requests WHERE office_id='${office}' AND protocol='BENCH13-5000';`).trim();
 const callers=Array.from({length:10},()=>openSql());
 try{
  for(const c of callers)c.child.stdin.end(`${actor(131)}CREATE TEMP TABLE charge_measurements(ms numeric);DO $bench$DECLARE t timestamptz;n int;BEGIN FOR n IN 1..10 LOOP t:=clock_timestamp();PERFORM public.charges_view('${office}','${request}',1);INSERT INTO charge_measurements VALUES(extract(epoch FROM clock_timestamp()-t)*1000);END LOOP;END $bench$;SELECT jsonb_agg(ms)FROM charge_measurements;`);
  const v=(await Promise.all(callers.map(c=>c.result))).flatMap(x=>JSON.parse(x.trim())).map(Number).sort((a,b)=>a-b);
  console.log(`CHARGES_BENCHMARK ${JSON.stringify({environment:'disposable local PostgreSQL17; no hosted network SLA',additional_charges:10000,connections:10,samples:v.length,median_ms:v[Math.floor(v.length/2)],p95_ms:v[Math.ceil(v.length*.95)-1],max_ms:v.at(-1)})}`);
 }finally{for(const c of callers)c.child.kill();}
}
