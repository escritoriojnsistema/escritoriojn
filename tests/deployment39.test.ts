import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';

// Real HTTP transport to a fake local provider: no hosted account or side effect.
test('preview recusa todas as entradas Supabase sem tráfego; produção/local mantêm contrato',async()=>{
 const calls:string[]=[];
 const user='00000000-0000-4000-a000-000000000001',office='00000000-0000-4000-b000-000000000001';
 const provider=createServer((req,res)=>{
  calls.push(req.url!);res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user')res.end(JSON.stringify({id:user,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{},created_at:'2026-01-01T00:00:00Z'}));
  else if(req.url==='/rest/v1/rpc/my_access_context')res.end(JSON.stringify([{user_id:user,office_id:office,role_code:'owner',permissions:['foundation.access'],office_name:'Fictício',display_name:'Fictício'}]));
  else res.end(JSON.stringify({configured:false,revision:0}));
 });
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));
 const names=['VITE_SUPABASE_URL','VITE_SUPABASE_PUBLISHABLE_KEY','VERCEL_ENV'] as const;
 const previous=Object.fromEntries(names.map(name=>[name,process.env[name]]));
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;
 process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_deployment39_fixture';
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(resolve=>server.once('listening',resolve));
 const origin=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const entries:Array<{path:string;init:RequestInit}>=[
  {path:'/api/auth/context',init:{headers:{Authorization:'Bearer synthetic39'}}},
  {path:'/api/privacy/state',init:{method:'POST',headers:{Authorization:'Bearer synthetic39','Content-Type':'application/json'},body:JSON.stringify({office_id:office})}},
  {path:'/api/privacy/public',init:{}},
 ];
 try{
  process.env.VERCEL_ENV='preview';
  for(const entry of entries){
   const response=await fetch(origin+entry.path,entry.init);
   assert.equal(response.status,503,entry.path+' preview precisa negar antes do provider');
   assert.match(response.headers.get('cache-control')??'',/no-store/);
   const body=await response.json();assert.ok(body.error);assert.equal(body.data,undefined);
  }
  assert.deepEqual(calls,[],'nem identidade, RPC pública ou RPC privada pode chegar ao provider');
  for(const environment of ['production',undefined]){
   if(environment)process.env.VERCEL_ENV=environment;else delete process.env.VERCEL_ENV;
   for(const entry of entries)assert.equal((await fetch(origin+entry.path,entry.init)).status,200,entry.path+' mantém contrato '+environment);
  }
  assert.equal(calls.filter(path=>path==='/auth/v1/user').length,4);
  assert.equal(calls.filter(path=>path==='/rest/v1/rpc/privacy_controller_public').length,2);
  assert.equal((await fetch(origin+'/api/auth/context')).status,401);
 }finally{
  for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}
  server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();
 }
});
