import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createServer} from 'node:http';
import {authRouter} from '../server/modules/auth/router.js';
import {accessSettingsRouter} from '../server/modules/access-settings/router.js';

test('Acessos e atividade validam identidade, DTO e entradas sem aceitar tempo/UID do navegador',async()=>{
 const uid='a1000000-0000-4000-a000-000000000001',sid='a1000000-0000-4000-c000-000000000001',office='a1000000-0000-4000-b000-000000000001';
 let mode='ok';const calls:{path:string;body:unknown}[]=[];
 const provider=createServer(async(req,res)=>{res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id:uid,aud:'authenticated',role:'authenticated',app_metadata:{},user_metadata:{}}));return;}
  let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};calls.push({path:req.url!,body});
  if(mode==='expired'){res.statusCode=401;res.end(JSON.stringify({code:'PT401',message:'AUTH_REQUIRED'}));return;}
  if(req.url==='/rest/v1/rpc/session_activity'){res.end(JSON.stringify({user_id:mode==='wrong-uid'?sid:uid,session_id:sid,server_time:'2026-11-02T12:00:00Z',expires_at:'2026-11-02T12:30:00Z',idle_minutes:30,secret:'omit'}));return;}
  const p={idle_minutes:30,revision:1,updated_at:'2026-11-02T12:00:00Z'};
  res.end(JSON.stringify({audience:'team',can_manage:true,policies:{team:{...p,audience:'team'},client:{...p,audience:'client'}},secret:'omit'}));
 });await new Promise<void>(r=>provider.listen(0,'127.0.0.1',r));
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${(provider.address() as {port:number}).port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_test_fixture';
 const server=express().use('/api/auth',authRouter).use('/api/access-settings',accessSettingsRouter).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;const headers={Authorization:'Bearer valid-token','Content-Type':'application/json'};
 try{
  assert.equal((await fetch(`${base}/api/auth/activity`)).status,401);
  let r=await fetch(`${base}/api/auth/activity`,{headers});assert.equal(r.status,200);assert.equal((await r.json()).data.secret,undefined);assert.deepEqual(calls.at(-1)?.body,{p_human:false});
  r=await fetch(`${base}/api/auth/activity`,{method:'POST',headers,body:'{}'});assert.equal(r.status,200);assert.deepEqual(calls.at(-1)?.body,{p_human:true});
  for(const body of [{now:Date.now()},{user_id:uid},{session_id:sid},{human:false}])assert.equal((await fetch(`${base}/api/auth/activity`,{method:'POST',headers,body:JSON.stringify(body)})).status,422);
  assert.equal((await fetch(`${base}/api/auth/activity?human=true`,{headers})).status,422);
  mode='wrong-uid';assert.equal((await fetch(`${base}/api/auth/activity`,{headers})).status,503);mode='ok';
  r=await fetch(`${base}/api/access-settings/state`,{method:'POST',headers,body:JSON.stringify({office_id:office})});assert.equal(r.status,200);assert.equal((await r.json()).data.secret,undefined);
  const policy={office_id:office,audience:'team',idle_minutes:60,expected_revision:1,idempotency_key:'a1000000-0000-4000-d000-000000000001'};
  assert.equal((await fetch(`${base}/api/access-settings/policy`,{method:'POST',headers,body:JSON.stringify(policy)})).status,200);
  assert.equal((await fetch(`${base}/api/access-settings/policy`,{method:'POST',headers,body:JSON.stringify({...policy,idle_minutes:4})})).status,422);
  mode='expired';assert.equal((await fetch(`${base}/api/auth/activity`,{headers})).status,401);assert.equal((await fetch(`${base}/api/access-settings/state`,{method:'POST',headers,body:JSON.stringify({office_id:office})})).status,401);
 }finally{delete process.env.VITE_SUPABASE_URL;delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;server.closeAllConnections();server.close();provider.closeAllConnections();provider.close();}
});
