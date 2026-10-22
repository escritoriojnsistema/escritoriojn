// Only the disposable PostgreSQL17 harness imports this file. No remote connection path.
import {randomUUID} from 'node:crypto';
const office='00000000-0000-4000-e000-000000000141';
const actor=n=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
const configure=payload=>`SELECT public.cash_configure('${office}','${JSON.stringify(payload).replaceAll("'","''")}','${randomUUID()}')->'resource'->>'id';`;
const fixture=sql=>{const unit=sql(actor(141)+configure({kind:'unit',id:null,expected_version:null,name:'Corrida14 '+randomUUID(),active:true})).trim();const account=sql(actor(141)+configure({kind:'account',id:null,expected_version:null,name:'Conta corrida14',active:true,unit_id:unit,type:'cash'})).trim();return {unit,account};};
export async function raceCash({sql,openSql,until}){
 let output='';
 for(const sameKey of [true,false]){
  const {unit,account}=fixture(sql),key=randomUUID(),command=k=>`SELECT public.cash_open('${office}','${unit}','${account}',10000,'${k}')`;
  const a=openSql();let b;
  try{a.child.stdin.write(`BEGIN;${actor(141)}${command(key)};\n\\echo CASH_OPEN_HELD\n`);await until(()=>a.output().includes('CASH_OPEN_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_cash_race';${actor(141)}${sameKey?command(key):`SELECT test.expect_error($q$${command(randomUUID())}$q$,'PT409','caixa14: duas chaves concorrentes geram um vencedor')`};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_cash_race' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.end('COMMIT;\n');await a.result;const response=await b.result;
   if(sameKey&&!JSON.parse(response.trim()).sessions.some(s=>s.unit_id===unit&&s.numerario_cents===10000))throw Error('Cash same-key replay returned unexpected result.');if(!sameKey)output+=response;
   output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.cash_sessions WHERE office_id='${office}' AND unit_id='${unit}')=1 AND (SELECT count(*) FROM private.cash_movements WHERE office_id='${office}' AND unit_id='${unit}')=1,'caixa14: corrida ${sameKey?'mesma chave':'chaves distintas'} conserva uma sessao e movimento');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 for(const authority of ['session','cash.open','cash.read']){
  const {unit,account}=fixture(sql),lock=openSql();let pending;
  try{lock.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo CASH_AUTHORITY_HELD\n`);await until(()=>lock.output().includes('CASH_AUTHORITY_HELD'));
   pending=openSql();pending.child.stdin.end(`SET application_name='jn_cash_authority';${actor(144)}SELECT test.expect_error($q$SELECT public.cash_open('${office}','${unit}','${account}',10000,'${randomUUID()}')$q$,'${authority==='session'?'PT401':'PT403'}','caixa14: ${authority} revogada enquanto espera impede abertura');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_cash_authority' AND wait_event_type='Lock');").trim()==='t');
   sql(authority==='session'?"DELETE FROM auth.sessions WHERE id='00000000-0000-4000-c000-000000000144';":`DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000144' AND permission_code='${authority}';`);
   lock.child.stdin.end('COMMIT;\n');await lock.result;output+=await pending.result;
   output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_sessions WHERE office_id='${office}' AND unit_id='${unit}'),'caixa14: ${authority} revogada deixa zero efeito');`);
  }finally{lock.child.kill();pending?.child.kill();sql(authority==='session'?"INSERT INTO auth.sessions(id,user_id)VALUES('00000000-0000-4000-c000-000000000144','00000000-0000-4000-a000-000000000144')ON CONFLICT DO NOTHING;":`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000144','${authority}')ON CONFLICT DO NOTHING;`);}
 }
 return output;
}
export async function benchmarkCash({sql,openSql}){
 if(process.env.JN_CASH_BENCHMARK!=='1')return;
 const configurationKey=randomUUID(),openingKey=randomUUID();
 // The SQL fixture deliberately uses closed-table owner privileges ONLY in this disposable container.
 sql(`SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-000000000141","session_id":"00000000-0000-4000-c000-000000000141"}';
 INSERT INTO private.cash_commands(office_id,kind,idempotency_key,actor_id,payload_digest)VALUES('${office}','configure','${configurationKey}','00000000-0000-4000-a000-000000000141','benchmark'),('${office}','open','${openingKey}','00000000-0000-4000-a000-000000000141','benchmark');
 BEGIN;SELECT set_config('jn.cash_command','${configurationKey}',true);
 INSERT INTO private.cash_units(office_id,name,active,version)SELECT '${office}','BENCH14-'||n,true,1 FROM generate_series(1,10000)n;
 INSERT INTO private.financial_accounts(office_id,unit_id,name,type,active,version)SELECT office_id,id,'Conta benchmark14','cash',true,1 FROM private.cash_units WHERE office_id='${office}' AND name LIKE 'BENCH14-%';
 SELECT set_config('jn.cash_command','${openingKey}',true);
 INSERT INTO private.cash_sessions(office_id,unit_id,cash_account_id,operator_id,operator_name,unit_name,account_name,opening_cents,command_key)SELECT a.office_id,a.unit_id,a.id,'00000000-0000-4000-a000-000000000141','Operador benchmark',u.name,a.name,10000,'${openingKey}' FROM private.financial_accounts a JOIN private.cash_units u ON u.id=a.unit_id WHERE a.office_id='${office}' AND u.name LIKE 'BENCH14-%';
 INSERT INTO private.cash_movements(office_id,unit_id,session_id,cash_account_id,kind,amount_cents,actor_id,created_at)SELECT office_id,unit_id,id,cash_account_id,'opening',opening_cents,operator_id,opened_at FROM private.cash_sessions WHERE office_id='${office}' AND command_key='${openingKey}';COMMIT;
 ANALYZE private.cash_units;ANALYZE private.financial_accounts;ANALYZE private.cash_sessions;ANALYZE private.cash_movements;`);
 const callers=Array.from({length:10},()=>openSql());try{
  for(const c of callers)c.child.stdin.end(`${actor(141)}CREATE TEMP TABLE cash_measurements(operation text,ms numeric);DO $bench$DECLARE t timestamptz;n int;BEGIN FOR n IN 1..10 LOOP t:=clock_timestamp();PERFORM public.cash_dashboard('${office}','own',1,5);INSERT INTO cash_measurements VALUES('dashboard_own',extract(epoch FROM clock_timestamp()-t)*1000);t:=clock_timestamp();PERFORM public.cash_configuration('${office}',NULL,1,50);INSERT INTO cash_measurements VALUES('configuration',extract(epoch FROM clock_timestamp()-t)*1000);END LOOP;END $bench$;SELECT jsonb_agg(to_jsonb(m)) FROM cash_measurements m;`);
  const samples=(await Promise.all(callers.map(c=>c.result))).flatMap(x=>JSON.parse(x.trim()));const measurements=Object.fromEntries(['dashboard_own','configuration'].map(op=>{const v=samples.filter(x=>x.operation===op).map(x=>Number(x.ms)).sort((a,b)=>a-b);return[op,{samples:v.length,median_ms:v[Math.floor(v.length/2)],p95_ms:v[Math.ceil(v.length*.95)-1],max_ms:v.at(-1)}];}));
  console.log(`CASH_BENCHMARK ${JSON.stringify({environment:'disposable local PostgreSQL17; no hosted network SLA',additional_sessions:10000,additional_units:10000,connections:10,samples:samples.length,measurements})}`);if(Object.values(measurements).some(m=>m.p95_ms>2000))throw Error('Cash benchmark exceeded local p95 target2s.');
 }finally{for(const c of callers)c.child.kill();}
}
