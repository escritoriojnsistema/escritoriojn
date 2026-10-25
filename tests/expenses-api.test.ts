import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validExpenseOperation,validTransferOperation} from '../shared/expenses.js';
import {expenseResult,finance17Page,receipt,transferResult} from '../server/modules/cash/expenseDto.js';
import {app} from '../server/app.js';
import {createServer} from 'node:http';
import {statement} from '../server/modules/cash/financeDto.js';
import {reportInputV4} from '../server/modules/governance/reportV4.js';
import {reportInputV3} from '../server/modules/governance/reportV3.js';
import type {AuditEvent,AuditReport} from '../shared/governance.js';
const id='11111111-1111-4111-8111-111111111111';
const base={idempotency_key:id,evidence:'Comprovante conferido'};
test('despesas17: contrato estrito exige aprovação versionada e pagamento em sessão própria versionada',()=>{
 const create={...base,kind:'create',category:'Material',payee:'Fornecedor',description:'Material de escritório',due_date:'2026-10-25',amount_cents:2000};
 assert.equal(validExpenseOperation(create),true);
 for(const change of [{amount_cents:20.5},{due_date:'2026-02-30'},{approved:true},{category:''},{evidence:'  teste  '},{amount_cents:Number.MAX_SAFE_INTEGER}])assert.equal(validExpenseOperation({...create,...change}),false);
 const approve={...base,kind:'approve',expense_id:id,expected_version:1};assert.equal(validExpenseOperation(approve),true);assert.equal(validExpenseOperation({...approve,expected_version:0}),false);
 const pay={...approve,kind:'pay',session_id:id,account_id:id,expected_session_version:2};assert.equal(validExpenseOperation(pay),true);assert.equal(validExpenseOperation({...pay,expected_session_version:undefined}),false);
});
test('transferências17: sangria20 usa duas contas distintas, centavos e versão',()=>{
 const op={...base,kind:'sangria',session_id:id,expected_session_version:2,source_account_id:id,destination_account_id:'22222222-2222-4222-8222-222222222222',amount_cents:2000,reason:'Retirada para cofre'};
 assert.equal(validTransferOperation(op),true);
 for(const change of [{destination_account_id:id},{amount_cents:0},{amount_cents:-2000},{amount_cents:20.1},{kind:'received'},{operator_id:id},{expected_session_version:0}])assert.equal(validTransferOperation({...op,...change}),false);
});
const expense={id,category:'Material',payee:'Fornecedor',description:'Papel para impressão',due_date:'2026-10-25',amount_cents:2000,status:'pending',version:1,evidence:'Pedido conferido',approval_evidence:null,payment_evidence:null,created_at:'2026-10-25T00:00:00Z',created_by:id,approved_at:null,approved_by:null,paid_at:null,session_id:null,account_id:null};
test('DTO17: elimina campos privados e recusa valores/datas/estados inconsistentes',()=>{
 assert.equal(JSON.stringify(expenseResult({expense:{...expense,private:'PRIVATE'}})).includes('PRIVATE'),false);
 assert.throws(()=>expenseResult({expense:{...expense,amount_cents:20.1}}));
 assert.throws(()=>expenseResult({expense:{...expense,status:'paid'}}));
 const page={page:1,page_size:5,total:1,expenses:[expense],transfers:[],transfers_total:0,accounts:[],accounts_total:0,can_create:true,can_approve:true,can_pay:true,can_transfer:true,can_issue_receipt:true};
 assert.equal(finance17Page(page).expenses[0].amount_cents,2000);
 assert.throws(()=>finance17Page({...page,expenses:Array(6).fill(expense)}));
 assert.throws(()=>transferResult({transfer:{id,kind:'sangria',amount_cents:2000,source_account_id:id,destination_account_id:id,source_account_name:'Caixa',destination_account_name:'Caixa',reason:'Retirada para cofre',evidence:'Conferido',created_at:expense.created_at,session_id:id}}));
});
test('financeiro17: leitura conserva espaços Unicode aceitos no SQL sem inutilizar lista ou extrato',()=>{
 const text='\u00a0Comprovante conferido\u00a0';
 const parsed=expenseResult({expense:{...expense,payee:'\u00a0Fornecedor\u00a0',evidence:text}});assert.equal(parsed.expense.evidence,text);
 const entry={id,kind:'transfer_out',created_at:expense.created_at,amount_cents:2000,cash_cents:-2000,applied_cents:0,request_id:null,charge_id:null,protocol:null,payment_method_name:null,account_name:'Banco',reason:text,original_entry_id:null,refundable_cents:0,counted_cents:null,expected_cents:null};
 const session={id,unit_id:id,unit_name:'Unidade',operator_name:'Operador',is_self:true,status:'open',version:2,opened_at:expense.created_at,closed_at:null,opening_cents:10000,cash_cents:8000,received_cents:0,refunded_cents:0,digital_cents:2000,can_operate:true,can_refund:false};
 assert.equal(statement({session,entries:[entry],total:1,page:1,page_size:5,can_receive:false}).entries[0].reason,text);
 assert.throws(()=>expenseResult({expense:{...expense,evidence:' Comprovante conferido '}}));
});
test('recibo17: contrato preserva valor recebido bruto, referência e versão, sem campos internos',()=>{
 const data={id,number:'JN-REC-000001',version:1,issued_at:expense.created_at,payment_id:id,snapshot:{office_name:'Escritório',operator_name:'Operador',payer_name:null,description:'Serviço recebido',payment_reference:`JN-PAG-${id}`,amount_cents:3000,payment_type:'cash',method_name:'Dinheiro',confirmed_at:expense.created_at,allocations:[{protocol:'JN-0001',amount_cents:3000}],private:'PRIVATE'}};
 assert.equal(receipt(data).snapshot.amount_cents,3000);assert.equal(JSON.stringify(receipt(data)).includes('PRIVATE'),false);
 assert.throws(()=>receipt({...data,version:2}));assert.throws(()=>receipt({...data,snapshot:{...data.snapshot,amount_cents:5000}}));
});
test('API17: anônimo é bloqueado e cada contrato usa Bearer/RPC, sem aceitar ator ou vazar campos',async()=>{
 const calls:{url:string;authorization:string|undefined;body:string}[]=[];let failure=0;
 const provider=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({url:req.url??'',authorization:req.headers.authorization,body});res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}
  if(failure){res.statusCode=failure;res.end(JSON.stringify({code:`PT${failure}`,message:failure===403?'CASH_FORBIDDEN':'CASH_CONFLICT',details:'PRIVATE'}));return;}
  res.end(JSON.stringify({expense:{...expense,PRIVATE:'secret'}}));
 });await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const vars=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const,old=vars.map(k=>process.env[k]);process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash`;
  for(const path of ['finance17','expense','transfer','receipt'])assert.equal((await fetch(`${url}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
  assert.equal(calls.length,0);
  const operation={kind:'create',idempotency_key:id,evidence:'Comprovante conferido',category:'Material',payee:'Fornecedor',description:'Papel para impressão',due_date:'2026-10-25',amount_cents:2000};
  const send=(body:unknown)=>fetch(url+'/expense',{method:'POST',headers:{Authorization:'Bearer caller-test','Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await send({office_id:id,operation});assert.equal(response.status,200);assert.equal(JSON.stringify(await response.json()).includes('PRIVATE'),false);assert.equal(calls.at(-1)?.url,'/rest/v1/rpc/expense_operate');assert.equal(calls.at(-1)?.authorization,'Bearer caller-test');assert.deepEqual(JSON.parse(calls.at(-1)!.body),{p_office_id:id,p_operation:operation});
  assert.equal((await send({office_id:id,operation:{...operation,actor_id:id}})).status,422);
  failure=403;const denied=await send({office_id:id,operation});assert.equal(denied.status,403);assert.equal(JSON.stringify(await denied.json()).includes('PRIVATE'),false);
  failure=409;assert.equal((await send({office_id:id,operation})).status,409);
 }finally{vars.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
test('auditoria17: apresentação4 nomeia despesas/recibos e apresentação3 permanece congelada',()=>{
 const report={renderer_version:4,contract_version:1,count:1,protocol:'JN-AUD-TESTE',office_name:'Escritório',actor_name:'Operador',created_at:'2026-10-25T00:00:00Z',view:'recent',cutoff:'2026-10-01T00:00:00Z',filters:{action:'',actor_id:'',from:'',until:''}} as AuditReport;
 const events=[{id,action:'expenses.pay',actor_id:id,occurred_at:report.created_at,actor_name:'Operador',target_type:'expense',target_id:id,outcome:'success',changes:{amount_cents:2000},request_id:id}] as AuditEvent[];
 assert.equal(reportInputV4(report,events).events[0].actionLabel,'Despesa paga');assert.equal(reportInputV3({...report,renderer_version:3},events).events[0].actionLabel,'Evento de outro módulo');
});
