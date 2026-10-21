import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
const id='00000000-0000-4000-a000-000000000121',office='00000000-0000-4000-e000-000000000121';
test('checklists12: API privada, contrato fechado e prévia genérica sem conteúdo sensível',async()=>{
 const calls:{url:string;body:Record<string,unknown>}[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};calls.push({url:req.url??'',body});res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated'}));return;}
  res.end(JSON.stringify({items:[{id,kind:'handoff',created_at:'2026-10-21T12:00:00Z',read_at:null,request_id:id,protocol:'JN-2026-000001',can_open:true,title:'CPF HEALTH PRIVATE',reason:'LEGAL PRIVATE',file_name:'PRIVATE'}],page:1,page_size:3,total:1,unread:1}));
 });
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 const previous=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/checklists`;
 const body={office_id:office,page:1,size:3,unread_only:false};const send=(path:string,data:unknown,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer checklists-fixture'}:{})},body:JSON.stringify(data)});
 try{
  assert.equal((await send('/notifications',body,false)).status,401);
  const r=await send('/notifications',body);assert.equal(r.status,200);assert.match(r.headers.get('cache-control')??'',/private.*no-store/);const value=await r.json();assert.ok(!JSON.stringify(value).includes('PRIVATE'));assert.deepEqual(calls.map(c=>c.url),['/auth/v1/user','/rest/v1/rpc/checklists_notifications']);assert.equal(value.data.unread,1);
  for(const bad of [{size:100},{page:0},{unread_only:'yes'},{office_id:'bad'},{actor_id:id}])assert.equal((await send('/notifications',{...body,...bad})).status,422);
  for(const input of [{status:'dispensado',reason:'',file_id:null},{status:'validado',reason:'Conferência fictícia',file_id:null},{status:'quitado',reason:'Fictício',file_id:null}])assert.equal((await send('/entries/update',{office_id:office,entry_id:id,expected_version:1,...input})).status,422);
 }finally{for(const [i,k]of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(previous[i]===undefined)delete process.env[k];else process.env[k]=previous[i];server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
