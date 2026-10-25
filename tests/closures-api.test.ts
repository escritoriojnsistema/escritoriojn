import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validClosureOperation} from '../shared/closures.js';
import {closureRecord,closureState} from '../server/modules/cash/closureDto.js';
import {app} from '../server/app.js';
import {createServer} from 'node:http';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const group={key:`cash:${id}`,account_id:id,account_name:'Caixa',payment_type:'cash',expected_cents:13000,received_cents:3000,returned_cents:0,fee_cents:0,net_cents:13000,settled_cents:0,pending_cents:0};
const line={...group,counted_cents:12900,difference_cents:-100};
const record={id,session_id:id,source_id:null,kind:'close',version:1,created_at:'2026-10-25T12:00:00Z',actor_name:'Operador',reason:'Contagem conferida',groups:[line],has_difference:true,differences_count:1,absolute_difference_cents:100,review:null,can_review:true};
const state={session_id:id,session_version:2,status:'open',can_record:true,can_adjust:true,groups:[group],records:[record],total:1,page:1,page_size:5,sources:[],sources_total:0,source_page:1};
const base={kind:'close',session_id:id,expected_version:2,idempotency_key:other,reason:'Contagem conferida',counts:[{key:group.key,counted_cents:12900}]};
test('fecho18: contrato exato, contagens integrais e chave por meio/destino sem autoridade do navegador',()=>{
 assert.equal(validClosureOperation(base),true);
 for(const change of [{counts:[]},{counts:[base.counts[0],base.counts[0]]},{counts:[{key:group.key,counted_cents:-1}]},{counts:[{key:group.key,counted_cents:1.2}]},{counts:[{key:group.key,counted_cents:1e12+1}]},{actor_id:id},{reason:' motivo '},{expected_version:0},{counts:[{key:`pix:${id}`,counted_cents:0,expected_cents:0}]}])assert.equal(validClosureOperation({...base,...change}),false);
 assert.equal(validClosureOperation({...base,counts:[{key:`pix:${id}`,counted_cents:-100}]}),true);
 assert.equal(validClosureOperation({...base,kind:'adjust',source_id:id}),true);
 assert.equal(validClosureOperation({...base,kind:'review',record_id:id,expected_record_version:1,decision:'approve',counts:undefined}),false);
 const {counts:_,...common}=base;
 assert.equal(validClosureOperation({...common,kind:'review',record_id:id,expected_record_version:1,decision:'reject'}),true);
});
test('fecho18: DTO preserva divergências compensadas, projeta e valida relações',()=>{
 const pix={...line,key:`pix:${other}`,account_id:other,account_name:'Banco',payment_type:'pix',expected_cents:4000,net_cents:4000,counted_cents:4100,difference_cents:100};
 const both={...record,groups:[line,pix],differences_count:2,absolute_difference_cents:200,PRIVATE:'secret'};
 assert.equal(closureRecord(both).has_difference,true);assert.equal(JSON.stringify(closureRecord(both)).includes('PRIVATE'),false);
 assert.throws(()=>closureRecord({...both,has_difference:false}));assert.throws(()=>closureRecord({...both,absolute_difference_cents:0}));assert.throws(()=>closureRecord({...record,groups:[{...line,difference_cents:0}]}));
 assert.throws(()=>closureState({...state,records:Array(6).fill(record)}));assert.throws(()=>closureState({...state,groups:[group,group]}));
 assert.equal(closureRecord({...record,reason:'\u00a0Conferido\u00a0'}).reason,'\u00a0Conferido\u00a0');
 assert.throws(()=>closureRecord({...record,review:{decision:'approve',reason:'Conferido',actor_name:'Gestor',created_at:record.created_at}}));
 assert.equal(closureState({...state,can_record:false,can_adjust:false,status:'closed'}).status,'closed');
});
test('API18: Bearer, RPC restrita, limite próprio de contagens e erros sem detalhes privados',async()=>{
 const calls:{url:string;authorization:string|undefined;body:string}[]=[];let failure=0;
 const provider=createServer(async(req,res)=>{let body='';for await(const chunk of req)body+=chunk;calls.push({url:req.url??'',authorization:req.headers.authorization,body});res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}if(failure){res.statusCode=failure;res.end(JSON.stringify({code:`PT${failure}`,message:failure===403?'CASH_FORBIDDEN':'CASH_CONFLICT',details:'PRIVATE'}));return;}res.end(JSON.stringify(req.url?.endsWith('closure_operate')?{statement:{session:{id,unit_id:id,unit_name:'Unidade',operator_name:'Operador',is_self:true,status:'closed',version:3,opened_at:record.created_at,closed_at:record.created_at,opening_cents:13000,cash_cents:13000,received_cents:0,refunded_cents:0,digital_cents:0,can_operate:false,can_refund:false},entries:[],total:0,page:1,page_size:5,can_receive:false,closures_enabled:true},record}:req.url?.endsWith('closure_record')?record:state));});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const vars=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'] as const,old=vars.map(k=>process.env[k]);process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 try{const url=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/cash/closures`;
 for(const path of ['state','record','operate'])assert.equal((await fetch(`${url}/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);assert.equal(calls.length,0);
 const send=(path:string,body:unknown)=>fetch(url+path,{method:'POST',headers:{Authorization:'Bearer caller-test','Content-Type':'application/json'},body:JSON.stringify(body)});
 const response=await send('/state',{office_id:id,session_id:id,page:1,source_page:1});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.equal(calls.at(-1)?.url,'/rest/v1/rpc/closure_state');assert.equal(calls.at(-1)?.authorization,'Bearer caller-test');assert.deepEqual(JSON.parse(calls.at(-1)!.body),{p_office_id:id,p_session_id:id,p_page:1,p_source_page:1});
 assert.equal((await send('/record',{office_id:id,record_id:id})).status,200);
 const hundred=Array.from({length:100},(_,n)=>({key:`pix:77777777-7777-4777-8777-${String(n).padStart(12,'0')}`,counted_cents:1e12}));
 const large={office_id:id,operation:{...base,reason:'x'.repeat(500),counts:hundred}};assert.ok(JSON.stringify(large).length>8192);assert.equal((await send('/operate',large)).status,200);assert.equal((await send('/operate',{...large,operation:{...large.operation,reason:'x'.repeat(33000)}})).status,413);
 assert.equal((await send('/operate',{office_id:id,operation:{...base,actor_id:id}})).status,422);
 failure=403;const denied=await send('/state',{office_id:id,session_id:id,page:1,source_page:1});assert.equal(denied.status,403);assert.equal(JSON.stringify(await denied.json()).includes('PRIVATE'),false);
 failure=409;assert.equal((await send('/operate',{office_id:id,operation:base})).status,409);
 }finally{vars.forEach((k,i)=>{if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];});server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
test('auditoria18: apresentação5 nomeia conferência sem alterar catálogo4',async()=>{
 const {reportInputV5}=await import('../server/modules/governance/reportV5.js'),{reportInputV4}=await import('../server/modules/governance/reportV4.js');
 const report={renderer_version:5,contract_version:1,count:1,protocol:'JN-AUD-TESTE',office_name:'Escritório',actor_name:'Operador',created_at:'2026-10-25T00:00:00Z',view:'recent',cutoff:'2026-10-01T00:00:00Z',filters:{action:'',actor_id:'',from:'',until:''}} as import('../shared/governance.js').AuditReport;
 const events=[{id,action:'cash.closure_recorded',actor_id:id,occurred_at:report.created_at,actor_name:'Operador',target_type:'cash_session',target_id:id,outcome:'success',changes:{},request_id:id}] as import('../shared/governance.js').AuditEvent[];
 assert.equal(reportInputV5(report,events).events[0].actionLabel,'Conferência por meio registrada');assert.equal(reportInputV4({...report,renderer_version:4},events).events[0].actionLabel,'Evento de outro módulo');
});
