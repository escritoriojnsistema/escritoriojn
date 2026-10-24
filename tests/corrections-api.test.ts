import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
import {validCorrectionOperation} from '../shared/corrections.js';
import {correctionSources} from '../server/modules/cash/correctionDto.js';
import {financialCharges,statement} from '../server/modules/cash/financeDto.js';
import {paymentsPage} from '../server/modules/cash/paymentDto.js';
import {reportInputV3} from '../server/modules/governance/reportV3.js';
import {reportInputV2} from '../server/modules/governance/reportV2.js';
import type {AuditEvent,AuditReport} from '../shared/governance.js';
const id='00000000-0000-4000-a000-000000000161';
const op={kind:'reverse',session_id:id,expected_version:1,idempotency_key:id,allocation_id:id,refund_now:false,amount_cents:2000,reason:'Motivo privado da correcao',evidence:'Evidencia privada verificada'};
const source={allocation_id:id,reversal_id:null,payment_id:id,reference:`JN-PAG-${id}`,original_entry_id:id,request_id:id,protocol:'JN-TESTE',created_at:'2026-10-24T00:00:00Z',payment_type:'cash',method_name:'Dinheiro',account_name:'Especie',original_cents:6000,reversed_cents:2000,refunded_cents:0,pending_refund_cents:2000,available_cents:4000,reversal_cents:null,legacy:false};
const session={id,unit_id:id,unit_name:'Unidade',operator_name:'Operador',is_self:true,status:'open',version:2,opened_at:'2026-10-24T00:00:00Z',closed_at:null,opening_cents:10000,cash_cents:16000,received_cents:6000,refunded_cents:0,digital_cents:0,can_operate:true,can_refund:true};
test('corrections16: exact command keeps logical reversal independent from actual refund',()=>{
 assert.equal(validCorrectionOperation(op),true);assert.equal(validCorrectionOperation({...op,refund_now:true}),true);
 const {allocation_id:_,refund_now:__,...base}=op;assert.equal(validCorrectionOperation({...base,kind:'refund',reversal_id:id}),true);
 for(const patch of [{allocation_id:null},{amount_cents:0},{amount_cents:'2000'},{amount_cents:1.5},{expected_version:true},{refund_now:null},{reason:' '},{evidence:null},{actor_id:id},{settled_on:'infinity'},{kind:'cancel'}])assert.equal(validCorrectionOperation({...op,...patch}),false,JSON.stringify(patch));
});
test('corrections16: DTO validates independent limits and strips uncontracted values',()=>{
 assert.equal(JSON.stringify(correctionSources({kind:'reverse',items:[{...source,secret:'PRIVATE'}],total:1,page:1,page_size:5})).includes('PRIVATE'),false);
 for(const patch of [{available_cents:6000},{refunded_cents:2001},{pending_refund_cents:0},{reversal_id:id},{reversed_cents:6001}])assert.throws(()=>correctionSources({kind:'reverse',items:[{...source,...patch}],total:1,page:1,page_size:5}));
 assert.equal(correctionSources({kind:'refund',items:[{...source,reversal_id:id,reversal_cents:2000,available_cents:2000}],total:1,page:1,page_size:5}).items[0].available_cents,2000);
});
test('corrections16: financial DTO preserves snapshot condition and pending liability without exposing raw data',()=>{
 const charge={id,request_id:id,protocol:'JN-TESTE',version:1,due_cents:10000,paid_cents:4000,balance_cents:6000,status:'open',services:['Servico'],installments:[],financial_condition:{settlement_required:true,blocked:true},pending_refund_cents:2000};
 const page={items:[charge],total:1,page:1,page_size:5,summary:{due_cents:10000,paid_cents:4000,balance_cents:6000}};
 assert.deepEqual(financialCharges(page).items[0].financial_condition,charge.financial_condition);assert.equal(financialCharges(page).items[0].pending_refund_cents,2000);
 assert.throws(()=>financialCharges({...page,items:[{...charge,financial_condition:{settlement_required:false,blocked:true}}]}));
 for(const kind of ['allocation_reversed','refund_paid'])assert.equal(statement({session,entries:[{id,kind,created_at:source.created_at,amount_cents:2000,cash_cents:kind==='refund_paid'?-2000:0,applied_cents:kind==='refund_paid'?0:-2000,protocol:source.protocol,request_id:id,charge_id:id,payment_method_name:'Dinheiro',account_name:'Especie',reason:op.reason,original_entry_id:id,refundable_cents:0,counted_cents:null,expected_cents:null}],total:1,page:1,page_size:5,can_receive:true}).entries[0].kind,kind);
});
test('corrections16: anonymous cannot enumerate or operate correction sources',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));try{for(const path of ['correction','correction-sources'])assert.equal((await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);}finally{server.closeAllConnections();server.close();}
});
test('corrections16: API uses public connection and caller Bearer, rejects malformed fields before RPC, consumes official statement',async()=>{
 const calls:{path:string;authorization:string;body:unknown}[]=[];let status=200;
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;calls.push({path:req.url??'',authorization:req.headers.authorization??'',body:raw?JSON.parse(raw):null});res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated'}));return;}res.statusCode=status;res.end(JSON.stringify(status===200?{session,entries:[],total:0,page:1,page_size:5,can_receive:true,secret:'PRIVATE'}:{code:`PT${status}`,message:status===403?'CASH_FORBIDDEN':'CASH_CONFLICT'}));});await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const names=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'],old=names.map(k=>process.env[k]);process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const send=(operation:unknown)=>fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/correction`,{method:'POST',headers:{Authorization:'Bearer local-caller','Content-Type':'application/json'},body:JSON.stringify({office_id:id,operation})});
 const r=await send(op);assert.equal(r.status,200);assert.equal(JSON.stringify(await r.json()).includes('PRIVATE'),false);assert.deepEqual(calls[1],{path:'/rest/v1/rpc/correction_operate',authorization:'Bearer local-caller',body:{p_office_id:id,p_operation:op}});
 assert.equal((await send({...op,refund_now:'false'})).status,422);assert.equal(calls.filter(c=>c.path.includes('rpc')).length,1);for(const code of [403,409]){status=code;assert.equal((await send(op)).status,code);}
 }finally{names.forEach((k,i)=>old[i]===undefined?delete process.env[k]:process.env[k]=old[i]);server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
test('corrections16: presentation3 labels new events while presentation2 remains frozen',()=>{
 const r={renderer_version:3,contract_version:1,count:1,protocol:'JN-AUD-TESTE',office_name:'Escritorio',actor_name:'Operador',created_at:source.created_at,view:'recent',cutoff:source.created_at,filters:{action:'',actor_id:'',from:'',until:''}} as AuditReport;
 const events=[{id,action:'payments.allocation_reversed',actor_id:id,occurred_at:source.created_at,actor_name:'Operador',target_type:'cash_session',target_id:id,outcome:'success',changes:{amount_cents:2000},request_id:id}] as AuditEvent[];
 assert.equal(reportInputV3(r,events).events[0].actionLabel,'Alocação de pagamento estornada');assert.equal(reportInputV2({...r,renderer_version:2},events).events[0].actionLabel,'Evento de outro módulo');assert.throws(()=>reportInputV2(r,events));
});
void paymentsPage;
test('corrections16: financial entry reason preserves500Unicode codepoints from SQL and rejects overflow or controls',()=>{
 const parse=(reason:unknown)=>statement({session:{...session,cash_cents:14000,refunded_cents:2000},entries:[{id,kind:'refund_paid',created_at:source.created_at,amount_cents:2000,cash_cents:-2000,applied_cents:0,protocol:source.protocol,request_id:id,charge_id:id,payment_method_name:'Dinheiro',account_name:'Especie',reason,original_entry_id:id,refundable_cents:0,counted_cents:null,expected_cents:null}],total:1,page:1,page_size:5,can_receive:true});
 for(const reason of ['🧾'.repeat(500),'a🧾'.repeat(250),'a'.repeat(500),'🧾'.repeat(5)])assert.equal(parse(reason).entries[0].reason,reason);
 for(const reason of ['🧾'.repeat(501),'a'.repeat(501),'🧾'.repeat(4),'     ','Motivo\u0000inválido','Motivo\ninválido','Motivo\u007finválido',null])assert.throws(()=>parse(reason));
});
