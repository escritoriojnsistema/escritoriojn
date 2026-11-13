import {randomUUID} from 'node:crypto';

// Every fixture and mutation is inside the runner's own disposable PostgreSQL.
export const raceAttachmentDeletion = async ({sql,openSql,until}) => {
 const office='00000000-0000-4000-e000-000000000091';
 const actor='00000000-0000-4000-a000-000000000983';
 const session='00000000-0000-4000-c000-000000000983';
 const secondSession='00000000-0000-4000-c001-000000000983';
 const auth=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"${actor}","session_id":"${session}"}';`;
 sql(`INSERT INTO auth.users(id,email,email_confirmed_at,encrypted_password)VALUES('${actor}','attachment-race@example.test',now(),'fixture')ON CONFLICT DO NOTHING;INSERT INTO auth.sessions(id,user_id)VALUES('${session}','${actor}'),('${secondSession}','${actor}')ON CONFLICT DO NOTHING;INSERT INTO public.profiles(id,display_name)VALUES('${actor}','Fictício corrida anexos')ON CONFLICT DO NOTHING;INSERT INTO public.memberships(id,office_id,user_id,role_code)VALUES('00000000-0000-4000-b000-000000000983','${office}','${actor}','client')ON CONFLICT DO NOTHING;`);
 const request=sql(`INSERT INTO public.requests(office_id,protocol,title,origin,created_by,priority,idempotency_key,payload_digest)VALUES('${office}','DELETE-RACE-${randomUUID()}','Corrida local de exclusão','portal','${actor}','normal',gen_random_uuid(),'fixture')RETURNING id;`).trim();
 const create=()=>JSON.parse(sql(`${auth}SELECT public.files_begin_upload('${office}','${JSON.stringify({request_id:request,request_item_id:null,name:'Corrida.pdf',mime_type:'application/pdf',size_bytes:100,sha256:'a'.repeat(64),classification:'documento',idempotency_key:randomUUID()})}',gen_random_uuid());`).trim());
 let result='';
 // A committed reservation must defeat a reference/protection waiting in another connection.
 for(const kind of ['reference','protection']){
  const upload=create();const id=upload.file.id;
  const first=openSql();let second;
  try{
   first.child.stdin.write(`BEGIN;${auth}SELECT public.files_delete_begin('${office}','${id}','${upload.file.updated_at}','${randomUUID()}',gen_random_uuid());\\echo DELETION_RESERVED\n`);
   await until(()=>first.output().includes('DELETION_RESERVED'));
   second=openSql();
   const statement=kind==='reference'?`INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES('${office}','${id}','concurrent_local')`:`UPDATE public.files SET legal_hold=true WHERE id='${id}'`;
   second.child.stdin.end(`SET application_name='jn_attachment_delete_${kind}';SELECT test.expect_error($q$${statement}$q$,'PT409','attachments: reserved delete defeats concurrent ${kind}');`);
   await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_delete_${kind}' AND wait_event_type='Lock');`).trim()==='t');
   first.child.stdin.end('COMMIT;\n');await first.result;result+=await second.result;
  }finally{first.child.kill();second?.child.kill();}
 }
 // A reference committed first must defeat a reservation waiting on its authority lock.
 const upload=create();const id=upload.file.id;
 const first=openSql();let second;
 try{
  first.child.stdin.write(`BEGIN;INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES('${office}','${id}','first_local');\\echo REFERENCE_BOUND\n`);
  await until(()=>first.output().includes('REFERENCE_BOUND'));
  second=openSql();second.child.stdin.end(`SET application_name='jn_attachment_delete_after_reference';${auth}SELECT test.expect_error($q$SELECT public.files_delete_begin('${office}','${id}','${upload.file.updated_at}','${randomUUID()}',gen_random_uuid())$q$,'PT409','attachments: concurrent existing reference defeats delete reservation');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_delete_after_reference' AND wait_event_type='Lock');").trim()==='t');
  first.child.stdin.end('COMMIT;\n');await first.result;result+=await second.result;
  if(sql(`SELECT EXISTS(SELECT FROM private.file_deletions WHERE file_id='${id}');`).trim()!=='f')throw Error('Reference race created an invalid deletion reservation.');
 }finally{first.child.kill();second?.child.kill();}
 // A Storage request can read its reservation before waiting on the office
 // lock. Reclaim under that lock must invalidate its earlier UID/SID snapshot.
 const staleUpload=create();const staleFile=staleUpload.file.id;
 const oldKey=randomUUID();const newKey=randomUUID();
 const oldJob=JSON.parse(sql(`${auth}SELECT public.files_delete_begin('${office}','${staleFile}','${staleUpload.file.updated_at}','${oldKey}',gen_random_uuid());`).trim());
 sql(`INSERT INTO storage.objects(bucket_id,name,metadata)VALUES('request-attachments','${oldJob.object_path}','{"size":100,"mimetype":"application/pdf"}');`);
 const authSecond=`SET ROLE authenticated;SET request.jwt.claims='{"sub":"${actor}","session_id":"${secondSession}"}';`;
 const barrier=openSql();let staleStorage;
 try{
  barrier.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR NO KEY UPDATE;\\echo RECLAIM_OFFICE_HELD\n`);
  await until(()=>barrier.output().includes('RECLAIM_OFFICE_HELD'));
  staleStorage=openSql();staleStorage.child.stdin.end(`SET application_name='jn_attachment_storage_before_reclaim';${auth}SET storage.operation='object.delete_many';WITH removed AS(DELETE FROM storage.objects WHERE bucket_id='request-attachments' AND name='${oldJob.object_path}' RETURNING id)SELECT test.assert_true((SELECT count(*)=0 FROM removed),'attachments: Storage request waiting before reclaim cannot use stale session snapshot');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_attachment_storage_before_reclaim' AND wait_event_type='Lock');").trim()==='t');
  barrier.child.stdin.end(`UPDATE private.file_deletions SET expires_at=clock_timestamp()-interval '1 second' WHERE id='${oldJob.id}';${authSecond}SELECT public.files_delete_begin('${office}','${staleFile}','${staleUpload.file.updated_at}','${newKey}',gen_random_uuid());COMMIT;\n`);
  await barrier.result;result+=await staleStorage.result;
  if(sql(`SELECT EXISTS(SELECT FROM storage.objects WHERE bucket_id='request-attachments' AND name='${oldJob.object_path}');`).trim()!=='t')throw Error('Stale Storage request removed reclaimed bytes.');
 }finally{barrier.child.kill();staleStorage?.child.kill();}
 return result;
};
