import test from 'node:test';import assert from 'node:assert/strict';import {createServer} from 'node:http';import {app} from '../server/app.js';
const id='00000000-0000-4000-8000-000000000001';
test('comercial: API autentica, fecha payload e não expõe extras da RPC',async()=>{
 let calls=0;const provider=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id}));return;}calls++;res.end(JSON.stringify({folders:[{id,name:'Rural',revision:1,category:'Contratos',secret:'no'}],locations:[],can_manage:true,secret:'no'}));});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const before=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/document-commercial`;
 const send=(p:string,b:unknown,auth=true)=>fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fixture'}:{})},body:JSON.stringify(b)});
 try{assert.equal((await send('/folders',{office_id:id},false)).status,401);assert.equal(calls,0);let res=await send('/folders',{office_id:id});assert.equal(res.status,200);assert.deepEqual((await res.json()).data,{folders:[{id,name:'Rural',revision:1,category:'Contratos'}],locations:[],can_manage:true});assert.match(res.headers.get('cache-control')??'',/no-store/);
 assert.equal((await send('/folder-command',{office_id:id,command:{kind:'create',name:'Pasta',can_manage:true},idempotency_key:id})).status,422);assert.equal(calls,1);
 assert.equal((await send('/folder-command',{office_id:id,command:{kind:'create',name:'Pasta'},idempotency_key:id})).status,200);
 }finally{server.closeAllConnections();provider.closeAllConnections();await Promise.all([new Promise<void>(r=>server.close(()=>r())),new Promise<void>(r=>provider.close(()=>r()))]);for(const [i,key]of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(before[i]===undefined)delete process.env[key];else process.env[key]=before[i];}
});

// The retained revision belongs to the association, even while no service is selected.
test('comercial: estado desvinculado conserva revisão sem expor vínculo histórico', async()=>{
 const {projectCommercialState}=await import('../shared/modelCommercialValidation.js');
 const source={metadata:{template_id:id,display_name:'Modelo',archived_at:null,revision:0},offer:null,offer_revision:7,can_manage:true,can_manage_metadata:true,old_service_id:id};
 assert.deepEqual(projectCommercialState(source),{metadata:source.metadata,offer:null,offer_revision:7,can_manage:true,can_manage_metadata:true});
 for(const offer_revision of [-1,1.5,'7',null])assert.throws(()=>projectCommercialState({...source,offer_revision}));
});
