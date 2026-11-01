import { randomUUID } from 'node:crypto';

// All changes are confined to the caller's disposable PostgreSQL database.
export async function raceDocumentCommercial({ sql, openSql, until }) {
  const office='00000000-0000-4000-e000-000000000201';
  const owner='00000000-0000-4000-b000-000000000201';
  const claims='{"sub":"00000000-0000-4000-a000-000000000205","session_id":"00000000-0000-4000-c000-000000000205"}';
  sql(`UPDATE private.document_presence SET status='away' WHERE office_id='${office}' AND membership_id='${owner}';
    UPDATE public.requests r SET status='aguardando_cliente' WHERE r.office_id='${office}' AND r.assignee_id IS NULL AND r.status='aguardando_responsavel' AND EXISTS(SELECT FROM private.document_intakes i WHERE i.office_id=r.office_id AND i.request_id=r.id AND i.execution_level=1);
    UPDATE private.document_presence SET capacity=private.document_active_load('${office}','${owner}')+1,status='available',last_seen=clock_timestamp() WHERE office_id='${office}' AND membership_id='${owner}';`);
  const payload=JSON.parse(sql(`SELECT jsonb_build_object('template_id',o.template_id,'template_version_id',p.j->>'template_version_id','service_version_id',p.j->>'service_version_id','offer_revision',o.revision,'origin','portal','answers','{}'::jsonb,'customer_id',NULL,'assignee_id',NULL) FROM private.document_offerings o CROSS JOIN LATERAL (SELECT private.document_offer_projection(o,clock_timestamp()) j)p WHERE o.office_id='${office}' AND o.execution_level=1 AND o.required_intake_keys='[]'::jsonb AND p.j IS NOT NULL LIMIT 1;`).trim());
  const input=JSON.stringify(payload).replaceAll("'","''");
  const lock=openSql();const callers=[];
  try {
    lock.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\\echo COMMERCIAL_HELD\n`);
    await until(()=>lock.output().includes('COMMERCIAL_HELD'));
    for(let n=0;n<2;n++){
      const c=openSql();callers.push(c);
      c.child.stdin.end(`SET application_name='jn_commercial_race_${n}';SET ROLE authenticated;SET request.jwt.claims='${claims}';SELECT public.document_booking_create('${office}','${input}'::jsonb,'${randomUUID()}')->>'request_id';`);
    }
    await until(()=>sql("SELECT count(*)=2 FROM pg_stat_activity WHERE application_name LIKE 'jn_commercial_race_%' AND wait_event_type='Lock';").trim()==='t');
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    const ids=(await Promise.all(callers.map(c=>c.result))).map(v=>v.trim());
    if(ids[0]===ids[1])throw Error('commercial race returned the same request');
    return sql(`SELECT test.assert_true((SELECT count(*)=2 AND count(*) FILTER(WHERE assignee_id='${owner}' AND status='aberto')=1 AND count(*) FILTER(WHERE assignee_id IS NULL AND status='aguardando_responsavel')=1 FROM public.requests WHERE id IN('${ids[0]}','${ids[1]}')),'commercial: simultaneous bookings reserve one available slot');`);
  } finally {lock.child.kill();for(const c of callers)c.child.kill();}
}

export async function raceFolderSession({ sql, openSql, until }) {
  const office='00000000-0000-4000-e000-000000000201';
  const session='00000000-0000-4000-c000-000000000201';
  const claims='{"sub":"00000000-0000-4000-a000-000000000201","session_id":"00000000-0000-4000-c000-000000000201"}';
  const folderName=`Revocacao ${randomUUID()}`;
  const state=JSON.parse(sql(`SET ROLE authenticated;SET request.jwt.claims='${claims}';SELECT public.model_folders_command('${office}',jsonb_build_object('kind','create','name','${folderName}'),gen_random_uuid());`).trim());
  const folder=state.folders.find(f=>f.name===folderName);
  if(!folder)throw Error('folder fixture missing');
  const command=JSON.stringify({kind:'rename',folder_id:folder.id,expected_revision:folder.revision,name:'Não deve alterar'}).replaceAll("'","''");
  const lock=openSql();const worker=openSql();
  try {
    lock.child.stdin.write(`BEGIN;SELECT id FROM private.model_folders WHERE id='${folder.id}' FOR UPDATE;\\echo FOLDER_HELD\n`);
    await until(()=>lock.output().includes('FOLDER_HELD'));
    worker.child.stdin.end(`SET application_name='jn_folder_session_race';SET ROLE authenticated;SET request.jwt.claims='${claims}';SELECT test.expect_error($q$SELECT public.model_folders_command('${office}','${command}'::jsonb,gen_random_uuid())$q$,'PT401','commercial: revoked session after folder lock cannot rename');`);
    await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_folder_session_race' AND wait_event_type='Lock');").trim()==='t');
    sql(`UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id='${session}';`);
    lock.child.stdin.end('COMMIT;\n');await lock.result;
    const result=await worker.result;
    if(!result.includes('PASS: commercial: revoked session after folder lock cannot rename'))throw Error(result);
    const name=sql(`SELECT name FROM private.model_folders WHERE id='${folder.id}';`).trim();
    if(name!==folderName)throw Error('folder changed after session revocation');
    return result;
  } finally {
    lock.child.kill();worker.child.kill();
    sql(`UPDATE auth.sessions SET not_after=NULL WHERE id='${session}';`);
  }
}
