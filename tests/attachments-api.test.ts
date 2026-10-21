import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
const id='00000000-0000-4000-d000-000000000111',office='00000000-0000-4000-e000-000000000111';
const file={id,request_id:id,request_item_id:null,name:'ficticio.pdf',mime_type:'application/pdf',size_bytes:48,sha256:'a'.repeat(64),classification:'documento',status:'quarentena',scanner_status:'not_configured',validation_reason:null,intent_id:null,created_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-21T00:00:00Z',can_validate:false,can_download:false,can_copy:false};
test('anexos11: API delega autoridade ao JWT, limita contrato e não expõe dados privados',async t=>{
 let mode='ok';const calls:{url:string;body:Record<string,unknown>;authorization?:string}[]=[];
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body=raw?JSON.parse(raw):{};
  calls.push({url:req.url??'',body,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated',email:'fixture@example.test'}));return;}
  if(mode.startsWith('error')){const status=Number(mode.slice(5));res.statusCode=status;res.end(JSON.stringify({code:`PT${status}`,message:status===401?'AUTH_REQUIRED':status===403?'FILES_FORBIDDEN':status===404?'FILE_NOT_FOUND':status===409?'FILE_NOT_READY':status===422?'FILE_VALIDATION':'private storage secret'}));return;}
  const unsafe={...file,object_path:'PRIVATE-PATH',created_by:'PRIVATE-ACTOR',private:'PRIVATE'};
  if(mode==='malformed'){res.end(JSON.stringify({...unsafe,can_download:true}));return;}
  if(req.url?.endsWith('files_page')){res.end(JSON.stringify({items:[unsafe],total:1,page:body.p_page,page_size:body.p_size,portal:true}));return;}
  if(req.url?.endsWith('files_requests_page')){res.end(JSON.stringify({items:[{id,label:'JN-111 Pedido fictício',closed:false,items:[],private:'PRIVATE'}],total:1,page:1,page_size:3}));return;}
  if(req.url?.endsWith('files_begin_upload')){res.end(JSON.stringify({file:{...unsafe,status:'aguardando_upload',can_validate:true,intent_id:id},intent_id:id,bucket:'request-attachments',object_path:`${office}/${id}/${id}`,expires_at:'2026-10-22T00:00:00Z',can_upload:true}));return;}
  if(req.url?.endsWith('files_cleanup_plan')){res.end(JSON.stringify({id,expires_at:'2026-10-22T00:00:00Z',count:0,orphan_count:0,private:'PRIVATE'}));return;}
  if(req.url?.includes('/functions/v1/')){res.end(JSON.stringify({data:{file:unsafe,removed:0,pending:0}}));return;}
  res.end(JSON.stringify({max_bytes:10485760,mime_types:['application/pdf'],version:1,private:'PRIVATE'}));
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const previous=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/attachments`;
 const headers={Authorization:'Bearer attachments-fixture-token','Content-Type':'application/json'};
 const send=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 const search={office_id:office,request_id:null,page:1,size:3};
 try{
  await t.test('anônimo bloqueado antes da rede e lista no-store sem caminhos/atores',async()=>{
   calls.length=0;assert.equal((await fetch(base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(search)})).status,401);assert.equal(calls.length,0);
   const r=await send('/search',search);assert.equal(r.status,200);assert.match(r.headers.get('cache-control')??'',/private.*no-store/);const text=await r.text();assert.ok(!text.includes('PRIVATE'));assert.deepEqual(JSON.parse(text).data.items,[file]);
   assert.deepEqual(calls.map(c=>c.url),['/auth/v1/user','/rest/v1/rpc/files_page']);assert.ok(calls.every(c=>c.authorization===headers.Authorization));
  });
  await t.test('intenção conserva chave; escolhas e política são projetadas; processo não transporta bytes',async()=>{
   const input={request_id:id,request_item_id:null,name:file.name,mime_type:file.mime_type,size_bytes:file.size_bytes,sha256:file.sha256,classification:file.classification,idempotency_key:id};
   const r=await send('/intents',{office_id:office,input});assert.equal(r.status,201);assert.equal((await r.json()).data.file.created_by,undefined);assert.deepEqual(calls.at(-1)?.body.p_input,input);assert.notEqual(calls.at(-1)?.body.p_event_id,id);
   for(const [path,body] of [['/requests',{office_id:office,query:'',page:1,size:3}],['/policy',{office_id:office,service_id:id}],['/cleanup-plan',{office_id:office}],['/process',{office_id:office,action:'validate',args:{intent_id:id}}]] as const){const response=await send(path,body);assert.equal(response.status,200,path);assert.ok(!(await response.text()).includes('PRIVATE'));}
   const last=calls.at(-1)!;assert.equal(last.url,'/functions/v1/private-attachments');assert.equal(last.authorization,headers.Authorization);assert.deepEqual(last.body,{office_id:office,action:'validate',args:{intent_id:id}});
  });
  await t.test('autoridade/URLs/estado extra e DTO que libera quarentena são recusados',async()=>{
   for(const change of [{size:100},{page:0},{office_id:'bad'},{created_by:id},{request_id:'bad'}])assert.equal((await send('/search',{...search,...change})).status,422);
   assert.equal((await send('/process',{office_id:office,action:'validate',args:{intent_id:id,clean:true}})).status,422);
   assert.equal((await send('/policy/update',{office_id:office,service_id:id,expected_version:1,max_bytes:10485761,mime_types:['application/pdf'],reason:'Teste'})).status,422);
   mode='malformed';assert.equal((await send('/search',search)).status,503);
  });
  await t.test('erros conhecidos distintos, detalhes internos nunca publicados',async()=>{
   for(const status of [401,403,404,409,422,500]){mode=`error${status}`;const r=await send('/search',search);assert.equal(r.status,status===500?503:status);assert.ok(!(await r.text()).includes('private storage'));}
  });
 }finally{
  for(const [i,k] of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];
  server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
 }
});
