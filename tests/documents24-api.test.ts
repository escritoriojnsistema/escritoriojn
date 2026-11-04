import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {createHash} from 'node:crypto';
import {app} from '../server/app.js';
const id='00000000-0000-4000-8000-000000000001',office='00000000-0000-4000-8000-000000000002';
const bytes=Buffer.from('%PDF-1.7\nOriginal assinado externo\n%%EOF'),sha=createHash('sha256').update(bytes).digest('hex');
const state={publication_id:id,document_id:id,request_id:id,revision:1,mode:'external',exit_policy:'before_settlement',expected_signers:['João'],verified_signers:[],status:'pending',last_event_id:null,can_manage:true,can_validate:true,can_exit:true,exit_blockers:[],file:null,evidence:null,signed_on:null,custody:null,notary_reference:null,history:[],history_total:0,page:1,page_size:5};
test('24: API privada projeta estado, valida comandos e confere hash dos bytes de saída/final',async()=>{
 let mode='ok';const calls:{path:string;body:Record<string,unknown>}[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};calls.push({path:req.url??'',body});res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}if(mode==='denied'){res.statusCode=403;res.end('{"code":"PT403"}');return;}
 if(req.url==='/functions/v1/document-artifacts'){res.setHeader('Content-Type','application/pdf');res.setHeader('X-Document-Publication',id);res.setHeader('X-Document-SHA256',mode==='corrupt'?'a'.repeat(64):sha);res.end(bytes);return;}
 res.end(JSON.stringify({...state,...mode==='malformed'?{can_manage:'yes'}:{},object_path:'private',service_role_key:'secret'}));});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const old=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address()as{port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address()as{port:number}).port}/api/document-workflow`;
 const send=(path:string,b:unknown,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(b)});
 try{
 const b={office_id:office,publication_id:id,page:1};assert.equal((await send('/signature-state',b,false)).status,401);
 const r=await send('/signature-state',b);assert.equal(r.status,200);assert.deepEqual((await r.json()).data,state);assert.match(r.headers.get('cache-control')??'',/no-store/);
 assert.equal((await send('/signature-state',{...b,page:0})).status,422);assert.equal((await send('/signature-state',{...b,object_path:'fake'})).status,422);
 const command={kind:'configure',mode:'external',exit_policy:'before_settlement',expected_signers:['João'],expected_revision:1,expected_event_id:null,reason:'Saída autorizada para formalização'};
 const c=await send('/signature-command',{office_id:office,publication_id:id,command,idempotency_key:id});assert.equal(c.status,200);assert.equal(calls.at(-1)?.path,'/rest/v1/rpc/document_signature_command');assert.deepEqual(calls.at(-1)?.body.p_command,command);
 assert.equal((await send('/signature-command',{office_id:office,publication_id:id,command:{...command,paid:true},idempotency_key:id})).status,422);
 for(const action of ['signing','download']){const p=await send('/artifact',{office_id:office,publication_id:id,action});assert.equal(p.status,200);assert.equal(p.headers.get('X-Document-SHA256'),sha);assert.deepEqual(Buffer.from(await p.arrayBuffer()),bytes);}
 mode='corrupt';assert.equal((await send('/artifact',{office_id:office,publication_id:id,action:'signing'})).status,503);
 mode='malformed';assert.equal((await send('/signature-state',b)).status,503);mode='denied';assert.equal((await send('/signature-command',{office_id:office,publication_id:id,command,idempotency_key:id})).status,403);
 }finally{server.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>provider.close(()=>r()))]);for(const[i,k]of['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}
});
