import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createPrivateAttachmentsHandler} from '../supabase/functions/private-attachments/handler.ts';
const office='00000000-0000-4000-e000-000000000111',id='00000000-0000-4000-d000-000000000111';
const bytes=new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');
const hash=Buffer.from(await crypto.subtle.digest('SHA-256',bytes)).toString('hex');
test('anexos11: worker só acessa objeto autorizado pela lease e registra falhas recuperáveis',async t=>{
 let mode='ok',action='validate';const calls:{url:string;authorization?:string;body:Record<string,unknown>}[]=[];
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const part of req)raw+=part;const body=raw?JSON.parse(raw):{};calls.push({url:req.url??'',authorization:req.headers.authorization,body});res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated'}));return;}
  if(req.url==='/rest/v1/rpc/files_process_claim'){
   if(mode==='denied'){res.statusCode=403;res.end('{"code":"PT403","message":"FILES_FORBIDDEN"}');return;}
   const file={file_id:id,intent_id:id,bucket:'request-attachments',object_path:`${office}/${id}/${id}`,source_path:`${office}/${office}/${id}`,name:'ficticio.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:hash};
   if(mode==='bad-path')file.object_path=`${id}/${id}/${id}`;
   res.end(JSON.stringify({lease_id:id,lease_token:'a'.repeat(64),action,expires_at:new Date(Date.now()+(mode==='completed'?-60000:60000)).toISOString(),objects:[file],result:mode==='completed'?{file:null,removed:1,pending:0,private:'PRIVATE'}:null}));return;
  }
  if(req.url?.startsWith('/storage/v1/object/authenticated/')){
   if(mode==='missing'){res.statusCode=404;res.end('{"message":"PRIVATE STORAGE"}');return;}
   res.setHeader('Content-Type','application/pdf');res.end(bytes);return;
  }
  if(req.method==='DELETE'&&req.url?.startsWith('/storage/')){if(mode==='delete-failed'){res.statusCode=500;res.end('{"message":"PRIVATE STORAGE"}');}else res.end('[]');return;}
  if(req.url==='/rest/v1/rpc/files_process_complete'){
   if(mode==='revoked'){res.statusCode=403;res.end('{"code":"PT403","message":"FILES_FORBIDDEN"}');return;}
   if(mode==='db-failed'){res.statusCode=500;res.end('{"code":"XX000","message":"PRIVATE DB"}');return;}
   const result=body.p_result as {outcome:string;removed_ids?:string[]};
   res.end(JSON.stringify({file:result.outcome==='removed'?null:{id,request_id:id,request_item_id:null,name:'ficticio.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:hash,classification:'documento',status:result.outcome==='validated'?'quarentena':'aguardando_upload',scanner_status:'not_configured',validation_reason:result.outcome==='missing'?'object_missing':null,intent_id:result.outcome==='validated'?null:id,created_at:'2026-10-21T00:00:00Z',updated_at:'2026-10-21T00:00:00Z',can_validate:result.outcome!=='validated',can_download:false,can_copy:false},removed:result.removed_ids?.length??0,pending:result.outcome==='removed'&&!result.removed_ids?.length?1:0}));return;
  }
  res.statusCode=500;res.end('{}');
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const handler=createPrivateAttachmentsHandler({url:`http://127.0.0.1:${(provider.address() as {port:number}).port}`,anonKey:'sb_publishable_fixture',serviceRoleKey:'private-server-fixture'});
 const send=(body:unknown={office_id:office,action,args:action==='cleanup'?{plan_id:id}:{intent_id:id}},auth=true)=>handler(new Request('https://example.test/functions/v1/private-attachments',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer caller-fixture'}:{})},body:JSON.stringify(body)}));
 try{
  await t.test('anônimo/payloadforjado e lease de outro escritório não usam credencial privilegiada',async()=>{
   calls.length=0;assert.equal((await send(undefined,false)).status,401);assert.equal(calls.length,0);
   assert.equal((await send({office_id:office,action:'validate',args:{intent_id:id,clean:true}})).status,422);assert.equal(calls.length,0);
   for(const [value,status] of [['denied',403],['bad-path',503]] as const){mode=value;calls.length=0;assert.equal((await send()).status,status);assert.ok(!calls.some(c=>c.authorization==='Bearer private-server-fixture'));}
  });
  await t.test('bytes válidos finalizam quarentena; segredo só Storage/finalização e nunca na resposta',async()=>{
   mode='ok';calls.length=0;const r=await send();assert.equal(r.status,200);const text=await r.text();assert.equal(JSON.parse(text).data.file.status,'quarentena');assert.ok(!text.includes('private-server-fixture'));assert.ok(!text.includes('source_path'));
   assert.equal(calls.find(c=>c.url.endsWith('files_process_claim'))?.authorization,'Bearer caller-fixture');
   assert.deepEqual(calls.find(c=>c.url.endsWith('files_process_complete'))?.body.p_result,{outcome:'validated',size_bytes:bytes.length,mime_type:'application/pdf',sha256:hash});
   assert.ok(calls.filter(c=>c.authorization==='Bearer private-server-fixture').every(c=>c.url.startsWith('/storage/')||c.url.endsWith('files_process_complete')));
  });
  await t.test('objeto ausente não fica pronto; revogação/falha de commit não anunciam sucesso',async()=>{
   mode='missing';calls.length=0;const r=await send();assert.equal(r.status,200);assert.equal((await r.json()).data.file.status,'aguardando_upload');assert.deepEqual(calls.at(-1)?.body.p_result,{outcome:'missing',reason:'object_missing'});
   for(const [value,status] of [['revoked',403],['db-failed',503]] as const){mode=value;const response=await send();assert.equal(response.status,status);assert.ok(!(await response.text()).includes('PRIVATE'));}
  });
  await t.test('limpeza só confirma IDs cuja remoção ocorreu; falha mantém pendência',async()=>{
   action='cleanup';for(const [value,removed,pending] of [['ok',1,0],['delete-failed',0,1]] as const){mode=value;calls.length=0;const r=await send();assert.equal(r.status,200);const result=await r.json();assert.equal(result.data.removed,removed);assert.equal(result.data.pending,pending);assert.deepEqual(calls.at(-1)?.body.p_result,{outcome:'removed',removed_ids:removed?[id]:[]});}
  });
  await t.test('resposta perdida retoma conclusão persistida sem repetir remoção nem vazar extras',async()=>{
   mode='completed';calls.length=0;const r=await send();assert.equal(r.status,200);assert.deepEqual(await r.json(),{data:{file:null,removed:1,pending:0}});assert.equal(calls.length,2);
  });
 }finally{provider.closeAllConnections();provider.close();}
});
