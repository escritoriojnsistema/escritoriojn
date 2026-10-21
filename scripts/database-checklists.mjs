// Receives callbacks from the disposable-only runner; cannot target a hosted DB.
const office='00000000-0000-4000-e000-000000000091',member='00000000-0000-4000-b000-000000000092';
const actor=n=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
export async function raceChecklists({sql,openSql,until}){
 const row=JSON.parse(sql(`SELECT jsonb_build_object('id',e.id,'version',e.version,'request',r.id) FROM private.checklist_entries e JOIN private.checklist_instances c ON c.id=e.instance_id JOIN public.requests r ON r.id=c.request_id WHERE r.protocol='CHECKLIST-12' AND e.rule->>'key'='c';`).trim());
 let output='';const lock=openSql();let writer;
 try{
  lock.child.stdin.write(`BEGIN;SELECT id FROM public.requests WHERE id='${row.request}' FOR UPDATE;\n\\echo CHECKLIST_HELD\n`);await until(()=>lock.output().includes('CHECKLIST_HELD'));
  writer=openSql();writer.child.stdin.end(`SET application_name='jn_checklist_revoke';${actor(92)}SELECT public.checklists_update('${office}','${row.id}',${row.version},'pendente',NULL,'Revisao ficticia concorrente',gen_random_uuid());`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_checklist_revoke' AND wait_event_type='Lock');").trim()==='t');
  sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${member}' AND permission_code='checklists.update';`);lock.child.stdin.end('COMMIT;\n');await lock.result;
  let denied=false;try{await writer.result;}catch(e){denied=String(e).includes('CHECKLIST_FORBIDDEN');}if(!denied)throw Error('Checklist update ignored revoked capability.');
  if(sql(`SELECT version FROM private.checklist_entries WHERE id='${row.id}';`).trim()!==String(row.version))throw Error('Denied update changed entry.');output+='PASS: checklists12: capacidade revogada durante lock bloqueia decisao\n';
 }finally{lock.child.kill();writer?.child.kill();sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${member}','checklists.update')ON CONFLICT DO NOTHING;`);}
 const first=openSql();let second;
 try{
  first.child.stdin.write(`BEGIN;${actor(91)}SELECT public.checklists_update('${office}','${row.id}',${row.version},'pendente',NULL,'Primeira decisao ficticia',gen_random_uuid());\n\\echo CHECKLIST_FIRST\n`);await until(()=>first.output().includes('CHECKLIST_FIRST'));
  second=openSql();second.child.stdin.end(`SET application_name='jn_checklist_version';${actor(92)}SELECT public.checklists_update('${office}','${row.id}',${row.version},'pendente',NULL,'Segunda decisao ficticia',gen_random_uuid());`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_checklist_version' AND wait_event_type='Lock');").trim()==='t');first.child.stdin.end('COMMIT;\n');await first.result;
  let conflict=false;try{await second.result;}catch(e){conflict=String(e).includes('CHECKLIST_CONFLICT');}if(!conflict)throw Error('Concurrent checklist version did not conflict.');
  if(sql(`SELECT version FROM private.checklist_entries WHERE id='${row.id}';`).trim()!==String(row.version+1))throw Error('Concurrent checklist applied twice.');output+='PASS: checklists12: duas decisoes concorrentes conservam um vencedor\n';
 }finally{first.child.kill();second?.child.kill();}return output;
}
export async function benchmarkChecklists({sql,openSql}){
 if(process.env.JN_CHECKLISTS_BENCHMARK!=='1')return;
 const request=sql("SELECT id FROM public.requests WHERE protocol='CHECKLIST-12';").trim();
 sql(`INSERT INTO private.internal_notifications(office_id,request_id,recipient_id,event_id,kind)SELECT '${office}','${request}','${member}',gen_random_uuid(),'pending' FROM generate_series(1,10000);ANALYZE private.internal_notifications;ANALYZE private.checklist_entries;ANALYZE private.checklist_history;`);
 const callers=Array.from({length:10},()=>openSql());
 try{
  for(const c of callers)c.child.stdin.end(`${actor(92)}CREATE TEMP TABLE checklist_measurements(operation text,ms numeric);DO $bench$DECLARE t timestamptz;n int;BEGIN FOR n IN 1..10 LOOP t:=clock_timestamp();PERFORM public.checklists_notifications('${office}',1,5,false);INSERT INTO checklist_measurements VALUES('notifications',extract(epoch FROM clock_timestamp()-t)*1000);t:=clock_timestamp();PERFORM public.checklists_view('${office}','${request}',NULL);INSERT INTO checklist_measurements VALUES('checklist',extract(epoch FROM clock_timestamp()-t)*1000);END LOOP;END $bench$;SELECT jsonb_agg(to_jsonb(m))FROM checklist_measurements m;`);
  const samples=(await Promise.all(callers.map(c=>c.result))).flatMap(v=>JSON.parse(v.trim()));
  const measurements=Object.fromEntries(['notifications','checklist'].map(operation=>{const v=samples.filter(x=>x.operation===operation).map(x=>Number(x.ms)).sort((a,b)=>a-b);return [operation,{samples:v.length,median_ms:v[Math.floor(v.length/2)],p95_ms:v[Math.ceil(v.length*.95)-1],max_ms:v.at(-1)}];}));
  console.log(`CHECKLISTS_BENCHMARK ${JSON.stringify({environment:'disposable local PostgreSQL17; no hosted SLA',additional_notifications:10000,connections:10,samples:samples.length,measurements})}`);
  if(Object.values(measurements).some(v=>v.p95_ms>2000))throw Error('Checklist local p95 target2s exceeded.');
 }finally{for(const c of callers)c.child.kill();}
}
