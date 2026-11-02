import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {createDocumentArtifactsHandler} from '../supabase/functions/document-artifacts/handler.ts';
const office='00000000-0000-4000-8000-000000000001',id='00000000-0000-4000-8000-000000000002';
const bytes=Buffer.from('%PDF-1.4\nTrusted artifact fixture\n%%EOF'),digest=createHash('sha256').update(bytes).digest('hex');
test('artefatos: revalida antes de entregar, nega estorno concorrente e não fornece URL',async t=>{
 let mode='ok',authorizations=0;const calls:string[]=[];
 const provider=createServer(async(req,res)=>{calls.push(req.url??'');let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):{};res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}
 if(req.url==='/rest/v1/rpc/document_artifact_authorize'){authorizations++;if(mode==='revoked'&&b.p_receipt||mode==='denied'){res.statusCode=403;res.end('{"code":"PT403"}');return;}res.end(JSON.stringify({publication_id:id,bucket:'jn-document-artifacts',object_path:`${office}/${id}/${id}`,sha256:digest,size_bytes:bytes.length,filename:'DOC-TESTE.pdf'}));return;}
 if(req.url?.startsWith('/storage/v1/object/authenticated/')){res.setHeader('Content-Type','application/pdf');res.end(mode==='corrupt'?Buffer.from('corrupt'):bytes);return;}
 res.statusCode=503;res.end('{}');});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const handler=createDocumentArtifactsHandler({url:`http://127.0.0.1:${(provider.address() as {port:number}).port}`,anonKey:'sb_publishable_fixture',serviceRoleKey:'server-fixture'});
 const send=(body:unknown={office_id:office,publication_id:id,action:'download'},auth=true)=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer caller-fixture'}:{})},body:JSON.stringify(body)}));
 try{
 await t.test('anônimo e payload forjado negados antes do worker privilegiado',async()=>{calls.length=0;assert.equal((await send(undefined,false)).status,401);assert.equal((await send({office_id:office,publication_id:id,action:'download',object_path:'forjado'})).status,422);assert.deepEqual(calls,[]);});
 await t.test('bytes íntegros e segunda autorização final obrigatória',async()=>{mode='ok';authorizations=0;const r=await send();assert.equal(r.status,200);assert.equal(r.headers.get('Content-Type'),'application/pdf');assert.equal(authorizations,2);assert.match(r.headers.get('cache-control')??'',/no-store/);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.equal(r.headers.get('Location'),null);});
 await t.test('revogação durante leitura impede entrega dos bytes',async()=>{mode='revoked';authorizations=0;const r=await send();assert.equal(r.status,403);assert.equal(authorizations,2);assert.doesNotMatch(await r.text(),/PDF|Trusted/);});
 await t.test('hash divergente impede entrega e segunda autorização',async()=>{mode='corrupt';authorizations=0;const r=await send();assert.equal(r.status,503);assert.equal(authorizations,1);});
 await t.test('gate negado impede sequer consultar Storage',async()=>{mode='denied';calls.length=0;assert.equal((await send()).status,403);assert.equal(calls.some(x=>x.includes('/storage/')),false);});
 }finally{provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));}
});

test('22: worker gera, preserva e entrega a prévia exata; corrupção e revogação bloqueiam',async()=>{
 let stored=Buffer.alloc(0),completed=false,sha='',mode='ok',checks=0,uploads=0;
 const provider=createServer(async(req,res)=>{
  const chunks:Buffer[]=[];for await(const c of req)chunks.push(Buffer.from(c));const raw=Buffer.concat(chunks);res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}
  const b=req.url?.startsWith('/rest/')?JSON.parse(raw.toString()):{};
  if(req.url?.endsWith('/document_version_begin')){res.end(JSON.stringify({job_id:id,lease_token:id,version_id:id,office_id:office,bucket:'jn-document-artifacts',object_path:`${office}/${id}/${id}`,completed,content:'Declaração de João e Sônia.',content_sha256:createHash('sha256').update('Declaração de João e Sônia.').digest('hex'),title:'Declaração',protocol:'DOC-TESTE',created_at:'2026-11-02T00:00:00Z',revision:1}));return;}
  if(req.url?.startsWith('/storage/v1/object/jn-document-artifacts/')){uploads++;stored=raw;res.end('{"Key":"fixture"}');return;}
  if(req.url?.endsWith('/document_version_complete')){completed=true;sha=b.p_sha256;assert.equal(sha,createHash('sha256').update(stored).digest('hex'));res.end('{"ready":true}');return;}
  if(req.url?.endsWith('/document_version_authorize')){checks++;if(mode==='revoked'&&b.p_receipt){res.statusCode=403;res.end('{"code":"PT403"}');return;}res.end(JSON.stringify({version_id:id,revision:1,bucket:'jn-document-artifacts',object_path:`${office}/${id}/${id}`,sha256:sha,size_bytes:stored.length,filename:'DOC-TESTE-rascunho-v1.pdf'}));return;}
  if(req.url?.startsWith('/storage/v1/object/authenticated/')){res.setHeader('Content-Type','application/pdf');res.end(mode==='corrupt'?Buffer.from('corrupt'):stored);return;}
  res.statusCode=503;res.end('{}');
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const handler=createDocumentArtifactsHandler({url:`http://127.0.0.1:${(provider.address() as {port:number}).port}`,anonKey:'sb_publishable_fixture',serviceRoleKey:'server-fixture'});
 const send=()=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture'},body:JSON.stringify({office_id:office,publication_id:id,action:'preview'})}));
 try{const first=await send();assert.equal(first.status,200);assert.match(first.headers.get('Content-Disposition')??'',/^inline/);assert.equal(first.headers.get('X-Document-SHA256'),sha);assert.deepEqual(Buffer.from(await first.arrayBuffer()),stored);assert.equal(checks,2);assert.equal(uploads,1);checks=0;const next=await send();assert.equal(next.status,200);assert.deepEqual(Buffer.from(await next.arrayBuffer()),stored);assert.equal(uploads,1);mode='corrupt';checks=0;assert.equal((await send()).status,503);assert.equal(checks,1);mode='revoked';checks=0;const denied=await send();assert.equal(denied.status,403);assert.equal(checks,2);assert.doesNotMatch(await denied.text(),/%PDF/);}finally{provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));}
});
