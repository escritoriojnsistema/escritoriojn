import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';
import {app} from '../server/app.js';
const id='00000000-0000-4000-8000-000000000001',office='00000000-0000-4000-8000-000000000002';
const state={publication_id:id,revision:1,last_event_id:null,can_request:true,can_decide:true,ready:false,blockers:['payment'],approved:true,signed:true,financial:{charge_id:id,due_cents:10000,allocated_cents:6000,balance_cents:4000,fingerprint:'a'.repeat(64)},exception:null,history:[],history_total:0,page:1,page_size:5};
test('25: API protege e projeta liberação, saldo e comando sem aceitar autoridade do navegador',async()=>{
 let mode='ok';const calls:{path:string;body:Record<string,unknown>}[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};calls.push({path:req.url??'',body});res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}if(mode==='denied'){res.statusCode=403;res.end('{"code":"PT403"}');return;}
 res.end(JSON.stringify({...state,...mode==='malformed'?{can_request:'yes'}:{},object_path:'private',service_role_key:'secret'}));});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const old=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address()as{port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address()as{port:number}).port}/api/document-workflow`;
 const send=(path:string,b:unknown,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(b)});
 try{
 const b={office_id:office,publication_id:id,page:1};assert.equal((await send('/release-state',b,false)).status,401);
 const r=await send('/release-state',b);assert.equal(r.status,200);assert.deepEqual((await r.json()).data,state);assert.match(r.headers.get('cache-control')??'',/no-store/);
 assert.equal((await send('/release-state',{...b,page:0})).status,422);assert.equal((await send('/release-state',{...b,object_path:'fake'})).status,422);
 const command={kind:'request',expected_revision:1,expected_event_id:null,reason:'Saldo parcial autorizado para análise',expires_at:'2026-11-20T12:00:00Z'};
 const c=await send('/release-command',{office_id:office,publication_id:id,command,idempotency_key:id});assert.equal(c.status,200);assert.equal(calls.at(-1)?.path,'/rest/v1/rpc/document_release_command');assert.deepEqual(calls.at(-1)?.body.p_command,command);
 assert.equal((await send('/release-command',{office_id:office,publication_id:id,command:{...command,paid:true},idempotency_key:id})).status,422);
 mode='malformed';assert.equal((await send('/release-state',b)).status,503);mode='denied';assert.equal((await send('/release-command',{office_id:office,publication_id:id,command,idempotency_key:id})).status,403);
 }finally{server.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>provider.close(()=>r()))]);for(const[i,k]of['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];}
});
