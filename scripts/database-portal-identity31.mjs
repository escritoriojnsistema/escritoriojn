import {readFileSync} from 'node:fs';
export async function racePortalIdentity31({sql,openSql,until}){
 const prefix=readFileSync(new URL('../tests/database/portal-identity31.sql',import.meta.url),'utf8').split('\\set o31')[0].replace('BEGIN;','');sql(prefix);
 const o='00000000-0000-4000-e000-000000000311',c='00000000-0000-4000-f000-000000000311',m='00000000-0000-4000-b000-000000000312',owner='{"sub":"00000000-0000-4000-a000-000000000311","session_id":"00000000-0000-4000-c000-000000000311"}',client='{"sub":"00000000-0000-4000-a000-000000000312","session_id":"00000000-0000-4000-c000-000000000312"}';
 sql(`SET ROLE authenticated;SET request.jwt.claims='${owner}';SELECT public.portal_command31('${o}','${c}',jsonb_build_object('kind','issue','membership_id','${m}','token',repeat('d',64),'evidence','Concorrência fictícia31','expected_version',1),gen_random_uuid());RESET ROLE;`);
 const a=openSql(),b=openSql();try{
 a.child.stdin.write(`BEGIN;SET ROLE authenticated;SET request.jwt.claims='${client}';SELECT public.portal_command31('${o}',NULL,jsonb_build_object('kind','accept','token',repeat('d',64)),gen_random_uuid());\\echo PORTAL31_HELD\n`);
 await until(()=>a.output().includes('PORTAL31_HELD'));
 b.child.stdin.end(`SET application_name='portal31_race';SET ROLE authenticated;SET request.jwt.claims='${client}';SELECT test.expect_error($q$SELECT public.portal_command31('${o}',NULL,jsonb_build_object('kind','accept','token',repeat('d',64)),gen_random_uuid())$q$,'PT422','31: second concurrent consumption is denied');`);
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='portal31_race' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.end('COMMIT;');await a.result;const out=await b.result;
 return out+sql(`SELECT test.assert_true((SELECT count(*) FROM private.customer_relations WHERE office_id='${o}' AND relation_type='identity' AND revoked_at IS NULL)=1 AND (SELECT count(*) FROM private.portal_invites31 WHERE office_id='${o}' AND consumed_at IS NOT NULL)=1,'31: concurrency preserves one canonical identity and consumption');`);
 }finally{a.child.kill();b.child.kill();}
}
