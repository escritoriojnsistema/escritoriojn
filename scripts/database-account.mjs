// This helper is reachable only from the disposable PostgreSQL test runner.
const office='00000000-0000-4000-e000-000000000091',member='00000000-0000-4000-b000-000000000092',client='00000000-0000-4000-a000-000000000095';
const actor=n=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
export async function raceAccount({sql,openSql,until}){
 const before=sql(`SELECT private.account_values('${client}')->>'name';`).trim();
 const id=sql(`${actor(95)}SELECT public.account_correction_create('${office}',public.account_read('${office}')->>'version',jsonb_build_object('name','Correcao Concorrente Ficticia','cpf','12345678909','email','corrigido@example.test'),gen_random_uuid(),gen_random_uuid())->>'id';`).trim();
 if(!/^[a-f0-9-]{36}$/.test(id))throw Error('Account race fixture is missing.');
 const input=JSON.stringify(JSON.parse(sql(`SELECT proposed_values FROM private.account_corrections WHERE request_id='${id}';`).trim())).replaceAll("'","''");
 const apply=`SELECT public.account_correction_apply('${office}','${id}',1,'${input}',gen_random_uuid())`;
 let output='';const lock=openSql();let mutation;
 try{
  lock.child.stdin.write(`BEGIN;SELECT id FROM public.customers WHERE id='00000000-0000-4000-d555-000000000111' FOR UPDATE;\n\\echo ACCOUNT_HELD\n`);await until(()=>lock.output().includes('ACCOUNT_HELD'));
  mutation=openSql();mutation.child.stdin.end(`SET application_name='jn_account_revoke';${actor(92)}SELECT test.expect_error($q$${apply}$q$,'PT403','conta: revogacao durante lock da ficha impede aplicacao');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_account_revoke' AND wait_event_type='Lock');").trim()==='t');
  sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${member}' AND permission_code='accounts.corrections.apply';`);
  lock.child.stdin.end('COMMIT;\n');await lock.result;output+=await mutation.result;
  if(sql(`SELECT private.account_values('${client}')->>'name';`).trim()!==before||sql(`SELECT version FROM public.requests WHERE id='${id}';`).trim()!=='1')throw Error('Revoked account mutation changed data.');
 }finally{lock.child.kill();mutation?.child.kill();sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${member}','accounts.corrections.apply') ON CONFLICT DO NOTHING;`);}
 const first=openSql();let second;
 try{
  first.child.stdin.write(`BEGIN;${actor(92)}${apply};\n\\echo ACCOUNT_APPLIED\n`);await until(()=>first.output().includes('ACCOUNT_APPLIED'));
  second=openSql();second.child.stdin.end(`SET application_name='jn_account_second';${actor(92)}SELECT test.expect_error($q$${apply}$q$,'PT409','conta: aplicacoes concorrentes conservam um vencedor e um conflito');`);
  await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_account_second' AND wait_event_type='Lock');").trim()==='t');
  first.child.stdin.end('COMMIT;\n');await first.result;output+=await second.result;
  if(sql(`SELECT count(*) FROM public.audit_events WHERE action='accounts.correction_applied' AND target_id='${id}';`).trim()!=='1')throw Error('Account application was duplicated.');
 }finally{first.child.kill();second?.child.kill();}
 return output;
}
