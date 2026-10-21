import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';

const office='00000000-0000-4000-e000-000000000101',id='00000000-0000-4000-d000-000000000101',key='00000000-0000-4000-f000-000000000101';
const summary={id,protocol:'JN-2026-000001',title:'Pedido fictício',public_status:'recebido',created_at:'2026-10-20T12:00:00Z',updated_at:'2026-10-20T12:00:00Z'};
const portal={...summary,portal:true,message:'Triagem fictícia',services:['Xerox de Teste'],internal_note:'PRIVATE NOTE',created_by:id,total_cents:999};

test('atendimentos10: API valida, preserva idempotência e projeta cliente sem dados internos',async t=>{
 let mode='portal'; const calls:{url:string;body:Record<string,unknown>;authorization?:string}[]=[];
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
  calls.push({url:req.url??'',body,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated',email:'fixture@example.test'}));return;}
  if(mode==='malformed'){res.end(JSON.stringify({...portal,portal:'true'}));return;}
  if(mode==='access_lost'){res.end('{"access_lost":true,"internal_note":"PRIVATE NOTE"}');return;}
  if(mode.startsWith('error')){const status=Number(mode.slice(5));res.statusCode=status;res.end(JSON.stringify({code:`PT${status}`,message:status===401?'AUTH_REQUIRED':status===403?'REQUESTS_FORBIDDEN':status===404?'REQUEST_NOT_FOUND':status===409?'REQUEST_CONFLICT':status===422?'REQUESTS_VALIDATION':'SQL private secret'}));return;}
  if(req.url?.endsWith('requests_page')){res.end(JSON.stringify({portal:true,items:[portal],page:body.p_page,page_size:body.p_size,total:1}));return;}
  if(req.url?.endsWith('request_options')){res.end(JSON.stringify({items:[{id,label:'Xerox de Teste',internal_note:'PRIVATE NOTE'}],total:1,page:body.p_page,page_size:body.p_size}));return;}
  res.end(JSON.stringify(portal));
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const previous=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/requests`;
 const headers={Authorization:'Bearer requests-test-token','Content-Type':'application/json'};
 const send=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 const search={office_id:office,query:'',scope:'mine',status:'',page:1,size:3};
 const input={office_id:office,request:{origin:'portal',title:'Pedido fictício',message:'Triagem fictícia'},idempotency_key:key};
 try{
  await t.test('anônimo bloqueado, uma identidade e uma RPC, no-store',async()=>{
   calls.length=0;assert.equal((await fetch(base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(search)})).status,401);assert.equal(calls.length,0);
   const response=await send('/search',search);assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/private.*no-store/);
   assert.deepEqual(calls.map(c=>c.url),['/auth/v1/user','/rest/v1/rpc/requests_page']);assert.ok(calls.every(c=>c.authorization==='Bearer requests-test-token'));
   const value=await response.json();assert.deepEqual(value.data.items,[summary]);assert.ok(!JSON.stringify(value).includes('PRIVATE'));
  });
  await t.test('abertura mantém chave fornecida e evento gerado no servidor',async()=>{
   for(let n=0;n<2;n++){const response=await send('',input);assert.equal(response.status,201);assert.deepEqual((await response.json()).data,{...summary,portal:true,message:'Triagem fictícia',services:['Xerox de Teste'],assignee_name:null});assert.equal(calls.at(-1)?.body.p_idempotency_key,key);assert.notEqual(calls.at(-1)?.body.p_request_id,key);}
   const response=await send(`/${id}/detail`,{office_id:office,page:1});assert.equal(response.status,200);assert.ok(!(await response.text()).includes('PRIVATE'));
  });
  await t.test('portal não aceita responsável, nota, preço ou pessoa arbitrários',async()=>{
   for(const extra of [{created_by:id},{customer_id:id},{assignee_id:id},{internal_note:'secret'},{items:[]},{price_cents:1}])assert.equal((await send('',{...input,request:{...input.request,...extra}})).status,422);
   for(const change of [{idempotency_key:'bad'},{actor_id:id},{request:{...input.request,title:''}},{request:{...input.request,message:'x'.repeat(2001)}}])assert.equal((await send('',{...input,...change})).status,422);
   for(const change of [{scope:'all'},{size:100},{status:'quitado'},{page:0},{office_id:'bad'},{query:'a\u0000'}])assert.equal((await send('/search',{...search,...change})).status,422);
  });
  await t.test('itens e ações rejeitam números, formato e cancelamento sem revisão explícita',async()=>{
   const item={service_id:id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]};
   const staff={origin:'presencial',title:'Balcão fictício',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',items:[item],internal_note:''};
   assert.equal((await send('',{...input,request:staff})).status,201);
   for(const bad of [{quantity:1.5},{quantity:-1},{fields:{bad:{nested:true}}},{participant_ids:[id,id]},{checklist:['x','x']},{snapshot:{total:1}},{adjustment:{kind:'discount',value:100,reason:''}}])assert.equal((await send('',{...input,request:{...staff,items:[{...item,...bad}]}})).status,422,JSON.stringify(bad));
   const act={office_id:office,expected_version:1,mutation:{kind:'status',status:'cancelado',reason:'Pedido duplicado fictício'}};
   assert.equal((await send(`/${id}/actions`,act)).status,422);
   assert.equal((await send(`/${id}/actions`,{...act,mutation:{...act.mutation,cancellation_review:{charges_reviewed:true,refunds_reviewed:true,deliveries_reviewed:true,external_reviewed:true}}})).status,200);
   assert.equal((await send(`/${id}/actions`,{...act,expected_version:0})).status,422);
   assert.equal((await send(`/${id}/actions`,{...act,mutation:{kind:'note',note:'  '}})).status,422);
  });
  await t.test('seletores removem extras; perda de escopo não devolve ficha',async()=>{
   const response=await send('/options',{office_id:office,kind:'assignees',query:'',page:1,size:3});assert.equal(response.status,200);assert.deepEqual((await response.json()).data.items,[{id,label:'Xerox de Teste'}]);
   mode='access_lost';const lost=await send(`/${id}/actions`,{office_id:office,expected_version:1,mutation:{kind:'transfer',assignee_id:id,reason:'Transferência fictícia'}});assert.equal(lost.status,200);assert.deepEqual((await lost.json()).data,{access_lost:true});
  });
  await t.test('401/403/404/409/422/503 seguros e DTO inválido fechado',async()=>{
   for(const [value,status] of [['error401',401],['error403',403],['error404',404],['error409',409],['error422',422],['error500',503],['malformed',503]] as const){mode=value;const r=await send(`/${id}/detail`,{office_id:office,page:1});assert.equal(r.status,status);assert.ok(!(await r.text()).includes('SQL private'));}
  });
 }finally{
  for(const [i,k] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];
  server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
 }
});
