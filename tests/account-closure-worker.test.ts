import test from 'node:test';
import assert from 'node:assert/strict';
import {createAccountClosureHandler} from '../supabase/functions/account-closure/handler.js';

const config={url:'https://closure.invalid',anonKey:'public',serviceRoleKey:'server-only',cronSecret:'scheduled-secret'};
const uid='11111111-1111-4111-8111-111111111111';
const response=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status});
const request=(token?:string)=>new Request('https://worker.invalid',{method:'POST',headers:token?{Authorization:`Bearer ${token}`}:{}});

test('worker rejects anonymous and invalid identity before reading closure queue',async()=>{
 const calls:string[]=[];
 const worker=createAccountClosureHandler(config,async(input)=>{calls.push(String(input));return response({},401);});
 assert.equal((await worker(request())).status,401);
 assert.equal(calls.length,0);
 assert.equal((await worker(request('invalid-user'))).status,401);
 assert.deepEqual(calls,[config.url+'/auth/v1/user']);
});

test('user worker scopes queue to verified UID and confirms provider soft deletion with session revocation',async()=>{
 const calls:{url:string;body:unknown;method?:string}[]=[];
 const worker=createAccountClosureHandler(config,async(input,init)=>{
  const url=String(input);calls.push({url,body:init?.body?JSON.parse(String(init.body)):null,method:init?.method});
  if(url.endsWith('/auth/v1/user'))return response({id:uid});
  if(url.endsWith('/account_provider_pending'))return response({ids:[uid]});
  return response({});
 });
 const result=await worker(request('valid-user'));
 assert.deepEqual(await result.json(),{data:{processed:1,pending:0}});
 assert.deepEqual(calls[1].body,{p_user_id:uid});
 assert.ok(calls[2].url.endsWith('/auth/v1/admin/users/'+uid));
 assert.equal(calls[2].method,'DELETE');
 assert.deepEqual(calls[2].body,{should_soft_delete:true});
 assert.deepEqual(calls[3].body,{p_user_id:uid});
});

test('provider failure retains pending work for retry without false acknowledgement',async()=>{
 const calls:string[]=[];
 const worker=createAccountClosureHandler(config,async(input)=>{
  const url=String(input);calls.push(url);
  if(url.endsWith('/auth/v1/user'))return response({id:uid});
  if(url.endsWith('/account_provider_pending'))return response({ids:[uid]});
  return response({},503);
 });
 assert.deepEqual(await (await worker(request('valid-user'))).json(),{data:{processed:0,pending:1}});
 assert.equal(calls.some(url=>url.endsWith('/account_provider_complete')),false);
});

test('oversized or malformed provider queue never reaches Auth admin',async()=>{
 for(const ids of [Array(21).fill(uid),['invalid']]){
  let adminCalls=0;
  const worker=createAccountClosureHandler(config,async(input)=>{
   const url=String(input);
   if(url.endsWith('/auth/v1/user'))return response({id:uid});
   if(url.endsWith('/account_provider_pending'))return response({ids});
   adminCalls++;return response({});
  });
  assert.equal((await worker(request('valid-user'))).status,503);
  assert.equal(adminCalls,0);
 }
});

test('scheduled retry requires provider credential and independent cron header',async()=>{
 const worker=createAccountClosureHandler(config,async(input)=>String(input).endsWith('/account_provider_pending')?response({ids:[]}):response({},401));
 const headers={Authorization:'Bearer '+config.serviceRoleKey,'X-Account-Closure-Secret':config.cronSecret};
 const result=await worker(new Request('https://worker.invalid',{method:'POST',headers}));
 assert.equal(result.status,200);
 assert.deepEqual(await result.json(),{data:{processed:0,pending:0}});
 for(const invalid of [{Authorization:'Bearer '+config.cronSecret},{Authorization:'Bearer '+config.serviceRoleKey},{...headers,'X-Account-Closure-Secret':'wrong'}]){
  assert.equal((await worker(new Request('https://worker.invalid',{method:'POST',headers:invalid}))).status,401);
 }
});
