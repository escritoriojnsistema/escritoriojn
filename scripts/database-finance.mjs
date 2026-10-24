// Imported only by the disposable PostgreSQL harness; there is no remote URL option.
import {randomUUID} from 'node:crypto';
const office='00000000-0000-4000-e000-000000000151';
const identity=n=>`SET ROLE authenticated;SET request.jwt.claims='{"sub":"00000000-0000-4000-a000-${String(n).padStart(12,'0')}","session_id":"00000000-0000-4000-c000-${String(n).padStart(12,'0')}"}';`;
const lit=v=>`'${String(typeof v==='object'?JSON.stringify(v):v).replaceAll("'","''")}'`;
export async function raceFinance({sql,openSql,until}){
 let output='';
 const configure=v=>JSON.parse(sql(identity(151)+`SELECT public.cash_configure('${office}',${lit(v)},'${randomUUID()}');`).trim()).resource;
 const fixture=(actor=151)=>{
  const unit=configure({kind:'unit',id:null,expected_version:null,name:'Corrida financeira '+randomUUID(),active:true});
  const account=configure({kind:'account',id:null,expected_version:null,name:'Especie concorrente',active:true,unit_id:unit.id,type:'cash'});
  const method=configure({kind:'payment_method',id:null,expected_version:null,name:'Dinheiro concorrente',active:true,unit_id:unit.id,type:'cash',destination_account_id:account.id});
  const service=sql(`SELECT id FROM public.services WHERE office_id='${office}' AND code='FINANCE15';`).trim();
  const request=JSON.parse(sql(identity(151)+`SELECT public.request_create('${office}',${lit({origin:'presencial',title:'Recebimento concorrente',customer_id:null,assignee_id:`00000000-0000-4000-b000-${String(actor).padStart(12,'0')}`,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]} ]})},'${randomUUID()}','${randomUUID()}');`).trim());
  const charge=JSON.parse(sql(identity(actor)+`SELECT public.charges_create('${office}','${request.id}','[{"due_date":"2027-01-01","amount_cents":10000}]','${randomUUID()}');`).trim()).charge;
  const opened=JSON.parse(sql(identity(actor)+`SELECT public.cash_open('${office}','${unit.id}','${account.id}',0,'${randomUUID()}');`).trim());
  const session=opened.sessions.find(s=>s.unit_id===unit.id);
  const receive={kind:'receive',session_id:session.id,expected_version:1,idempotency_key:randomUUID(),charge_id:charge.id,expected_charge_version:1,payment_method_id:method.id,amount_cents:3000};
  return {session,receive,actor};
 };
 const op=payload=>`SELECT test.cash_operate('${office}',${lit(payload)})`;
 for(const kind of ['receive-same','receive-distinct','refund','close-versus-receive']){
  const f=fixture();let first=f.receive,second={...f.receive,idempotency_key:kind==='receive-same'?f.receive.idempotency_key:randomUUID()};
  if(kind==='refund'){
   const received=JSON.parse(sql(identity(151)+op(f.receive)+';').trim());const original=received.entries[0];first={kind:'refund',session_id:f.session.id,expected_version:2,idempotency_key:randomUUID(),entry_id:original.id,amount_cents:3000,reason:'Reembolso concorrente conferido'};second={...first,idempotency_key:randomUUID()};
  }
  if(kind==='close-versus-receive')first={kind:'close',session_id:f.session.id,expected_version:1,idempotency_key:randomUUID(),counted_cents:0,reason:'Fecho concorrente conferido'};
  const a=openSql();let b;
  try{
   a.child.stdin.write(`BEGIN;${identity(151)}${op(first)};\n\\echo FINANCE_LOCK_HELD\n`);await until(()=>a.output().includes('FINANCE_LOCK_HELD'));
   b=openSql();b.child.stdin.end(`SET application_name='jn_finance_race';${identity(151)}${kind==='receive-same'?op(second):`SELECT test.expect_error(${lit(op(second))},'PT409','financeiro: concorrencia ${kind} impede segundo efeito')`};`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance_race' AND wait_event_type='Lock');").trim()==='t');a.child.stdin.end('COMMIT;\n');await a.result;const result=await b.result;if(kind!=='receive-same')output+=result;
   output+=sql(`SELECT test.assert_true((SELECT count(*) FROM private.cash_entries WHERE office_id='${office}' AND session_id='${f.session.id}')=${kind==='refund'?2:1},'financeiro: corrida ${kind} conserva ledger sem duplicar');`);
  }finally{a.child.kill();b?.child.kill();}
 }
 for(const capability of ['cash.open','cash.read','charges.read']){
  const f=fixture(152),lock=openSql();let pending;
  try{
   lock.child.stdin.write(`BEGIN;SELECT id FROM public.offices WHERE id='${office}' FOR UPDATE;\n\\echo FINANCE_REVOKE_HELD\n`);await until(()=>lock.output().includes('FINANCE_REVOKE_HELD'));
   pending=openSql();pending.child.stdin.end(`SET application_name='jn_finance_revoke';${identity(152)}SELECT test.expect_error(${lit(op(f.receive))},'PT403','financeiro: ${capability} revogada durante espera impede recebimento');`);
   await until(()=>sql("SELECT EXISTS(SELECT FROM pg_stat_activity WHERE application_name='jn_finance_revoke' AND wait_event_type='Lock');").trim()==='t');
   sql(`DELETE FROM private.team_member_permissions WHERE membership_id='00000000-0000-4000-b000-000000000152' AND permission_code='${capability}';`);lock.child.stdin.end('COMMIT;\n');await lock.result;output+=await pending.result;
   output+=sql(`SELECT test.assert_true(NOT EXISTS(SELECT FROM private.cash_entries WHERE office_id='${office}' AND session_id='${f.session.id}'),'financeiro: revogacao ${capability} deixa zero efeito financeiro');`);
  }finally{lock.child.kill();pending?.child.kill();sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('00000000-0000-4000-b000-000000000152','${capability}')ON CONFLICT DO NOTHING;`);}
 }
 return output;
}
