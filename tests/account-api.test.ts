import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {app} from '../server/app.js';
import {accountData,accountCorrection} from '../server/modules/account/dto.js';
const office='00000000-0000-4000-e000-000000000101',id='00000000-0000-4000-d000-000000000101';
const input={name:'Pessoa Fictícia',cpf:'11144477735',email:'pessoa@example.test'},version='a'.repeat(64);
const account={...input,version,cpf_masked:'***.***.***-35',pending_email:null,can_edit:true};
test('Conta projeta apenas dados pessoais e decisão autorizada',()=>{
 assert.deepEqual(accountData({...account,cpf_hash:'PRIVATE HASH',permissions:['owner']}),account);
 const correction={status:'pending',before:input,proposed:input,applied:null,can_apply:false,email_pending:false};
 assert.deepEqual(accountCorrection({...correction,actor_id:id,internal_note:'PRIVATE',before:{...input,role:'owner'}}),correction);
 assert.throws(()=>accountCorrection({...correction,can_apply:'true'}));
 assert.throws(()=>accountData({...account,version:'fake'}));
});
test('Conta API valida autoridade, versão, protocolo e conexão pública',async t=>{
 let failure=false;
 const calls:{url:string;body:Record<string,unknown>;auth?:string}[]=[];
 const provider=createServer(async(req,res)=>{let raw='';for await(const c of req)raw+=c;const body=raw?JSON.parse(raw):{};calls.push({url:req.url??'',body,auth:req.headers.authorization});res.setHeader('Content-Type','application/json');
  if(req.url==='/auth/v1/user'){res.end(JSON.stringify({id,email:input.email,aud:'authenticated'}));return;}
  if(failure){res.statusCode=403;res.end(JSON.stringify({code:'PT403',message:'ACCOUNT_FORBIDDEN'}));return;}
  res.end(JSON.stringify({...account,internal_note:'PRIVATE HASH'}));
 });
 await new Promise<void>(resolve=>provider.listen(0,'127.0.0.1',resolve));const address=provider.address();if(!address||typeof address==='string')throw Error('provider');
 const oldUrl=process.env.VITE_SUPABASE_URL,oldKey=process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
 process.env.VITE_SUPABASE_URL=`http://127.0.0.1:${address.port}`;process.env.VITE_SUPABASE_PUBLISHABLE_KEY='sb_publishable_account_fixture';
 const api=createServer(app);await new Promise<void>(resolve=>api.listen(0,'127.0.0.1',resolve));const apiAddress=api.address();if(!apiAddress||typeof apiAddress==='string')throw Error('API');const base=`http://127.0.0.1:${apiAddress.port}/api/account`;
 const send=(path:string,body:unknown,token=true)=>fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer account-fixture'}:{})},body:JSON.stringify(body)});
 try{
  await t.test('anônimo negado e dados corretos sem cache compartilhado',async()=>{assert.equal((await send('/read',{office_id:office},false)).status,401);assert.equal(calls.length,0);const result=await send('/read',{office_id:office});assert.equal(result.status,200);assert.deepEqual((await result.json()).data,account);assert.match(result.headers.get('cache-control')??'',/private.*no-store/);assert.deepEqual(calls.map(c=>c.url),['/auth/v1/user','/rest/v1/rpc/account_read']);});
  await t.test('salvar deriva ator do Bearer e evento do servidor',async()=>{const result=await send('/save',{office_id:office,expected_version:version,input});assert.equal(result.status,200);assert.deepEqual(calls.at(-1)?.body.p_input,input);assert.equal(calls.at(-1)?.body.p_expected_version,version);assert.match(String(calls.at(-1)?.body.p_event_id),/^[a-f0-9-]{36}$/);assert.ok(calls.every(c=>c.auth==='Bearer account-fixture'));});
  await t.test('campos extras e autoridade arbitrária bloqueados antes de RPC',async()=>{const start=calls.filter(c=>c.url.includes('/rpc/')).length;for(const body of [{office_id:office,user_id:id},{office_id:'bad'}])assert.equal((await send('/read',body)).status,422);for(const change of [{user_id:id},{role_code:'owner'},{cpf:'bad'},{email:'Invalid'}])assert.equal((await send('/save',{office_id:office,expected_version:version,input:{...input,...change}})).status,422);assert.equal((await send('/apply',{office_id:office,request_id:id,expected_version:0,input})).status,422);assert.equal(calls.filter(c=>c.url.includes('/rpc/')).length,start);});
  await t.test('permissão revogada chega como 403 sem dado pessoal',async()=>{failure=true;const result=await send('/apply',{office_id:office,request_id:id,expected_version:1,input});assert.equal(result.status,403);assert.ok(!(await result.text()).includes(input.cpf));});
 }finally{await new Promise<void>(resolve=>api.close(()=>resolve()));await new Promise<void>(resolve=>provider.close(()=>resolve()));if(oldUrl===undefined)delete process.env.VITE_SUPABASE_URL;else process.env.VITE_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.VITE_SUPABASE_PUBLISHABLE_KEY;else process.env.VITE_SUPABASE_PUBLISHABLE_KEY=oldKey;}
});
