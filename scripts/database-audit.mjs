export async function raceAudit({sql,openSql,until}){
 const office='00000000-0000-4000-e000-000000000301',actor='00000000-0000-4000-a000-000000000301',session='00000000-0000-4000-c000-000000000301';
 let output='';
 for(const kind of ['session','archive']){
  if(kind==='archive')sql("INSERT INTO private.team_member_permissions VALUES('00000000-0000-4000-b000-000000000302','audit.archives');");
  const first=openSql();let second;
  try{
   first.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\\echo AUDIT_LOCK_HELD\n`);
   await until(()=>first.output().includes('AUDIT_LOCK_HELD'));second=openSql();
   const caller=kind==='session'?actor:'00000000-0000-4000-a000-000000000302',sid=kind==='session'?session:'00000000-0000-4000-c000-000000000302';
   const query=kind==='session'?`SELECT public.audit_policy_set('${office}',60,4,gen_random_uuid())`:`SELECT public.audit_report_begin('${office}','requests.created',NULL,NULL,NULL,'archived',gen_random_uuid())`;
   second.child.stdin.end(`SET application_name='jn_audit_race';SET ROLE authenticated;SET request.jwt.claims='{"sub":"${caller}","session_id":"${sid}"}';SELECT test.expect_error($q$${query}$q$,'${kind==='session'?'PT401':'PT403'}','auditoria: revogacao ${kind} durante lock bloqueia');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_audit_race' AND wait_event_type='Lock');").trim()==='t');
   if(kind==='session')sql(`DELETE FROM auth.sessions WHERE id='${session}';`);else sql("DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000302' AND permission_code='audit.archives';");
   first.child.stdin.end('COMMIT;\n');await first.result;output+=await second.result;
   if(kind==='session')sql(`INSERT INTO auth.sessions(id,user_id)VALUES('${session}','${actor}');`);
  }finally{first.child.kill();second?.child.kill();}
 }
 return output;
}
