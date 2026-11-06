import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountClosureHandler} from '../supabase/functions/account-closure/handler.js';
import {createRetentionHandler} from '../supabase/functions/retention/handler.js';
const config={url:'https://maintenance.invalid',anonKey:'sb_publishable_api_key',serviceRoleKey:'edge-only',cronSecret:''};
for(const worker of ['account-closure','retention'] as const){
 test(`Vault-backed ${worker} schedule uses public gateway JWT and verifies secret through restricted RPC`,async()=>{
  const calls:string[]=[],secret='a'.repeat(64);
  const transport:typeof fetch=async(input,init)=>{
   const url=String(input);calls.push(url);
   assert.equal(new Headers(init?.headers).get('Authorization'),'Bearer edge-only');
   if(url.endsWith('/maintenance_authorize')){
    assert.deepEqual(JSON.parse(String(init?.body)),{p_worker:worker,p_secret:secret});
    return Response.json({authorized:true});
   }
   return Response.json(worker==='retention'?{items:[]}:{ids:[]});
  };
  const handler=worker==='retention'?createRetentionHandler(config,transport):createAccountClosureHandler(config,transport);
  const result=await handler(new Request(config.url,{method:'POST',headers:{Authorization:'Bearer public-jwt',[worker==='retention'?'X-Retention-Secret':'X-Account-Closure-Secret']:secret}}));
  assert.equal(result.status,200);assert.deepEqual(await result.json(),{data:{processed:0,pending:0}});
  assert.ok(calls[0].endsWith('/maintenance_authorize'));assert.equal(calls.length,2);
 });
 test(`invalid ${worker} scheduler secret never reads job queue`,async()=>{
  let calls=0;
  const transport:typeof fetch=async(input)=>{calls++;assert.ok(String(input).endsWith('/maintenance_authorize'));return Response.json({authorized:false});};
  const handler=worker==='retention'?createRetentionHandler(config,transport):createAccountClosureHandler(config,transport);
  const result=await handler(new Request(config.url,{method:'POST',headers:{Authorization:'Bearer public-jwt',[worker==='retention'?'X-Retention-Secret':'X-Account-Closure-Secret']:'b'.repeat(64)}}));
  assert.equal(result.status,401);assert.equal(calls,1);
 });
}
