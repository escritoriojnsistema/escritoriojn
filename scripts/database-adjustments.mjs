// Called only by the disposable PostgreSQL runner; no remote connection option.
const office='00000000-0000-4000-e000-000000000091',member='00000000-0000-4000-b000-000000000092';
const actor=n=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
export async function raceReclaim({sql,openSql,until}){
 const [id,version,protocol]=JSON.parse(sql("SELECT jsonb_build_array(id,version,protocol) FROM public.requests WHERE title='Copias ficticias';").trim());
 sql(`UPDATE public.memberships SET role_code='admin' WHERE id='${member}';INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${member}','requests.reclaim');
 CREATE FUNCTION test.reclaim_result(p_id uuid,p_version integer) RETURNS text LANGUAGE plpgsql SECURITY INVOKER AS $test$BEGIN PERFORM public.request_mutate('${office}',p_id,p_version,'{"kind":"reclaim","reason":"Retomada concorrente ficticia"}',gen_random_uuid());RETURN 'winner';EXCEPTION WHEN SQLSTATE 'PT409' THEN RETURN 'conflict';END $test$;`);
 const callers=[openSql(),openSql()];let output='';
 try{
  callers.forEach((c,n)=>c.child.stdin.end(`${actor(n===0?91:92)}SELECT test.reclaim_result('${id}',${version});`));
  const result=(await Promise.all(callers.map(c=>c.result))).map(v=>v.trim()).sort();if(JSON.stringify(result)!==JSON.stringify(['conflict','winner']))throw Error('Concurrent reclaim did not produce one winner.');
  if(sql(`SELECT count(*) FROM private.request_assignments WHERE request_id='${id}' AND ended_at IS NULL;`).trim()!=='1')throw Error('Multiple current assignees after reclaim.');
  output+='PASS: ajustes: retomadas concorrentes conservam um responsavel e um conflito\n';
  sql(`SELECT test.fixture_responsible('${protocol}','00000000-0000-4000-b000-000000000094');`);
  const lock=openSql();let mutation;
  try{
   lock.child.stdin.write(`BEGIN;SELECT id FROM public.requests WHERE id='${id}' FOR UPDATE;\n\\echo RECLAIM_HELD\n`);await until(()=>lock.output().includes('RECLAIM_HELD'));
   mutation=openSql();mutation.child.stdin.end(`SET application_name='jn_reclaim_revoke';${actor(92)}SELECT test.expect_error($q$SELECT public.request_mutate('${office}','${id}',${version+1},'{"kind":"reclaim","reason":"Retomada apos revogacao"}',gen_random_uuid())$q$,'PT403','ajustes: revogacao durante lock impede retomada');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_reclaim_revoke' AND wait_event_type='Lock');").trim()==='t');
   sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${member}' AND permission_code='requests.reclaim';`);lock.child.stdin.end('COMMIT;\n');await lock.result;output+=await mutation.result;
   if(sql(`SELECT version FROM public.requests WHERE id='${id}';`).trim()!==String(version+1))throw Error('Revoked reclaim changed version.');
  }finally{lock.child.kill();mutation?.child.kill();}
 }finally{callers.forEach(c=>c.child.kill());sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${member}' AND permission_code='requests.reclaim';UPDATE public.memberships SET role_code='employee' WHERE id='${member}';SELECT test.fixture_responsible('${protocol}','00000000-0000-4000-b000-000000000094');`);}
 return output;
}
