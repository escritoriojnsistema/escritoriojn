import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {randomUUID,randomBytes,generateKeyPairSync,createHash,createHmac} from 'node:crypto';
import {mkdir,writeFile,readFile,readdir,copyFile,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {app} from '../server/app.ts';
import {defaultOperationsPolicy} from '../shared/operations36.ts';
import {emptyService} from '../shared/services.ts';
import {packBackup36,unpackBackup36} from '../server/continuity36/bundle.ts';
// No production URL/restore target option: every provider belongs to this disposable lab.
let lab,server;const sdks=[],extra=[];const work='.backups36/'+randomUUID();const report={mode:'laboratory',production_backup_validated:false};
const env={...process.env};for(const key of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[key];
const docker=(args,input)=>execFileSync('docker',['--host=unix:///var/run/docker.sock',...args],{env,input,maxBuffer:128*1024*1024,stdio:['pipe','pipe','pipe']});
const hash=b=>createHash('sha256').update(b).digest('hex');
try{
 await mkdir(work,{recursive:true,mode:0o700});
 lab=await createAuthLab({storage:true,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});await lab.migrate();
 process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});sdks.push(c);return c;};const admin=sdk(lab.serviceRoleKey),users={},actors={},tokens={},password='Local36-'+randomBytes(24).toString('hex')+'!';
 for(const name of ['owner','admin','employee','client','other']){const result=await admin.auth.admin.createUser({email:`restore36-${name}@example.test`,password,email_confirm:true});assert.ifError(result.error);users[name]=result.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Laboratório36','${randomUUID()}');`,'migrator')).trim();const other=randomUUID();await lab.sql(`INSERT INTO public.offices(id,name)VALUES('${other}','Outro escritório36');INSERT INTO public.profiles(id,display_name)VALUES('${users.other}','Outro proprietário FICTÍCIO36');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${other}','${users.other}','owner');`,'migrator');
 for(const role of ['admin','employee','client'])await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users[role]}','Pessoa FICTÍCIA36');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users[role]}','${role}');`,'migrator');
 for(const name of Object.keys(users)){const c=sdk(lab.anonKey),result=await c.auth.signInWithPassword({email:`restore36-${name}@example.test`,password});assert.ifError(result.error);tokens[name]=result.data.session.access_token;actors[name]=c;assert.ifError((await c.rpc('session_activity',{p_human:false})).error);}
 server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const api=`http://127.0.0.1:${server.address().port}/api/`;
 const post=async(name,path,body,status=200)=>{const response=await fetch(api+path,{method:'POST',headers:{...(name?{Authorization:'Bearer '+tokens[name]}:{}),'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});assert.equal(response.status,status,path+': '+response.status);assert.match(response.headers.get('cache-control'),/no-store/);return response;};const data=async(path,body,status=200)=>(await(await post('owner',path,body,status)).json()).data;
 const initial=await data('operations/state',{});assert.equal(initial.revision,0);assert.equal(initial.production_backup_verified,false);
 for(const name of ['admin','employee','client','other'])await post(name,'operations/state',{},403);await post(null,'operations/state',{},401);await post('owner','operations/state',{office_id:other},403);
 const pair=generateKeyPairSync('rsa',{modulusLength:3072,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});
 const weak=generateKeyPairSync('rsa',{modulusLength:2048,publicKeyEncoding:{type:'spki',format:'pem'},privateKeyEncoding:{type:'pkcs8',format:'pem'}});assert.equal((await lab.sql(`SELECT private.operations36_rsa('${weak.publicKey}')`)).trim(),'f');assert.equal((await lab.sql(`SELECT private.operations36_rsa('${pair.publicKey}')`)).trim(),'t');assert.equal((await lab.sql(`SELECT private.operations36_rsa('-----BEGIN PUBLIC KEY-----'||chr(10)||repeat('A',8050)||chr(10)||'-----END PUBLIC KEY-----')`)).trim(),'f');
 const policy={...defaultOperationsPolicy,responsible:'Responsável FICTÍCIO36',recipient_public_key:pair.publicKey},save={expected_revision:0,policy,key:randomUUID()};
 assert.equal((await data('operations/save',save)).revision,1);assert.equal((await data('operations/save',save)).revision,1);await post('owner','operations/save',{...save,policy:{...policy,budget_cents:100}},409);await post('owner','operations/save',{...save,key:randomUUID()},409);
 await post('owner','operations/save',{...save,expected_revision:1,key:randomUUID(),policy:{...policy,recipient_public_key:pair.privateKey}},422);
 await lab.sql(`UPDATE public.memberships SET active=false WHERE office_id='${office}' AND user_id='${users.owner}';`);await post('owner','operations/state',{},403);await lab.sql(`UPDATE public.memberships SET active=true WHERE office_id='${office}' AND user_id='${users.owner}';`);
 const suffix=randomUUID().slice(0,8).toUpperCase(),category='Continuidade36 '+suffix;
 await data('categories/command',{command:{kind:'create',name:category,execution_level:3,reason:'Exclusivamente laboratório36'},idempotency_key:randomUUID()});
 const customer=await data('customers',{customer:{kind:'person',name:'Cliente FICTÍCIO36',identifier:'',contacts:[]}},201);
 const service=await data('services',{service:{...emptyService,code:'R36-'+suffix,name:'Serviço FICTÍCIO36',category,price_cents:12345},reason:'Exclusivamente laboratório36'},201);
 const request=await data('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title:'Restauração FICTÍCIA36',customer_id:customer.id,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 await data('charges/create',{request_id:request.id,installments:[{due_date:'2026-12-20',amount_cents:12345}],idempotency_key:randomUUID()});
 const bytes=Buffer.from('%PDF-1.4\n% Arquivo FICTICIO36 para restauracao\n%%EOF\n'),object=`${office}/${randomUUID()}/${randomUUID()}`,sha=hash(bytes);
 assert.ifError((await admin.storage.from('request-attachments').upload(object,bytes,{contentType:'application/pdf'})).error);
 await lab.sql(`INSERT INTO public.files(office_id,request_id,name,mime_type,size_bytes,sha256,classification,status,created_by)VALUES('${office}','${request.id}','Ficticio36.pdf','application/pdf',${bytes.length},'${sha}','documento','quarentena','${users.owner}');`);
 await lab.sql(`INSERT INTO public.customers(office_id,kind,name,created_by) SELECT '${office}','person','Cadastro SINTÉTICO36 '||n,'${users.owner}' FROM generate_series(1,10000)n;`);
 const latency=[];for(let wave=0;wave<2;wave++)await Promise.all(Array.from({length:10},async()=>{const started=performance.now();await data('operations/state',{});latency.push(performance.now()-started);}));latency.sort((a,b)=>a-b);report.performance={scope:'Local real API, one owner session,10 concurrent requests,10001 synthetic customers',samples:latency.length,p50_ms:Number(latency[9].toFixed(2)),p95_ms:Number(latency[18].toFixed(2)),target_p95_ms:2000,met:latency[18]<=2000};
 const totals=`SELECT jsonb_build_object('auth_users',(SELECT count(*) FROM auth.users),'memberships',(SELECT count(*) FROM public.memberships),'customers',(SELECT count(*) FROM public.customers),'requests',(SELECT count(*) FROM public.requests),'files',(SELECT count(*) FROM public.files),'obligation_cents',(SELECT sum(delta_cents) FROM private.charge_events),'storage_objects',(SELECT count(*) FROM storage.objects),'foreign_keys',(SELECT count(*) FROM pg_constraint WHERE contype='f' AND convalidated),'rls_tables',(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private') AND c.relrowsecurity));`;
 const expected=JSON.parse((await lab.sql(totals)).trim());assert.equal(expected.obligation_cents,12345);assert.equal(expected.storage_objects,1);
 const aclQuery=`SELECT md5(string_agg(n.nspname||'.'||c.relname||':'||coalesce((SELECT string_agg(a.grantee::text||'/'||a.grantor::text||'/'||a.privilege_type||'/'||a.is_grantable::text,',' ORDER BY a.grantee,a.grantor,a.privilege_type) FROM aclexplode(coalesce(c.relacl,acldefault('r',c.relowner)))a),'')||':'||c.relrowsecurity::text,',' ORDER BY n.nspname,c.relname)) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('public','private') AND c.relkind='r';`;
 const expectedAcl=(await lab.sql(aclQuery)).trim();
 const staging=work+'/staging';await mkdir(staging+'/objects',{recursive:true,mode:0o700});const backupStarted=Date.now();
 await writeFile(staging+'/database.dump',docker(['exec',lab.databaseContainer,'pg_dump','-Fc','-U','postgres','-d','auth_lab']),{mode:0o600});
 const downloaded=await admin.storage.from('request-attachments').download(object);assert.ifError(downloaded.error);const captured=Buffer.from(await downloaded.data.arrayBuffer());assert.equal(hash(captured),sha);await writeFile(staging+'/objects/'+sha,captured,{mode:0o600});
 await writeFile(staging+'/storage.json',JSON.stringify([{bucket:'request-attachments',object,file:'objects/'+sha,sha256:sha,size_bytes:bytes.length}]),{mode:0o600});
 await writeFile(staging+'/config.json',JSON.stringify({source:'laboratory',git_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),migrations:(await readdir('supabase/migrations')).filter(f=>f.endsWith('.sql')),provider_configuration:'separate_required'}),{mode:0o600});
 const receipt=await packBackup36(staging,work+'/backup.jnbackup',pair.publicKey);await mkdir(work+'/external-copy',{mode:0o700});await copyFile(work+'/backup.jnbackup',work+'/external-copy/backup.jnbackup');assert.equal(hash(await readFile(work+'/external-copy/backup.jnbackup')),receipt.sha256);report.backup_ms=Date.now()-backupStarted;
 const restoreStarted=Date.now();await unpackBackup36(work+'/external-copy/backup.jnbackup',work+'/restored',pair.privateKey,receipt.sha256);
 const database='restore36_'+randomBytes(5).toString('hex');await lab.sql(`CREATE DATABASE ${database} OWNER migrator;`);
 docker(['exec','-i',lab.databaseContainer,'pg_restore','--clean','--if-exists','--exit-on-error','-U','postgres','-d',database],await readFile(work+'/restored/database.dump'));
 const restoredSql=query=>docker(['exec','-i',lab.databaseContainer,'psql','-X','-v','ON_ERROR_STOP=1','-qAt','-U','postgres','-d',database],query).toString().trim();
 assert.deepEqual(JSON.parse(restoredSql(totals)),expected);assert.equal(restoredSql(aclQuery),expectedAcl);assert.equal(hash(await readFile(work+'/restored/objects/'+sha)),sha);
 // Restart isolated provider instances against the restored DB; rotate the lab JWT secret.
 const prefix=lab.databaseContainer.replace(/-postgres$/,''),network=JSON.parse(docker(['inspect',lab.databaseContainer]).toString())[0].NetworkSettings.Networks;assert.equal(Object.keys(network).length,1);
 const secret=randomBytes(48).toString('hex');
 const jwt=role=>{const h=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),p=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url'),body=h+'.'+p;return body+'.'+createHmac('sha256',secret).update(body).digest('base64url');};
 const serviceKey=jwt('service_role'),anonKey=jwt('anon');
 async function restart(kind,port,changes){
  const original=JSON.parse(docker(['inspect',prefix+'-'+kind]).toString())[0];const name=prefix+'-restore-'+kind;const values=original.Config.Env.filter(v=>!Object.keys(changes).some(k=>v.startsWith(k+'='))).map(v=>v.replaceAll('/auth_lab','/'+database));for(const [k,v] of Object.entries(changes))values.push(k+'='+v);
  const file=work+'/'+kind+'.env';await writeFile(file,values.join('\n')+'\n',{mode:0o600});
  const args=['run','-d','--name',name,'--network',Object.keys(network)[0],'--network-alias','restore-'+kind,'--env-file',file,'--publish',`127.0.0.1::${port}`];
  if(kind==='storage'&&process.env.AUTH_LAB_STORAGE_ROOTFS)args.push('--mount','type=bind,source=/dev/shm/jn-storage24-root,target=/provider,readonly','--mount','type=bind,source=/dev/shm/jn-storage24-resolv.conf,target=/provider/etc/resolv.conf,readonly','--tmpfs','/provider/tmp:rw,nosuid,noexec,size=32m,mode=1777','--tmpfs','/provider/var/lib/storage:rw,nosuid,noexec,size=96m,mode=1777','--entrypoint','/bin/busybox','alpine:3.23.6@sha256:85fe1e81d6758c208f3e1eed4338a1997e19d4be002d4dd32d3100c9a8c010a0','chroot','/provider','/bin/sh','-c','cd /app && exec docker-entrypoint.sh node dist/start/server.js');else{if(kind==='storage')args.push('--tmpfs','/var/lib/storage:rw,nosuid,noexec,size=96m,mode=1777');args.push(original.Config.Image);}
  extra.push(name);docker(args);const target='http://'+docker(['port',name,`${port}/tcp`]).toString().trim();const deadline=Date.now()+60000;
  while(Date.now()<deadline){try{const r=await fetch(target+(kind==='auth'?'/health':kind==='storage'?'/status':'/'),{signal:AbortSignal.timeout(1500)});if(r.ok)return target;}catch{}await delay(200);}throw Error('Restored provider not ready: '+kind);
 }
 const authOrigin=await restart('auth',9999,{GOTRUE_JWT_SECRET:secret});
 const restOrigin=await restart('rest',3000,{PGRST_JWT_SECRET:secret});
 const storageOrigin=await restart('storage',5000,{AUTH_JWT_SECRET:secret,ANON_KEY:anonKey,SERVICE_KEY:serviceKey,POSTGREST_URL:'http://restore-rest:3000'});
 const login=await fetch(authOrigin+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'restore36-owner@example.test',password})});assert.equal(login.status,200);const session=await login.json();assert.equal(session.user.id,users.owner);
 const oldTokenStatus=(await fetch(authOrigin+'/user',{headers:{Authorization:'Bearer '+tokens.owner}})).status;assert.ok([401,403].includes(oldTokenStatus),'Token anterior deve ser rejeitado após rotação da chave do laboratório');report.old_token_status=oldTokenStatus;
 const rpc=async(name,body,token=session.access_token)=>fetch(restOrigin+'/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await rpc('session_activity',{p_human:false})).status,200);const ownerState=await rpc('operations36_state',{p_office_id:office});assert.equal(ownerState.status,200);assert.equal((await ownerState.json()).revision,1);
 const clientLogin=await(await fetch(authOrigin+'/token?grant_type=password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'restore36-client@example.test',password})})).json();await rpc('session_activity',{p_human:false},clientLogin.access_token);assert.equal((await rpc('operations36_state',{p_office_id:office},clientLogin.access_token)).status,403);
 assert.notEqual((await fetch(storageOrigin+'/object/request-attachments/'+object,{headers:{Authorization:'Bearer '+serviceKey}})).status,200);
 const restoredBytes=await readFile(work+'/restored/objects/'+sha);const upload=await fetch(storageOrigin+'/object/request-attachments/'+object,{method:'POST',headers:{Authorization:'Bearer '+serviceKey,apikey:anonKey,'Content-Type':'application/pdf','x-upsert':'true'},body:restoredBytes});assert.equal(upload.status,200);
 const restoredDownload=await fetch(storageOrigin+'/object/request-attachments/'+object,{headers:{Authorization:'Bearer '+serviceKey}});assert.equal(restoredDownload.status,200);assert.equal(hash(Buffer.from(await restoredDownload.arrayBuffer())),sha);
 report.restore_ms=Date.now()-restoreStarted;report.snapshot_age_at_restore_ms=Date.now()-backupStarted;report.counts=expected;report.restored_auth_login=true;report.old_token_rejected=true;report.acl_rls_fingerprint_preserved=true;report.cross_role_denied=true;report.storage_sha256_verified=true;report.receipt=receipt;report.external_copy='Local independent directory; durable external destination pending user configuration';report.targets={rpo_hours:24,rto_hours:8};report.target_met_in_laboratory=report.restore_ms<8*3600000;report.production_rpo_rto='unmeasured';
 await mkdir('docs/evidencias/etapa-36',{recursive:true});await writeFile('docs/evidencias/etapa-36/restauracao-laboratorio.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
}catch(error){console.error('Continuity36 laboratory failed: '+(error instanceof assert.AssertionError?error.message:String(error.message).split('\n')[0]));process.exitCode=1;}
finally{for(const c of sdks)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}for(const name of extra.reverse())try{docker(['rm','--force',name]);}catch{}await lab?.close();await rm(work,{recursive:true,force:true});}
