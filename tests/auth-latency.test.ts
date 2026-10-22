import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';

// Gate the independent provider reads instead of timing a CI machine. Neither
// successful read may expose a response before the other verifies the identity.
test('context overlaps read-only verification and never returns unverified access', async () => {
 const uid='00000000-0000-4000-a000-000000000001';
 const row={user_id:uid,office_id:'00000000-0000-4000-b000-000000000001',role_code:'owner',permissions:['foundation.access'],office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'};
 let releaseIdentity=()=>{},releaseContext=()=>{},identityStarted=()=>{},contextStarted=()=>{};
 let identityStatus=200,contextUid=uid;
 const provider=createServer(async(req,res)=>{
  res.setHeader('Content-Type','application/json');
  assert.equal(req.headers.authorization,'Bearer latency-test-token');
  if(req.url==='/auth/v1/user'){
   identityStarted();await new Promise<void>(resolve=>{releaseIdentity=resolve;});
   res.statusCode=identityStatus;res.end(JSON.stringify(identityStatus===200?{id:uid,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}:{code:'bad_jwt',msg:'invalid'}));
  }else if(req.url==='/rest/v1/rpc/my_access_context'){
   contextStarted();await new Promise<void>(resolve=>{releaseContext=resolve;});res.end(JSON.stringify([{...row,user_id:contextUid}]));
  }else{res.statusCode=404;res.end('{}');}
 });
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
 process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_fixture';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const api=`http://127.0.0.1:${(server.address() as {port:number}).port}/api/auth/context?area=team`;
 try{
  for(const scenario of ['valid','identity-denied','identity-unavailable','wrong-identity']){
   identityStatus=scenario==='identity-denied'?401:scenario==='identity-unavailable'?503:200;
   contextUid=scenario==='wrong-identity'?'00000000-0000-4000-a000-000000000002':uid;
   const identity=new Promise<void>(resolve=>{identityStarted=resolve;}),context=new Promise<void>(resolve=>{contextStarted=resolve;});
   let completed=false;
   const response=fetch(api,{headers:{Authorization:'Bearer latency-test-token'}}).then(value=>{completed=true;return value;});
   await identity;
   const overlap=await Promise.race([context.then(()=>true),new Promise<boolean>(resolve=>setTimeout(()=>resolve(false),250))]);
   // Always free the gates, even when running this regression against old code.
   if(!overlap){releaseIdentity();await context;releaseContext();await response;assert.fail('RPC should start while provider identity is pending');}
   releaseContext();await new Promise<void>(resolve=>setTimeout(resolve,20));
   assert.equal(completed,false,'a context alone cannot release access');
   releaseIdentity();const result=await response;
   assert.equal(result.status,scenario==='valid'?200:scenario==='identity-denied'?401:503,scenario);
   const body=await result.json();
   if(scenario==='valid')assert.equal(body.data.user.id,uid);else assert.equal('data' in body,false);
   assert.match(result.headers.get('cache-control')??'',/no-store/);
  }
 }finally{
  releaseIdentity();releaseContext();delete process.env.VITE_SUPABASE_URL;delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
 }
});
