import {spawn,execFileSync} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const container=process.argv[2],database=process.argv[3];
if(!/^jn-foundation-test-[a-f0-9-]{36}$/.test(container??'')||!/^corrections_[a-z_]+$/.test(database??''))throw Error('Disposable corrections database required');
const args=['--host=unix:///var/run/docker.sock','exec','-i',container,'psql','-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-U','postgres','-d',database];
const sql=s=>execFileSync('docker',args,{input:s,encoding:'utf8',stdio:['pipe','pipe','pipe']});
function open(){const p=spawn('docker',args,{stdio:['pipe','pipe','pipe']});let out='',err='';p.stdout.on('data',b=>out+=b);p.stderr.on('data',b=>err+=b);const done=new Promise((resolve,reject)=>{p.on('error',reject);p.on('close',c=>c===0?resolve(out):reject(Error(err)));});done.catch(()=>{});return{p,done,output:()=>out};}
async function until(fn){const end=Date.now()+10000;while(Date.now()<end){if(fn())return;await delay(30);}throw Error('Race barrier timeout');}
const first=open();let second;
try{
 first.p.stdin.write("BEGIN;UPDATE public.memberships SET role_code='employee' WHERE id='00000000-0000-4000-b000-000000000205';\n\\echo CLOSURE_HELD\n");await until(()=>first.output().includes('CLOSURE_HELD'));
 second=open();second.p.stdin.end("SET application_name='jn_closure_role_race';SET ROLE authenticated;SET request.jwt.claims='{\"sub\":\"00000000-0000-4000-a000-000000000205\",\"session_id\":\"00000000-0000-4000-c000-000000000205\"}';SELECT test.expect_error($q$SELECT public.account_close('00000000-0000-4000-e000-000000000201','{\"reason\":\"privacy\",\"observation\":\"\",\"acknowledged\":true,\"export_offered\":true}')$q$,'PT403','closure: role change while waiting never closes staff account');");
 await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_closure_role_race' AND wait_event_type='Lock');").trim()==='t');first.p.stdin.end('COMMIT;');await first.done;console.log(await second.done);
}finally{first.p.kill();second?.p.kill();sql("UPDATE public.memberships SET role_code='client' WHERE id='00000000-0000-4000-b000-000000000205';");}
