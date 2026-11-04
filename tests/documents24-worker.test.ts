import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {createDocumentArtifactsHandler} from '../supabase/functions/document-artifacts/handler.ts';
const office='00000000-0000-4000-8000-000000000001',pub='00000000-0000-4000-8000-000000000002',file='00000000-0000-4000-8000-000000000003',intent='00000000-0000-4000-8000-000000000004';
const bytes=Buffer.from('%PDF-1.7\nOriginal externamente assinado / bytes preservados\n%%EOF'),sha=createHash('sha256').update(bytes).digest('hex');
test('24: worker distingue saída e original final; confere bytes e identidade após Storage',async t=>{
 let mode='ok',calls:string[]=[],authorizations=0;
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const b=raw?JSON.parse(raw):{};calls.push(req.url??'');res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id:file}));return;}
 if(req.url?.startsWith('/rest/v1/rpc/')){
 authorizations++;if(mode==='revoked'&&b.p_receipt||mode==='quarantine'){res.statusCode=403;res.end('{"code":"PT403"}');return;}
 const signing=req.url.endsWith('/document_signature_authorize');res.end(JSON.stringify({publication_id:pub,bucket:signing?'jn-document-artifacts':'request-attachments',object_path:signing?`${office}/${pub}/${intent}`:`${mode==='cross-office'?file:office}/${intent}/${file}`,sha256:sha,size_bytes:bytes.length,filename:'DOC-ASSINADO.pdf',...signing?{}:mode==='missing-file'?{}:{file_id:mode==='changed'&&b.p_receipt?pub:file}}));return;}
 if(req.url?.startsWith('/storage/v1/object/authenticated/')){res.setHeader('Content-Type','application/pdf');res.end(mode==='corrupt'?Buffer.from('alterado'):bytes);return;}
 res.statusCode=503;res.end('{}');});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const handler=createDocumentArtifactsHandler({url:`http://127.0.0.1:${(provider.address()as{port:number}).port}`,anonKey:'sb_publishable_fixture',serviceRoleKey:'edge-only-fixture'});
 const send=(action='download')=>handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer fixture'},body:JSON.stringify({office_id:office,publication_id:pub,action})}));
 try{
 await t.test('saída chama somente autorização de assinatura e entrega arquivo base sem regenerar',async()=>{mode='ok';calls=[];authorizations=0;const r=await send('signing');assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.equal(authorizations,2);assert.ok(calls.filter(p=>p.includes('/rpc/')).every(p=>p.endsWith('/document_signature_authorize')));assert.equal(r.headers.get('X-Document-Purpose'),'signing');assert.equal(r.headers.get('X-Document-SHA256'),sha);});
 await t.test('download final lê original privado de anexos, sem renderizar/regravar',async()=>{mode='ok';calls=[];authorizations=0;const r=await send();assert.equal(r.status,200);assert.deepEqual(Buffer.from(await r.arrayBuffer()),bytes);assert.ok(calls.some(p=>p.includes('/storage/v1/object/authenticated/request-attachments/')));assert.equal(authorizations,2);assert.equal(r.headers.get('X-Document-Publication'),pub);assert.equal(r.headers.get('X-Document-SHA256'),sha);});
 for(const [m,status,count]of[['corrupt',503,1],['revoked',403,2],['quarantine',403,1],['changed',409,2],['cross-office',503,1],['missing-file',503,1]]as const)await t.test(m,async()=>{mode=m;calls=[];authorizations=0;const r=await send();assert.equal(r.status,status);assert.equal(authorizations,count);assert.doesNotMatch(await r.text(),/%PDF/);if(m==='cross-office'||m==='quarantine'||m==='missing-file')assert.equal(calls.some(p=>p.includes('/storage/')),false);});
 }finally{provider.closeAllConnections();await new Promise<void>(r=>provider.close(()=>r()));}
});
