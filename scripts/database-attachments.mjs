// All callbacks are supplied by the disposable-only SQL runner; no remote URL exists.
const office='00000000-0000-4000-e000-000000000091';
const user='00000000-0000-4000-a000-000000000092';
const member='00000000-0000-4000-b000-000000000092';
const session='00000000-0000-4000-c000-000000000092';
const owner=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000091","session_id":"00000000-0000-4000-c000-000000000091"}';`;
const actor=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"${user}","session_id":"${session}"}';`;
const quote=value=>`'${String(value).replaceAll("'","''")}'`;
const fixture=sql=>JSON.parse(sql(`SELECT jsonb_build_object('request_id',r.id,'request_item_id',i.id,'name','Corrida11.pdf','mime_type','application/pdf','size_bytes',100,'sha256',repeat('a',64),'classification','documento','idempotency_key','race-upload11') FROM public.requests r JOIN public.request_items i ON i.request_id=r.id WHERE r.protocol='ANEXO-11';`).trim());

export const raceAttachments=async({sql,openSql,until})=>{
 const input=fixture(sql);let result='';
 sql(`SELECT test.fixture_responsible('ANEXO-11','${member}');`);
 // Permission changes while begin_upload waits for the request must win.
 const lock=openSql();let caller;
 try{
  lock.child.stdin.write(`BEGIN;SELECT id FROM public.requests WHERE id=${quote(input.request_id)} FOR UPDATE;\\echo ATTACHMENT_HELD\n`);
  await until(()=>lock.output().includes('ATTACHMENT_HELD'));
  caller=openSql();caller.child.stdin.end(`SET application_name='jn_attachment_upload_wait';${actor}SELECT public.files_begin_upload('${office}',${quote(JSON.stringify(input))},gen_random_uuid());`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_upload_wait' AND wait_event_type='Lock');").trim()==='t');
  sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${member}' AND permission_code='files.upload';`);
  lock.child.stdin.end('COMMIT;\n');await lock.result;
  try{await caller.result;throw Error('Upload ignored revoked files.upload.');}catch(error){if(!String(error).includes('FILES_FORBIDDEN'))throw error;}
  if(sql("SELECT count(*) FROM private.upload_intents WHERE idempotency_key='race-upload11';").trim()!=='0')throw Error('Revoked upload persisted intent.');
  result+='PASS: anexos: upload apos lock revalida capacidade e nao persiste intencao\n';
 }finally{lock.child.kill();caller?.child.kill();sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${member}','files.upload')ON CONFLICT DO NOTHING;`);}
 // The network completion uses its captured actor, including session expiry during a lock wait.
 input.idempotency_key='race-complete11';
 const intent=JSON.parse(sql(`${actor}SELECT public.files_begin_upload('${office}',${quote(JSON.stringify(input))},gen_random_uuid());`).trim());
 const lease=JSON.parse(sql(`${actor}SELECT public.files_process_claim('${office}','validate',${quote(JSON.stringify({intent_id:intent.intent_id}))},gen_random_uuid());`).trim());
 const lock2=openSql();let completion;
 try{
  lock2.child.stdin.write(`BEGIN;SELECT id FROM public.requests WHERE id=${quote(input.request_id)} FOR UPDATE;\\echo ATTACHMENT_COMPLETE_HELD\n`);
  await until(()=>lock2.output().includes('ATTACHMENT_COMPLETE_HELD'));
  completion=openSql();completion.child.stdin.end(`SET application_name='jn_attachment_complete_wait';SET ROLE service_role;SELECT public.files_process_complete(${quote(lease.lease_id)},${quote(lease.lease_token)},'{"outcome":"missing","reason":"object_missing"}',gen_random_uuid());`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_complete_wait' AND wait_event_type='Lock');").trim()==='t');
  sql(`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${session}';`);
  lock2.child.stdin.end('COMMIT;\n');await lock2.result;
  try{await completion.result;throw Error('Completion ignored expired captured session.');}catch(error){if(!String(error).includes('AUTH_REQUIRED'))throw error;}
  if(sql(`SELECT validation_reason IS NULL FROM public.files WHERE id=${quote(intent.file.id)};`).trim()!=='t')throw Error('Denied completion changed file state.');
  result+='PASS: anexos: finalizacao apos rede e lock revalida sessao capturada\n';
 }finally{lock2.child.kill();completion?.child.kill();sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='${session}';`);}
 // Reserve under file lock, then a concurrent new reference must fail after the reservation commits.
 sql(`SELECT test.fixture_responsible('ANEXO-11','00000000-0000-4000-b000-000000000091');`);
 input.idempotency_key='race-cleanup11';input.name='Corrida limpeza11.pdf';
 const cleanupIntent=JSON.parse(sql(`${owner}SELECT public.files_begin_upload('${office}',${quote(JSON.stringify(input))},gen_random_uuid());`).trim());
 sql(`UPDATE public.files SET status='rejeitado' WHERE id=${quote(cleanupIntent.file.id)};`);
 const lock3=openSql();let planning;let referencing;
 try{
  lock3.child.stdin.write(`BEGIN;SELECT id FROM public.files WHERE id=${quote(cleanupIntent.file.id)} FOR UPDATE;\\echo ATTACHMENT_CLEANUP_HELD\n`);
  await until(()=>lock3.output().includes('ATTACHMENT_CLEANUP_HELD'));
  planning=openSql();planning.child.stdin.end(`SET application_name='jn_attachment_cleanup_wait';${owner}SELECT public.files_cleanup_plan('${office}',gen_random_uuid());`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_cleanup_wait' AND wait_event_type='Lock');").trim()==='t');
  referencing=openSql();referencing.child.stdin.end(`SET application_name='jn_attachment_reference_wait';INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES('${office}',${quote(cleanupIntent.file.id)},'race');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_reference_wait' AND wait_event_type='Lock');").trim()==='t');
  lock3.child.stdin.end('COMMIT;\n');await lock3.result;await planning.result;
  try{await referencing.result;throw Error('Reference crossed cleanup reservation.');}catch(error){if(!String(error).includes('FILE_CONFLICT'))throw error;}
  if(sql(`SELECT EXISTS(SELECT FROM private.file_cleanup_reservations WHERE file_id=${quote(cleanupIntent.file.id)});`).trim()!=='t')throw Error('Cleanup reservation missing after race.');
  result+='PASS: anexos: reserva de limpeza vence referencia concorrente sem janela de exclusao\n';
 }finally{lock3.child.kill();planning?.child.kill();referencing?.child.kill();}
 return result;
};

export const benchmarkAttachments=async({sql,openSql})=>{
 if(process.env.JN_ATTACHMENTS_BENCHMARK!=='1')return;
 const input=fixture(sql);
 sql(`INSERT INTO public.files(office_id,request_id,request_item_id,name,mime_type,size_bytes,sha256,classification,status,created_by) SELECT '${office}',${quote(input.request_id)},${quote(input.request_item_id)},'Documento ficticio '||n||'.pdf','application/pdf',100,repeat('a',64),'documento','quarentena','${user}' FROM generate_series(1,10000)n;ANALYZE public.files;ANALYZE private.upload_intents;`);
 const callers=Array.from({length:10},()=>openSql());
 try{
  for(const c of callers)c.child.stdin.end(`${owner}CREATE TEMP TABLE attachment_measurements(operation text,ms numeric);DO $bench$DECLARE t timestamptz;n int;BEGIN FOR n IN 1..10 LOOP t:=clock_timestamp();PERFORM public.files_page('${office}',${quote(input.request_id)},1,5);INSERT INTO attachment_measurements VALUES('list',extract(epoch FROM clock_timestamp()-t)*1000);t:=clock_timestamp();PERFORM public.files_requests_page('${office}','',1,5);INSERT INTO attachment_measurements VALUES('requests',extract(epoch FROM clock_timestamp()-t)*1000);END LOOP;END $bench$;SELECT jsonb_agg(to_jsonb(m))FROM attachment_measurements m;`);
  const samples=(await Promise.all(callers.map(c=>c.result))).flatMap(v=>JSON.parse(v.trim()));
  const measurements=Object.fromEntries(['list','requests'].map(operation=>{const values=samples.filter(v=>v.operation===operation).map(v=>Number(v.ms)).sort((a,b)=>a-b);return[operation,{samples:values.length,median_ms:values[Math.floor(values.length/2)],p95_ms:values[Math.ceil(values.length*.95)-1],max_ms:values.at(-1)}];}));
  console.log(`ATTACHMENTS_BENCHMARK ${JSON.stringify({environment:'disposable local PostgreSQL17; authenticated role; no hosted SLA',additional_files:10000,connections:10,samples:samples.length,measurements})}`);
  if(Object.values(measurements).some(v=>v.p95_ms>2000))throw Error('Attachment benchmark exceeded local p95 target2s.');
 }finally{for(const c of callers)c.child.kill();}
};
