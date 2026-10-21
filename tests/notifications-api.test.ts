import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
const id='11111111-1111-4111-8111-111111111111',time='2026-10-21T12:00:00Z';
test('avisos por conta: API autentica, fecha contrato e remove conteúdo interno',async()=>{
 const calls:string[]=[];let malformed=false;
 const provider=createServer(async(req,res)=>{calls.push(req.url??'');res.setHeader('Content-Type','application/json');if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,aud:'authenticated'}));return;}if(req.url?.endsWith('notifications_summary')){res.end('{"unread":2,"internal_note":"PRIVATE"}');return;}if(req.url?.endsWith('notifications_read')){res.end('{"ok":true}');return;}res.end(JSON.stringify({items:[{id,kind:'assignee_changed',attendant_name:malformed?null:'Ana Fictícia',created_at:time,read_at:null,can_open:true,request_id:id,protocol:'JN-2026-000001',internal_note:'PRIVATE',role_code:'owner',actor_id:id}],page:1,page_size:3,total:1,unread:1}));});
 await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));const old=[process.env.VITE_SUPABASE_URL,process.env.VITE_SUPABASE_PUBLISHABLE_KEY];process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_fixture';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/notifications`;
 const send=(path:string,body:unknown,auth=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer fictitious'}:{})},body:JSON.stringify(body)});
 const body={office_id:id,query:'',read:'all',kind:'all',page:1,size:3};
 try{
  assert.equal((await send('/search',body,false)).status,401);assert.equal(calls.length,0);
  const result=await send('/search',body);assert.equal(result.status,200);assert.match(result.headers.get('cache-control')??'',/private.*no-store/);assert.deepEqual(calls,['/auth/v1/user','/rest/v1/rpc/notifications_page']);const value=await result.json();assert.equal(value.data.items[0].attendant_name,'Ana Fictícia');assert.doesNotMatch(JSON.stringify(value),/PRIVATE|role_code|actor_id/);
  assert.deepEqual(await (await send('/summary',{office_id:id})).json(),{data:{unread:2}});
  for(const bad of [{read:'yes'},{kind:'all,private'},{page:0},{size:100},{recipient_id:id},{query:'x\nsecret'}])assert.equal((await send('/search',{...body,...bad})).status,422);
  assert.equal((await send('/read',{office_id:id,id})).status,200);malformed=true;assert.equal((await send('/search',body)).status,503);
 }finally{for(const [i,k]of ['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY'].entries())if(old[i]===undefined)delete process.env[k];else process.env[k]=old[i];server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
