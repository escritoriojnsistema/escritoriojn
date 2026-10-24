import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
import {validPaymentOperation} from '../shared/payments.js';
import {paymentsPage} from '../server/modules/cash/paymentDto.js';
import {statement} from '../server/modules/cash/financeDto.js';
import {reportInputV2} from '../server/modules/governance/reportV2.js';
import {reportInputV1} from '../server/modules/governance/reportV1.js';
import type {AuditReport,AuditEvent} from '../shared/governance.js';
const id='00000000-0000-4000-a000-000000000151',id2='00000000-0000-4000-a000-000000000152';
const op={kind:'record',session_id:id,expected_version:1,idempotency_key:id,evidence:'Conferência manual local',payment_method_id:id,status:'confirmed',allocations:[{charge_id:id,expected_charge_version:1,amount_cents:3000}],presented_cents:5000,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null};
const payment={id,reference:`JN-PAG-${id}`,created_at:'2026-10-24T03:00:00Z',amount_cents:3000,presented_cents:5000,change_cents:2000,fee_cents:0,net_cents:3000,payment_type:'cash',method_name:'Dinheiro',account_name:'Espécie',legacy:false,status:'confirmed',settlement:'not_applicable',settled_on:null,evidence:'Conferência manual local',external_reference:null,allocations:[{charge_id:id,protocol:'JN-TESTE',amount_cents:3000}]};
const session={id,unit_id:id,unit_name:'Unidade',operator_name:'Operador',is_self:true,status:'open',version:2,opened_at:'2026-10-24T03:00:00Z',closed_at:null,opening_cents:10000,cash_cents:13000,received_cents:3000,refunded_cents:0,digital_cents:0,can_operate:true,can_refund:true};
test('payments: exact contract validates pending/confirmed, split cents, cash and settlement data',()=>{
 assert.equal(validPaymentOperation(op),true);assert.equal(validPaymentOperation({...op,status:'pending'}),true);
 for(const patch of [{operator_id:id},{presented_cents:2999},{presented_cents:1.1},{fee_cents:3001},{fee_cents:'0'},{evidence:' '},{status:'paid'},{settlement:'settled'},{allocations:[]},{allocations:[op.allocations[0],op.allocations[0]]},{allocations:[{...op.allocations[0],amount_cents:1.2}]},{expected_version:0}])assert.equal(validPaymentOperation({...op,...patch}),false,JSON.stringify(patch));
 assert.equal(validPaymentOperation({...op,allocations:[op.allocations[0],{charge_id:id2,expected_charge_version:2,amount_cents:2000}],presented_cents:5000}),true);
 for(const kind of ['confirm','reject'])assert.equal(validPaymentOperation({kind,session_id:id,expected_version:1,idempotency_key:id,payment_id:id,evidence:'Conferência manual'}),true);
 assert.equal(validPaymentOperation({kind:'settle',session_id:id,expected_version:2,idempotency_key:id,payment_id:id,evidence:'Liquidação manual',settled_on:'2026-02-30'}),false);
});
test('payments: DTO strips uncontracted secrets, checks allocations, tender, fees and supports old saved results',()=>{
 const p=paymentsPage({items:[{...payment,secret:'PRIVATE'}],page:1,total:1});assert.equal(JSON.stringify(p).includes('PRIVATE'),false);
 for(const patch of [{net_cents:2999},{change_cents:1000},{amount_cents:4000},{allocations:[...payment.allocations,...payment.allocations]},{fee_cents:-1},{settled_on:'2026-02-30'}])assert.throws(()=>paymentsPage({items:[{...payment,...patch}],page:1,total:1}));
 assert.equal(statement({session,entries:[],total:0,page:1,page_size:5,can_receive:true,payments:p}).payments?.items[0].reference,payment.reference);
 assert.equal(statement({session,entries:[],total:0,page:1,page_size:5,can_receive:true}).payments,undefined);
});
test('payments: anonymous callers cannot enumerate payments or operate them',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));try{for(const path of ['payments','payment']){const r=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,401);}}finally{server.closeAllConnections();server.close();}
});
test('payments: API uses caller Bearer, validates body before RPC and preserves official response/conflict',async()=>{
 const calls:{url:string;authorization:string;body:string}[]=[];let conflict=false;
 const provider=createServer(async(req,res)=>{let body='';for await(const c of req)body+=c;calls.push({url:req.url??'',authorization:req.headers.authorization??'',body});res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated'}));return;}if(conflict){res.statusCode=409;res.end(JSON.stringify({code:'PT409',message:'CASH_CONFLICT'}));return;}res.end(JSON.stringify({session,entries:[],total:0,page:1,page_size:5,can_receive:true,payments:{items:[payment],total:1,page:1},secret:'PRIVATE'}));});await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const keys=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'],old=keys.map(k=>process.env[k]);process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));try{
 const send=(operation:unknown)=>fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/payment`,{method:'POST',headers:{Authorization:'Bearer caller-test','Content-Type':'application/json'},body:JSON.stringify({office_id:id,operation})});
 const r=await send(op);assert.equal(r.status,200);assert.equal(JSON.stringify(await r.json()).includes('PRIVATE'),false);assert.equal(calls[1].url,'/rest/v1/rpc/payment_operate');assert.equal(calls[1].authorization,'Bearer caller-test');assert.deepEqual(JSON.parse(calls[1].body),{p_office_id:id,p_operation:op});
 assert.equal((await send({...op,operator_id:id})).status,422);assert.equal(calls.filter(c=>c.url.includes('rpc')).length,1);conflict=true;assert.equal((await send(op)).status,409);
 }finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
test('payments: new PDF presentation labels decisions in Portuguese while version1 remains frozen',()=>{
 const r={renderer_version:2,contract_version:1,count:1,protocol:'JN-AUD-TESTE',office_name:'Escritório',actor_name:'Operador',created_at:'2026-10-24T00:00:00Z',view:'recent',cutoff:'2026-10-01T00:00:00Z',filters:{action:'',actor_id:'',from:'',until:''}} as AuditReport;
 const events=[{id,action:'payments.pending',actor_id:id,occurred_at:r.created_at,actor_name:'Operador',target_type:'cash_session',target_id:id,outcome:'success',changes:{amount_cents:3000},request_id:id}] as AuditEvent[];
 assert.equal(reportInputV2(r,events).events[0].actionLabel,'Pagamento pendente registrado');assert.throws(()=>reportInputV1(r,events));assert.equal(reportInputV1({...r,renderer_version:1},events).events[0].actionLabel,'Evento de outro módulo');
});
import {gzipSync} from 'node:zlib';
test('Express: malformed compressed JSON with trailing bytes rejects safely and leaves API responsive',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));try{
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const body=Buffer.concat([gzipSync(Buffer.from('{"message":"laboratorio"}')),Buffer.from('invalid trailer')]);
 const response=await fetch(base+'/api/validate',{method:'POST',headers:{'Content-Type':'application/json','Content-Encoding':'gzip'},body});assert.ok([400,500].includes(response.status));
 assert.equal((await fetch(base+'/api/health')).status,200);
 assert.equal((await fetch(base+'/api/validate',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"message":"ok"}'})).status,200);
 }finally{server.closeAllConnections();server.close();}
});
test('payments: destination totals are independent of page, safe integers, and retain unknown historical fees',()=>{
 const destination={account_name:'Banco',payment_type:'card',received_cents:9000,returned_cents:1000,fee_cents:300,net_cents:7700,settled_cents:8700};
 const page=paymentsPage({items:[],total:12,page:3,destinations:[destination]});assert.equal(page.destinations?.[0].net_cents,7700);
 assert.throws(()=>paymentsPage({items:[],total:12,page:3,destinations:[{...destination,net_cents:7800}]}));
 assert.equal(paymentsPage({items:[],total:12,page:3,destinations:[{...destination,fee_cents:null,net_cents:null,settled_cents:null}]}).destinations?.[0].fee_cents,null);
});
