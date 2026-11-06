import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer,request as proxyRequest} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {createRetentionHandler} from '../supabase/functions/retention/handler.ts';
import {createAccountClosureHandler} from '../supabase/functions/account-closure/handler.ts';
import {app} from '../server/app.ts';
import {correctionDocuments} from '../tests/auth/corrections-document-fixture.mjs';

// Run: node --import tsx scripts/test-corrections-real.mjs [--storage]
// Creates only disposable LOCAL providers. No hosted endpoint/credential override.
// --storage adds actual Storage bytes; the default makes no Storage claim.
const withStorage=process.argv.includes('--storage');
const sdk=[];let lab,gateway,api;
const listen=server=>new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve(`http://127.0.0.1:${server.address().port}`));});
const stop=server=>server&&new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
const pass=message=>console.log('PASS: '+message);
try{
 lab=await createAuthLab({storage:withStorage,artifacts:withStorage,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});await lab.migrate();
 const cronSecret=randomBytes(32).toString('hex');
 const retentionHandler=createRetentionHandler({url:lab.url,anonKey:lab.anonKey,serviceRoleKey:lab.serviceRoleKey,cronSecret});
 const handler=createAccountClosureHandler({url:lab.url,anonKey:lab.anonKey,serviceRoleKey:lab.serviceRoleKey,cronSecret});
 // Node adapter for the production Edge handler; identity/RPC/admin requests all
 // reach real local providers. The edge platform gateway itself is not emulated.
 gateway=createServer(async(req,res)=>{
  if(['/functions/v1/account-closure','/functions/v1/retention'].includes(req.url)){
   try{let raw='';for await(const part of req)raw+=part;const reply=await (req.url==='/functions/v1/retention'?retentionHandler:handler)(new Request('http://localhost'+req.url,{method:req.method,headers:req.headers,body:raw}));res.writeHead(reply.status,Object.fromEntries(reply.headers));res.end(Buffer.from(await reply.arrayBuffer()));}catch{res.writeHead(503).end();}return;
  }
  const upstream=new URL(lab.url);const proxy=proxyRequest({hostname:upstream.hostname,port:upstream.port,path:req.url,method:req.method,headers:req.headers},reply=>{res.writeHead(reply.statusCode??502,reply.headers);reply.pipe(res);});proxy.on('error',()=>res.writeHead(502).end());req.pipe(proxy);
 });
 const provider=await listen(gateway);
 process.env.VITE_SUPABASE_URL=provider;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 api=createServer(app);const apiUrl=await listen(api);
 const client=key=>{const value=createClient(provider,key,{auth:{persistSession:false,autoRefreshToken:false}});sdk.push(value);return value;};
 const admin=client(lab.serviceRoleKey),password=`Local-${randomBytes(24).toString('hex')}!`,users={};
 for(const name of ['owner','closing','pending','unaffected','orderprobe','softprobe']){const r=await admin.auth.admin.createUser({email:`corrections-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Correções Auth local','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id,display_name) VALUES('${users.closing}','Cliente fechamento local'),('${users.pending}','Cliente retry local'),('${users.unaffected}','Cliente preservado local');INSERT INTO public.memberships(office_id,user_id,role_code) VALUES('${office}','${users.closing}','client'),('${office}','${users.pending}','client'),('${office}','${users.unaffected}','client');`,'migrator');
 const sessions={};
 for(const name of ['owner','closing','pending','unaffected']){const c=client(lab.anonKey);const result=await c.auth.signInWithPassword({email:`corrections-${name}@example.test`,password});assert.ifError(result.error);assert.ok(result.data.session);const claims=JSON.parse(Buffer.from(result.data.session.access_token.split('.')[1],'base64url'));assert.equal(claims.sub,users[name]);assert.ok(claims.session_id);const activity=await c.rpc('session_activity',{p_human:false});assert.ifError(activity.error);assert.equal(activity.data.session_id,claims.session_id);assert.ok(Date.parse(activity.data.expires_at)>Date.now());assert.ok(Date.parse(activity.data.expires_at)<Date.now()+31*60000);sessions[name]={c,token:result.data.session.access_token,refresh:result.data.session.refresh_token,sid:claims.session_id};}
 pass('GoTrue JWT UID/session_id and future server session timestamps verified for all actors');
 const probe=client(lab.anonKey);const probeLogin=await probe.auth.signInWithPassword({email:'corrections-orderprobe@example.test',password});assert.ifError(probeLogin.error);const probeToken=probeLogin.data.session.access_token;
 const probeLogout=await fetch(provider+'/auth/v1/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+probeToken,apikey:lab.anonKey}});assert.equal(probeLogout.status,204);
 const probeIdentity=await fetch(provider+'/auth/v1/user',{headers:{Authorization:'Bearer '+probeToken,apikey:lab.anonKey}});
 console.log(JSON.stringify({provider_order_probe:{logout_status:probeLogout.status,getuser_after_logout:probeIdentity.status,sessions_after_logout:Number((await lab.sql(`SELECT count(*) FROM auth.sessions WHERE user_id='${users.orderprobe}';`)).trim())}}));
 assert.equal(probeIdentity.status,403);assert.ifError((await admin.auth.admin.updateUserById(users.orderprobe,{ban_duration:'876000h'})).error);
 pass('real global logout removes sessions and same JWT getUser is denied; worker must verify identity before revocation');
 const soft=client(lab.anonKey);const softLogin=await soft.auth.signInWithPassword({email:'corrections-softprobe@example.test',password});assert.ifError(softLogin.error);
 await lab.sql(`CREATE SCHEMA lab_corrections;CREATE TABLE lab_corrections.preserved(id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE RESTRICT);INSERT INTO lab_corrections.preserved VALUES('${users.softprobe}');`);
 assert.ifError((await admin.auth.admin.deleteUser(users.softprobe,true)).error);
 const softState=JSON.parse((await lab.sql(`SELECT json_build_object('sessions',(SELECT count(*) FROM auth.sessions WHERE user_id='${users.softprobe}'),'refresh',(SELECT count(*) FROM auth.refresh_tokens WHERE user_id='${users.softprobe}' AND NOT revoked),'identities',(SELECT count(*) FROM auth.identities WHERE user_id='${users.softprobe}'),'retained_fk',EXISTS(SELECT FROM lab_corrections.preserved WHERE id='${users.softprobe}'),'retained_auth',EXISTS(SELECT FROM auth.users WHERE id='${users.softprobe}'),'deleted_at',EXISTS(SELECT FROM auth.users WHERE id='${users.softprobe}' AND deleted_at IS NOT NULL),'email_erased',EXISTS(SELECT FROM auth.users WHERE id='${users.softprobe}' AND email IS NULL),'password_erased',EXISTS(SELECT FROM auth.users WHERE id='${users.softprobe}' AND coalesce(encrypted_password,'')=''));`)).trim());
 console.log(JSON.stringify({provider_soft_delete:softState}));assert.equal(softState.sessions,0);assert.equal(softState.refresh,0);assert.equal(softState.retained_fk,true);assert.equal(softState.retained_auth,true);assert.equal(softState.deleted_at,true);assert.equal(softState.password_erased,true);
 assert.ok((await client(lab.anonKey).auth.signInWithPassword({email:'corrections-softprobe@example.test',password})).error);assert.ok((await client(lab.anonKey).auth.refreshSession({refresh_token:softLogin.data.session.refresh_token})).error);assert.ok((await soft.auth.getUser(softLogin.data.session.access_token)).error);
 pass('real GoTrue soft delete clears credentials/sessions, denies saved refresh/JWT/password and preserves user UUID/FK');
 const activeDelete=await admin.auth.admin.deleteUser(users.unaffected,true);assert.ok(activeDelete.error);assert.equal((await lab.sql(`SELECT deleted_at IS NULL FROM auth.users WHERE id='${users.unaffected}';`)).trim(),'t');pass('narrow Auth email guard still rejects soft deletion of an active account without closure tombstone');


 const post=async(name,path,body,status=200)=>{const response=await fetch(apiUrl+'/api/'+path,{method:'POST',headers:{Authorization:'Bearer '+sessions[name].token,'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});let failureCode='';if(response.status!==status){try{failureCode=(await response.clone().json()).error?.code??'';}catch{}}assert.equal(response.status,status,`${path}: expected ${status}, got ${response.status} ${failureCode}`);return response;};
 const closure={reason:'privacy',observation:'Disposable local observation',acknowledged:true,export_offered:true};
 const categoryName='Correções local '+randomUUID().slice(0,8);
 const categoryResult=await(await post('owner','categories/command',{command:{kind:'create',name:categoryName,execution_level:1,reason:'Fixture local exclusiva'},idempotency_key:randomUUID()})).json();
 const category=categoryResult.data.items.find(item=>item.name===categoryName);assert.equal(category.execution_level,1);
 await post('unaffected','categories/command',{command:{kind:'create',name:'Proibida',execution_level:1,reason:'Cliente não administra'},idempotency_key:randomUUID()},403);
 await post('unaffected','requests',{idempotency_key:randomUUID(),request:{origin:'portal',title:'Sem categoria',message:'Deve ser recusado'}},422);
 const opened=await(await post('unaffected','requests',{idempotency_key:randomUUID(),request:{origin:'portal',title:'Retorno real local',message:'Mensagem própria local',category_id:category.id}},201)).json();const requestId=opened.data.id;
 const staffReturn=await(await post('owner',`requests/${requestId}/detail`,{page:1})).json();await post('owner',`requests/${requestId}/actions`,{expected_version:staffReturn.data.version,mutation:{kind:'status',status:'aguardando_cliente',reason:'Complete as informações locais'}});
 const state=await(await post('unaffected',`portal-requests/${requestId}/state`,{})).json();assert.equal(state.data.can_edit,true);assert.equal(state.data.reason,'Complete as informações locais');assert.equal('assignee_id' in state.data,false);
 await post('pending',`portal-requests/${requestId}/state`,{},404);
 const saveBody={expected_version:state.data.version,command:{kind:'save',title:'Corrigido pelo cliente local',message:'Mensagem corrigida local',inputs:[]},idempotency_key:randomUUID()};
 const savedReturn=await(await post('unaffected',`portal-requests/${requestId}/command`,saveBody)).json();const retriedReturn=await(await post('unaffected',`portal-requests/${requestId}/command`,saveBody)).json();assert.equal(savedReturn.data.version,retriedReturn.data.version);
 await post('unaffected',`portal-requests/${requestId}/command`,{expected_version:state.data.version,command:{kind:'resubmit'},idempotency_key:randomUUID()},409);
 const resubmitted=await(await post('unaffected',`portal-requests/${requestId}/command`,{expected_version:savedReturn.data.version,command:{kind:'resubmit'},idempotency_key:randomUUID()})).json();assert.equal(resubmitted.data.can_edit,false);
 pass('real category create/ACL and required-category request → staff return → own edit/idempotent retry → resubmit with stale-version and third-party denials');

 await post('owner','account-closure/close',{input:closure},403);
 await post('closing','account-closure/close',{input:{...closure,acknowledged:false}},422);
 await post('closing','account-closure/export',{},204);
 pass('real API rejects staff closure/unacknowledged closure and accepts empty authorized export');
 let objectPath,documentFixture;
 if(withStorage){objectPath=`${office}/${randomUUID()}/${randomUUID()}`;const bytes=Buffer.from('%PDF-1.4\n% disposable corrections storage fixture\n%%EOF\n');assert.ifError((await admin.storage.from('request-attachments').upload(objectPath,bytes,{contentType:'application/pdf',upsert:false})).error);assert.equal((await sessions.closing.c.storage.from('request-attachments').download(objectPath)).data,null);pass('real Storage private object exists and unrelated client cannot download it');documentFixture=await correctionDocuments({post,lab,users,office,categoryName});pass('real Auth/API/Storage PDF and ZIP exports preserve exact authorized official document bytes');}
 const secondClosing=client(lab.anonKey);const secondLogin=await secondClosing.auth.signInWithPassword({email:'corrections-closing@example.test',password});assert.ifError(secondLogin.error);const secondActivity=await secondClosing.rpc('session_activity',{p_human:false});assert.ifError(secondActivity.error);assert.notEqual(secondActivity.data.session_id,sessions.closing.sid);assert.ok(Date.parse(secondActivity.data.expires_at)>Date.now());
 const result=await (await post('closing','account-closure/close',{input:closure})).json();assert.equal(result.data.closed,true);assert.equal(result.data.provider_disabled,true);assert.equal(typeof result.data.provider_sessions_revoked,'boolean');console.log(JSON.stringify({provider_sessions_revoked:result.data.provider_sessions_revoked,provider_disabled:result.data.provider_disabled}));
 const saved=JSON.parse((await lab.sql(`SELECT json_build_object('closed',EXISTS(SELECT FROM private.account_closures WHERE user_id='${users.closing}' AND observation IS NULL AND provider_disabled_at IS NOT NULL),'inactive',NOT EXISTS(SELECT FROM public.memberships WHERE user_id='${users.closing}' AND active),'no_activity',NOT EXISTS(SELECT FROM private.session_activities WHERE user_id='${users.closing}'));`,'migrator')).trim());assert.deepEqual(saved,{closed:true,inactive:true,no_activity:true});
 pass('real API committed tombstone, discarded optional observation and disabled memberships');
 const providerRows=JSON.parse((await lab.sql(`SELECT json_build_object('sessions',(SELECT count(*) FROM auth.sessions WHERE user_id='${users.closing}'),'active_refresh',(SELECT count(*) FROM auth.refresh_tokens WHERE user_id='${users.closing}' AND revoked=false),'deleted',EXISTS(SELECT FROM auth.users WHERE id='${users.closing}' AND deleted_at IS NOT NULL AND coalesce(encrypted_password,'')=''),'fk_preserved',EXISTS(SELECT FROM public.profiles WHERE id='${users.closing}'));`)).trim());console.log(JSON.stringify({after_closure_provider_rows:providerRows}));assert.deepEqual(providerRows,{sessions:0,active_refresh:0,deleted:true,fk_preserved:true});
 assert.equal((await sessions.closing.c.rpc('session_activity',{p_human:true})).error?.code,'PT401');
 await post('closing','account-closure/export',{},401);assert.equal((await secondClosing.rpc('session_activity',{p_human:true})).error?.code,'PT401');assert.ok((await client(lab.anonKey).auth.refreshSession({refresh_token:secondLogin.data.session.refresh_token})).error);
 const deniedLogin=await client(lab.anonKey).auth.signInWithPassword({email:'corrections-closing@example.test',password});assert.ok(deniedLogin.error);assert.equal(deniedLogin.data.session,null);
 const deniedRefresh=await client(lab.anonKey).auth.refreshSession({refresh_token:sessions.closing.refresh});assert.ok(deniedRefresh.error);assert.equal(deniedRefresh.data.session,null);
 assert.equal((await lab.sql(`SELECT email IS DISTINCT FROM 'corrections-closing@example.test' FROM auth.users WHERE id='${users.closing}';`)).trim(),'t');
 pass('saved access JWT, saved refresh token and fresh password login cannot reactivate closed account');
 const archives=await(await post('owner','account-closure/archives',{query:'Cliente fechamento local',page:1})).json();assert.equal(archives.data.total,1);assert.equal(archives.data.items[0].id,users.closing);
 const archivedDocuments=(await(await post('owner','account-closure/documents',{user_id:users.closing})).json()).data.items;assert.equal(archivedDocuments.length,documentFixture?.documents.length??0);if(documentFixture){assert.deepEqual(archivedDocuments.map(d=>d.id).sort(),documentFixture.documents.map(d=>d.id).sort());await documentFixture.createDocument();const late=(await(await post('owner','account-closure/documents',{user_id:users.closing})).json()).data.items;assert.equal(late.length,3);pass('archive dynamically includes official document linked after closure');}
 await post('unaffected','account-closure/archives',{query:'',page:1},403);
 pass('real archive API shows closed account to authorized owner, preserves the official document inventory and denies unrelated client');
 // Simulate only an absent worker invocation, never provider success: close via
 // real JWT RPC and then let the production scheduled handler drain the outbox.
 assert.ifError((await sessions.pending.c.rpc('account_close',{p_office_id:office,p_input:closure})).error);
 assert.equal((await sessions.pending.c.rpc('session_activity',{p_human:false})).error?.code,'PT401');
 const worker=async(headers)=>{const response=await fetch(provider+'/functions/v1/account-closure',{method:'POST',headers,body:'{}'});return{status:response.status,body:await response.json()};};
 const retry=await worker({Authorization:'Bearer '+lab.serviceRoleKey,'X-Account-Closure-Secret':cronSecret});assert.equal(retry.status,200);assert.deepEqual(retry.body.data,{processed:1,pending:0});assert.equal((await lab.sql(`SELECT count(*) FROM auth.sessions WHERE user_id='${users.pending}';`)).trim(),'0');assert.equal((await lab.sql(`SELECT count(*) FROM auth.refresh_tokens WHERE user_id='${users.pending}' AND NOT revoked;`)).trim(),'0');
 assert.deepEqual((await worker({Authorization:'Bearer '+lab.serviceRoleKey,'X-Account-Closure-Secret':cronSecret})).body.data,{processed:0,pending:0});
 assert.equal((await worker({Authorization:'Bearer '+lab.serviceRoleKey,'X-Account-Closure-Secret':'wrong'})).status,401);
 const stable=await sessions.unaffected.c.rpc('session_activity',{p_human:false});assert.ifError(stable.error);assert.equal(stable.data.session_id,sessions.unaffected.sid);
 pass('real service JWT + independent scheduler secret drains pending provider soft deletion idempotently and keeps unrelated session valid');
 if(withStorage){const retentionWorker=async(secret=cronSecret)=>{const response=await fetch(provider+'/functions/v1/retention',{method:'POST',headers:{Authorization:'Bearer '+lab.serviceRoleKey,'X-Retention-Secret':secret},body:'{}'});return{status:response.status,body:await response.json()};};assert.equal((await retentionWorker('wrong')).status,401);await documentFixture.verifyRetention({worker:retentionWorker,admin});pass('real API zero-day local policy/classification + legal hold/release → automatic worker claim → real Storage PDF erasure + source redaction; hashes/ledger/history/unrelated PDF preserved and retry idempotent');const retained=await admin.storage.from('request-attachments').download(objectPath);assert.ifError(retained.error);assert.ok(retained.data.size>0);pass('closing account retained unrelated Storage bytes; no purge of unknown objects');}
 console.log(JSON.stringify({proof:'corrections-real',local_only:true,providers:{auth:true,rest:true,api:true,storage:withStorage},edge_gateway:false,retention_purge:withStorage,document_export:withStorage?'byte-identical-PDF-and-ZIP':'empty-authorized-manifest',archive_documents:withStorage?'three-including-postclosure':'empty-authorized-inventory',scanner:false}));
}catch(error){console.error('Corrections real local verification failed: '+error.message);process.exitCode=1;}finally{for(const c of sdk)await c.auth.dispose();await stop(api);await stop(gateway);await lab?.close();}
