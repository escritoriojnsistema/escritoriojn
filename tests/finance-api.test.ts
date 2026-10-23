import test from 'node:test';
import assert from 'node:assert/strict';
import {app} from '../server/app.js';
import {validFinanceOperation} from '../shared/finance.js';
const id='00000000-0000-4000-a000-000000000151';
test('finance: commands validate cents, versions, reasons and reject forged authority',()=>{
 const receive={kind:'receive',session_id:id,expected_version:1,idempotency_key:id,charge_id:id,expected_charge_version:1,payment_method_id:id,amount_cents:123};
 assert.equal(validFinanceOperation(receive),true);
 for(const patch of [{amount_cents:0},{amount_cents:1.5},{expected_version:0},{operator_id:id},{amount_cents:'123'}])assert.equal(validFinanceOperation({...receive,...patch}),false);
 assert.equal(validFinanceOperation({kind:'close',session_id:id,expected_version:1,idempotency_key:id,counted_cents:0,reason:'Conferido pelo operador'}),true);
 assert.equal(validFinanceOperation({kind:'refund',session_id:id,expected_version:1,idempotency_key:id,entry_id:id,amount_cents:10,reason:'x'}),false);
});
test('finance: all new endpoints require authenticated identity before querying money',async()=>{
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{for(const path of ['statement','eligible-charges','operate','client-finance']){const response=await fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(response.status,401,path);}}
 finally{server.closeAllConnections();server.close();}
});
import {createServer} from 'node:http';
test('finance: authenticated statement strips private fields and closed request JSON rejects forged actor',async()=>{
 const calls:string[]=[];const fixture={session:{id,unit_id:id,unit_name:'Unidade',operator_name:'Operador',is_self:true,status:'open',version:2,opened_at:'2026-10-23T12:00:00Z',closed_at:null,opening_cents:100,cash_cents:150,received_cents:50,refunded_cents:0,digital_cents:0,can_operate:true,can_refund:true,secret:'PRIVATE'},entries:[],total:0,page:1,page_size:5,can_receive:true,secret:'PRIVATE'};
 const provider=createServer(async(req,res)=>{calls.push(req.url??'');res.setHeader('Content-Type','application/json');res.end(JSON.stringify(req.url==='/auth/v1/user'?{id,aud:'authenticated'}:fixture));});await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const keys=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'];const old=keys.map(k=>process.env[k]);process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const send=(body:unknown)=>fetch(`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/statement`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture'},body:JSON.stringify(body)});const r=await send({office_id:id,session_id:id,page:1});assert.equal(r.status,200);assert.ok(!JSON.stringify(await r.json()).includes('PRIVATE'));assert.deepEqual(calls,['/auth/v1/user','/rest/v1/rpc/cash_statement']);assert.equal((await send({office_id:id,session_id:id,page:1,actor_id:id})).status,422);}
 finally{keys.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
import {statement as statementDto} from '../server/modules/cash/financeDto.js';
import {dashboard as dashboardDto} from '../server/modules/cash/dto.js';
test('finance: cumulative receipts and refunds exceed a single operation limit without losing confirmed response',()=>{
 const high=1_000_000_000_001;const s={id,unit_id:id,unit_name:'Unidade',operator_name:'Operador',is_self:true,status:'open',version:4,opened_at:'2026-10-23T12:00:00Z',closed_at:null,opening_cents:0,cash_cents:0,received_cents:high,refunded_cents:1_000_000_000_000,digital_cents:1,can_operate:true,can_refund:true};
 assert.equal(statementDto({session:s,entries:[],total:0,page:1,page_size:5,can_receive:true}).session.received_cents,high);
 const d=dashboardDto({sessions:[{...s,cash_account_id:id,account_name:'Espécie',numerario_cents:0,received_cents:-high}],total:1,page:1,page_size:5,scope:'own',can_open:true,can_manage:true,can_read_all:true,summary:{open:1,closed:0,numerario_cents:high,received_cents:high}});assert.equal(d.sessions[0].received_cents,-high);assert.equal(d.summary?.received_cents,high);
 assert.throws(()=>statementDto({session:{...s,received_cents:Number.MAX_SAFE_INTEGER+1},entries:[],total:0,page:1,page_size:5,can_receive:true}));
});
