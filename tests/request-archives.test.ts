import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import express from 'express';
import {requestArchivesRouter} from '../server/modules/request-archives/router.js';
import {archiveItem,archivePage,archiveReport} from '../server/modules/request-archives/dto.js';
import {createRequestArchivePdfV1} from '../server/modules/request-archives/reportV1.js';
import type {RequestArchiveReport} from '../shared/requestArchives.js';

const office='00000000-0000-4000-e000-000000007101',id='00000000-0000-4000-d000-000000007101',key='00000000-0000-4000-f000-000000007101';
const item={id,protocol:'JN-2026-007101',title:'Solicitação fictícia',status:'concluido' as const,version:2,closed_at:'2026-11-01T12:00:00Z',archived:false,archived_at:null};
const filters={scope:'mine' as const,view:'recent' as const,status:'' as const,from:'',until:''};
const report:RequestArchiveReport={id:key,office_id:office,protocol:`JN-SOL-${key}`,renderer_version:1,created_at:'2026-11-02T12:00:00Z',office_name:'Escritório fictício',actor_name:'Pessoa fictícia',cutoff:'2026-08-04T12:00:00Z',count:1,filters:{...filters,from:null,until:null},items:[item]};

test('arquivos de solicitações: DTO fechado remove conteúdo privado e rejeita relatório parcial',()=>{
 assert.deepEqual(archiveItem({...item,reason:'PRIVATE',message:'PRIVATE',customer_name:'PRIVATE',items:['PRIVATE']}),item);
 assert.deepEqual(archivePage({items:[{...item,message:'PRIVATE'}],total:1,page:1,page_size:3,can_read_all:false,secret:'PRIVATE'}),{items:[item],total:1,page:1,page_size:3,can_read_all:false});
 assert.deepEqual(archiveReport({...report,message:'PRIVATE',items:[{...item,message:'PRIVATE'}]}),report);
 for(const change of [{count:2},{renderer_version:2},{protocol:'bad'},{items:[{...item,archived:true}]},{count:2,items:[item,item]},{items:[{...item,status:'aberto'}]}])assert.throws(()=>archiveReport({...report,...change}));
});

test('arquivos de solicitações: renderer próprio produz PDF determinístico do snapshot',async()=>{
 const a=await createRequestArchivePdfV1(report),b=await createRequestArchivePdfV1(report);
 assert.equal(a.subarray(0,5).toString(),'%PDF-');assert.deepEqual(a,b);assert.ok(a.length<3_000_000);
 assert.match(a.toString('latin1'),/Relat/);assert.ok(!a.includes(Buffer.from('Relatório de auditoria')));
 await assert.rejects(createRequestArchivePdfV1({...report,count:2}),/Incomplete/);
});

test('arquivos de solicitações: API valida e protege política, arquivo e relatório completo',async t=>{
 let mode='ok';const calls:{url:string;body:Record<string,unknown>;authorization?:string}[]=[];
 const provider=createServer(async(req,res)=>{
  let raw='';for await(const chunk of req)raw+=chunk;const body:Record<string,unknown>=raw?JSON.parse(raw):{};calls.push({url:req.url??'',body,authorization:req.headers.authorization});res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated'}));return;}
  if(mode.startsWith('error')){const status=Number(mode.slice(5));res.statusCode=status;res.end(JSON.stringify({code:`PT${status}`,message:status===401?'AUTH_REQUIRED':status===403?'REQUEST_ARCHIVES_FORBIDDEN':status===409?'REQUEST_ARCHIVES_CONFLICT':status===422?'REQUEST_ARCHIVES_EXPORT_LIMIT':'SQL private password'}));return;}
  if(req.url?.endsWith('request_archives_report_get')&&mode==='revoked'){res.statusCode=403;res.end(JSON.stringify({code:'PT403',message:'REQUEST_ARCHIVES_FORBIDDEN'}));return;}
  if(req.url?.endsWith('request_archives_report_begin')||req.url?.endsWith('request_archives_report_get')){res.end(JSON.stringify(mode==='partial'?{...report,count:2}:mode==='changed'&&req.url.endsWith('_get')?{...report,actor_name:'Outra pessoa'}:report));return;}
  if(req.url?.endsWith('request_archives_page')){res.end(JSON.stringify({items:[{...item,message:'PRIVATE'}],total:1,page:1,page_size:3,can_read_all:false}));return;}
  if(req.url?.endsWith('request_archives_archive')){res.end(JSON.stringify({request_id:id,archived:true,reason:'PRIVATE'}));return;}
  res.end(JSON.stringify({days:90,version:1,cutoff:report.cutoff,secret:'PRIVATE'}));
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const old={url:process.env.VITE_SUPABASE_URL,key:process.env.VITE_SUPABASE_PUBLISHABLE_KEY};process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const app=express();app.use('/api/request-archives',requestArchivesRouter);const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/request-archives`,headers={Authorization:'Bearer requests-test-token','Content-Type':'application/json'};
 const send=(path:string,body:unknown)=>fetch(base+path,{method:'POST',headers,body:JSON.stringify(body)});
 try{
  await t.test('anônimo bloqueado e no-store; chamadas usam somente Bearer verificado',async()=>{
   assert.equal((await fetch(base+'/policy',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({office_id:office})})).status,401);
   calls.length=0;const response=await send('/policy',{office_id:office});assert.equal(response.status,200);assert.match(response.headers.get('cache-control')??'',/private.*no-store/);assert.deepEqual((await response.json()).data,{days:90,version:1,cutoff:report.cutoff});assert.deepEqual(calls.map(c=>c.url),['/auth/v1/user','/rest/v1/rpc/request_archives_policy_get']);assert.ok(calls.every(c=>c.authorization===headers.Authorization));
  });
  await t.test('pesquisa projeta metadados e data final inclui todo o dia UTC',async()=>{
   const response=await send('/search',{office_id:office,...filters,from:'2026-11-01',until:'2026-11-02',page:1,size:3});assert.equal(response.status,200);assert.deepEqual((await response.json()).data.items,[item]);assert.equal(calls.at(-1)?.body.p_from,'2026-11-01T00:00:00.000Z');assert.equal(calls.at(-1)?.body.p_until,'2026-11-03T00:00:00.000Z');
   for(const change of [{scope:'queue'},{view:'all'},{status:'aberto'},{page:0},{size:100},{from:'2026-02-30'},{from:'2026-11-03',until:'2026-11-02'},{query:'PRIVATE'}])assert.equal((await send('/search',{office_id:office,...filters,page:1,size:3,...change})).status,422);
  });
  await t.test('política e arquivo preservam chave fornecida e motivo validado',async()=>{
   const policy={office_id:office,days:60,expected_version:1,idempotency_key:key};assert.equal((await send('/policy/set',policy)).status,200);assert.equal(calls.at(-1)?.body.p_idempotency_key,key);
   assert.equal((await send('/policy/set',{...policy,days:45})).status,422);assert.equal((await send('/policy/set',{...policy,actor_id:id})).status,422);
   const input={office_id:office,expected_version:2,reason:'Arquivo fictício',idempotency_key:key};const response=await send(`/${id}/archive`,input);assert.equal(response.status,200);assert.deepEqual((await response.json()).data,{request_id:id,archived:true});assert.equal(calls.at(-1)?.body.p_reason,input.reason);assert.equal(calls.at(-1)?.body.p_idempotency_key,key);
   for(const change of [{reason:'  '},{reason:'a\nprivate'},{expected_version:0},{action:'restore'},{idempotency_key:'bad'}])assert.equal((await send(`/${id}/archive`,{...input,...change})).status,422);
  });
  await t.test('PDF usa snapshot, revalida antes de entregar e nunca entrega parcial',async()=>{
   calls.length=0;const response=await send('/report',{office_id:office,...filters,idempotency_key:key});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'application/pdf');assert.equal(response.headers.get('x-request-report-count'),'1');assert.match(response.headers.get('x-request-report-sha256')??'',/^[a-f0-9]{64}$/);assert.equal(Buffer.from(await response.arrayBuffer()).subarray(0,5).toString(),'%PDF-');assert.deepEqual(calls.map(c=>c.url),['/auth/v1/user','/rest/v1/rpc/request_archives_report_begin','/rest/v1/rpc/request_archives_report_get']);assert.equal(calls[1].body.p_idempotency_key,key);
   for(const [value,status] of [['partial',503],['changed',503],['revoked',403]] as const){mode=value;const r=await send('/report',{office_id:office,...filters,idempotency_key:key});assert.equal(r.status,status);assert.ok(!r.headers.get('content-type')?.includes('pdf'));}
  });
  await t.test('erros seguros não expõem SQL ou conteúdo privado',async()=>{
   for(const status of [401,403,409,422,500]){mode=`error${status}`;const r=await send('/policy',{office_id:office});assert.equal(r.status,status===500?503:status);assert.ok(!(await r.text()).includes('SQL private'));}
  });
 }finally{
  if(old.url===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=old.url;if(old.key===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=old.key;
  server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
 }
});
