import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {setTimeout as delay} from 'node:timers/promises';

// Only a disposable clone is changed. Source fixtures are never modified.
// --expect-vulnerable records the original RED; --source-guard tests the current
// closed_account_guard definition without changing the baseline database.
const [container,baseline,...flags]=process.argv.slice(2);
if(!/^jn-foundation-test-[a-f0-9-]{36}$/.test(container??'')||!/^corrections_[a-z_]+$/.test(baseline??'')||flags.some(f=>!['--expect-vulnerable','--source-guard'].includes(f)))throw Error('Disposable corrections container/database required');
const database='corrections_invite_race_'+randomUUID().replaceAll('-','');
const args=db=>['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-U','postgres','-d',db];
const sql=(s,db=database)=>execFileSync('docker',args(db),{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']});
function open(){const p=spawn('docker',args(database),{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',code=>resolve({code,out,err}));});done.catch(()=>{});return{p,done,output:()=>out};}
async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await delay(30);}throw Error('Invitation race barrier timeout');}
const user='00000000-0000-4000-a000-000000000205',sourceOffice='00000000-0000-4000-e000-000000000201',targetOffice='00000000-0000-4000-e000-000000000202',sid=randomUUID(),invitation=randomUUID();
const claims=JSON.stringify({sub:user,session_id:sid,role:'authenticated'});
let first,second,created=false;
try{
 sql(`CREATE DATABASE ${database} TEMPLATE ${baseline};`,'postgres');created=true;
 assert.equal(sql(`SELECT count(*) FROM public.memberships WHERE user_id='${user}' AND role_code='client' AND active;`).trim(),'1','expected disposable client fixture');
 assert.equal(sql(`SELECT count(*) FROM private.account_closures WHERE user_id='${user}';`).trim(),'0','fixture must be open');
 if(flags.includes('--source-guard')){
  const source=readFileSync(new URL('../supabase/migrations/20261105150003_account_closure_retention.sql',import.meta.url),'utf8');
  const guard=source.match(/CREATE (?:OR REPLACE )?FUNCTION private\.closed_account_guard\(\)[\s\S]*?END\s*\$\$;/i)?.[0];
  assert.ok(guard,'source guard definition found');sql(guard.replace(/^CREATE (?:OR REPLACE )?FUNCTION/,'CREATE OR REPLACE FUNCTION'));
 }
 sql(`UPDATE auth.users SET encrypted_password='local-disposable-race',email_confirmed_at=clock_timestamp() WHERE id='${user}';
 INSERT INTO auth.sessions(id,user_id)VALUES('${sid}','${user}');
 INSERT INTO private.team_invitations(id,office_id,email,full_name,cpf_hash,cpf_masked,role_code,permissions,expires_at,inviter_user_id,inviter_membership_id,authority_role,verified_user_id,verified_session_id,verified_until,password_existing_user_id)
 SELECT '${invitation}','${targetOffice}',u.email,'Closure race client','$2fixture','***.***.***-00','employee',ARRAY['foundation.access'],clock_timestamp()+interval '1 hour',m.user_id,m.id,'owner','${user}','${sid}',clock_timestamp()+interval '1 hour','${user}' FROM public.memberships m CROSS JOIN auth.users u WHERE m.office_id='${targetOffice}' AND m.role_code='owner' AND m.active AND u.id='${user}';`);
 first=open();first.p.stdin.write(`BEGIN;SET LOCAL request.jwt.claims='${claims}';SELECT 1 FROM public.profiles WHERE id='${user}' FOR UPDATE;\n\\echo PROFILE_HELD\n`);
 await until(()=>first.output().includes('PROFILE_HELD'));
 second=open();second.p.stdin.end(`BEGIN;SET application_name='${database}';SET LOCAL ROLE authenticated;SET LOCAL request.jwt.claims='${claims}';SELECT public.team_accept_invitation('${invitation}',gen_random_uuid());COMMIT;`);
 await until(()=>sql(`SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='${database}' AND wait_event_type='Lock');`).trim()==='t');
 first.p.stdin.end(`SELECT public.account_close('${sourceOffice}','{"reason":"privacy","observation":"","acknowledged":true,"export_offered":true}');COMMIT;`);
 const close=await first.done;assert.equal(close.code,0,close.err);assert.match(close.out,/"closed": true/);
 const accept=await second.done;
 const active=Number(sql(`SELECT count(*) FROM public.memberships WHERE office_id='${targetOffice}' AND user_id='${user}' AND active;`).trim());
 if(flags.includes('--expect-vulnerable')){assert.equal(accept.code,0,accept.err);assert.equal(active,1);console.log('PASS RED: original guard permits concurrent public invitation acceptance after account closure');}
 else{assert.notEqual(accept.code,0);assert.match(accept.err,/PT403.*ACCOUNT_CLOSED/);assert.equal(active,0);console.log('PASS GREEN: concurrent public invitation acceptance denied after closure, no active staff membership');}
}finally{
 first?.p.kill();second?.p.kill();
 if(created)sql(`DROP DATABASE ${database} WITH (FORCE);`,'postgres');
}
