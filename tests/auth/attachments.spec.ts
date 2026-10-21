import { test, expect, type APIRequestContext } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { emptyService } from '../../shared/services';
import { attachmentBucket, attachmentMaxBytes, type AttachmentIntent, type AttachmentUploadInput } from '../../shared/attachments';

const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
// A deliberately synthetic PDF. No real person, document or hosted fixture.
const pdf=Buffer.from('%PDF-1.4\n% Documento inteiramente ficticio do laboratorio local11\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const id=(value:string)=>{expect(value).toMatch(/^[0-9a-f-]{36}$/);return value;};
async function actor(name:string){
 const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 expect((await sdk.auth.signInWithPassword({email:`${name}@example.test`,password})).error).toBeNull();
 const {data}=await sdk.auth.getSession();return {sdk,headers:{Authorization:`Bearer ${data.session!.access_token}`},uid:data.session!.user.id};
}
type Actor=Awaited<ReturnType<typeof actor>>;
async function dispose(...actors:Actor[]){await Promise.all(actors.map(a=>a.sdk.auth.dispose()));}
async function data<T=any>(response:Awaited<ReturnType<APIRequestContext['post']>>,status=200):Promise<T>{expect(response.status(),await response.text()).toBe(status);return ((await response.json()) as {data:T}).data;}
async function post(request:APIRequestContext,a:Actor,path:string,body:Record<string,unknown>,status=200){return data(await request.post(`/api/attachments${path}`,{headers:a.headers,data:{office_id:office,...body}}),status);}
async function portal(request:APIRequestContext,a:Actor){return data(await request.post('/api/requests',{headers:a.headers,data:{office_id:office,idempotency_key:randomUUID(),request:{origin:'portal',title:`Anexos11 fictícios ${randomUUID().slice(0,8)}`,message:'Mensagem inteiramente fictícia do laboratório local.'}}}),201);}
function input(requestId:string,overrides:Partial<AttachmentUploadInput>={}):AttachmentUploadInput{return {request_id:requestId,request_item_id:null,name:'documento-ficticio.pdf',mime_type:'application/pdf',size_bytes:pdf.length,sha256:hash(pdf),classification:'documento',idempotency_key:randomUUID(),...overrides};}
async function begin(request:APIRequestContext,a:Actor,requestId:string,overrides:Partial<AttachmentUploadInput>={}):Promise<AttachmentIntent>{return post(request,a,'/intents',{input:input(requestId,overrides)},201);}
async function upload(a:Actor,intent:AttachmentIntent,bytes=pdf){return a.sdk.storage.from(attachmentBucket).upload(intent.object_path,bytes,{contentType:intent.file.mime_type,upsert:false});}
async function validate(request:APIRequestContext,a:Actor,intent:AttachmentIntent){return post(request,a,'/process',{action:'validate',args:{intent_id:intent.intent_id}});}

/** Only the disposable local database permits administrative fixture changes. */
async function localSql(query:string):Promise<string>{
 const database=process.env.AUTH_LAB_DB_CONTAINER;
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!/^jn-auth-lab-[0-9a-f-]{36}-postgres$/.test(database??''))throw Error('Administrative fixture access requires the disposable local laboratory.');
 const commandEnv={...process.env};for(const name of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete commandEnv[name];
 return new Promise((resolve,reject)=>{
  const child=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i',database!,'psql','-X','-v','ON_ERROR_STOP=1','-q','-A','-t','-U','postgres','-d','auth_lab'],{env:commandEnv,stdio:['pipe','pipe','pipe']});
  let result='',failed=false;const timer=setTimeout(()=>{failed=true;child.kill('SIGKILL');reject(Error('Local fixture SQL timed out.'));},10000);
  child.stdout.on('data',chunk=>{result+=chunk;});child.stderr.resume();child.on('error',()=>{clearTimeout(timer);reject(Error('Local fixture SQL could not start.'));});
  child.on('close',code=>{clearTimeout(timer);if(!failed)code===0?resolve(result.trim()):reject(Error('Local fixture SQL failed.'));});child.stdin.on('error',()=>{});child.stdin.end(query);
 });
}
async function membership(a:Actor){return localSql(`SELECT id FROM public.memberships WHERE office_id='${id(office)}' AND user_id='${id(a.uid)}';`);}
async function failOneCompletion(predicate:string){
 // nextval is intentionally outside transaction rollback: fail exactly once
 // after real Storage I/O, then permit the same persisted lease to recover.
 const fixture=`auth_lab_completion_${randomUUID().replaceAll('-','')}`;
 await localSql(`CREATE SEQUENCE private.${fixture};GRANT USAGE ON SEQUENCE private.${fixture} TO migrator;
  CREATE FUNCTION private.${fixture}() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $fixture$
  BEGIN IF ${predicate} AND nextval('private.${fixture}')=1 THEN RAISE EXCEPTION 'Synthetic local11 completion failure' USING ERRCODE='PT503';END IF;RETURN NEW;END $fixture$;
  CREATE TRIGGER ${fixture} BEFORE UPDATE ON private.file_process_leases FOR EACH ROW EXECUTE FUNCTION private.${fixture}();`);
 return ()=>localSql(`DROP TRIGGER ${fixture} ON private.file_process_leases;DROP FUNCTION private.${fixture}();DROP SEQUENCE private.${fixture};`);
}
async function setCaps(owner:Actor,a:Actor,caps:string[]){expect((await owner.sdk.rpc('team_set_member',{p_office_id:office,p_membership_id:await membership(a),p_role_code:'employee',p_active:true,p_permissions:caps,p_request_id:randomUUID()})).error).toBeNull();}
const workerCaps=['foundation.access','services.read','services.perform','requests.read','requests.create','requests.update','files.read','files.upload','files.copy'];

test('anexos reais: PDF via JWT, intenção estável, sem sobrescrita e quarentena sem scanner',async({request})=>{
 const a=await actor('fileclienta'),b=await actor('fileclientb'),owner=await actor('manager'),otherOffice=await actor('other');
 try{
  const own=await portal(request,a),payload=input(own.id);
  const intent:AttachmentIntent=await post(request,a,'/intents',{input:payload},201);
  expect(intent.bucket).toBe(attachmentBucket);expect(intent.can_upload).toBe(true);expect(intent.object_path).not.toContain(payload.name);
  const retry=await post(request,a,'/intents',{input:payload},201);expect(retry.intent_id).toBe(intent.intent_id);expect(retry.object_path).toBe(intent.object_path);
  expect((await request.post('/api/attachments/intents',{headers:a.headers,data:{office_id:office,input:{...payload,name:'outro.pdf'}}})).status()).toBe(409);
  expect((await upload(b,intent)).error).not.toBeNull();
  expect((await a.sdk.storage.from(attachmentBucket).createSignedUploadUrl(intent.object_path)).error).not.toBeNull();
  const anonymous=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  try{expect((await anonymous.storage.from(attachmentBucket).upload(intent.object_path,pdf,{contentType:'application/pdf'})).error).not.toBeNull();}finally{await anonymous.auth.dispose();}
  expect((await a.sdk.storage.from(attachmentBucket).upload(`${office}/${randomUUID()}/${randomUUID()}`,pdf,{contentType:'application/pdf'})).error).not.toBeNull();
  expect((await upload(a,intent)).error).toBeNull();
  expect((await upload(a,intent)).error).not.toBeNull();
  expect((await a.sdk.storage.from(attachmentBucket).upload(intent.object_path,pdf,{contentType:'application/pdf',upsert:true})).error).not.toBeNull();
  const after=await post(request,a,'/intents',{input:payload},201);expect(after.intent_id).toBe(intent.intent_id);expect(after.can_upload).toBe(false);
  const checked=await validate(request,a,intent);expect(checked.file).toMatchObject({id:intent.file.id,status:'quarentena',scanner_status:'not_configured',sha256:hash(pdf),can_download:false});
  expect((await a.sdk.storage.from(attachmentBucket).createSignedUrl(intent.object_path,60)).error).not.toBeNull();
  expect((await a.sdk.from('files').select('*')).error).not.toBeNull();
  expect((await validate(request,a,intent)).file.id).toBe(intent.file.id);
  for(const user of [a,b,owner,otherOffice]){
   expect((await user.sdk.storage.from(attachmentBucket).download(intent.object_path)).error).not.toBeNull();
   expect((await request.post(`/api/attachments/${intent.file.id}/download`,{headers:user.headers,data:{office_id:office}})).status()).toBe(user===b?404:user===otherOffice?403:409);
  }
  const response=await request.post('/api/attachments/search',{headers:a.headers,data:{office_id:office,request_id:own.id,page:1,size:3}});expect(response.headers()['cache-control']).toContain('no-store');
  const body=await response.text();for(const field of ['object_path','session_id','created_by','customer_id','signedUrl','source_path'])expect(body).not.toContain(`"${field}"`);
  expect(JSON.parse(body).data.items).toHaveLength(1);
  expect(await localSql(`SELECT customer_id IS NULL FROM public.requests WHERE id='${id(own.id)}';`)).toBe('t');
  expect((await request.post('/api/attachments/search',{data:{office_id:office,request_id:own.id,page:1,size:3}})).status()).toBe(401);
  expect((await a.sdk.rpc('files_process_complete',{p_office_id:office,p_lease_id:randomUUID(),p_lease_token:randomUUID(),p_results:[]})).error).not.toBeNull();
 }finally{await dispose(a,b,owner,otherOffice);}
});

test('anexos reais: tipos enganosos, excesso de10MiB, hash, tamanho e upload ausente nunca ficam disponíveis',async({request})=>{
 const a=await actor('fileclienta');try{
  const own=await portal(request,a);
  for(const invalid of [{name:'arquivo.exe'},{name:'arquivo.png'},{mime_type:'image/png'},{mime_type:'application/octet-stream'},{size_bytes:attachmentMaxBytes+1}]){
   expect((await request.post('/api/attachments/intents',{headers:a.headers,data:{office_id:office,input:{...input(own.id),...invalid}}})).status()).toBe(422);
  }
  const cases=[
   {bytes:Buffer.from('MZ Este nao e um PDF ficticio'),reason:'type_mismatch'},
   {bytes:pdf,sha256:'0'.repeat(64),reason:'hash_mismatch'},
   {bytes:pdf,size_bytes:pdf.length-1,reason:'size_mismatch'},
  ];
  for(const fixture of cases){
   const intent=await begin(request,a,own.id,{size_bytes:fixture.bytes.length,sha256:hash(fixture.bytes),...('sha256'in fixture?{sha256:fixture.sha256}:{}),...('size_bytes'in fixture?{size_bytes:fixture.size_bytes}:{} )});
   expect((await upload(a,intent,fixture.bytes)).error).toBeNull();
   const result=await validate(request,a,intent);expect(result.file).toMatchObject({status:'rejeitado',validation_reason:fixture.reason,can_download:false});
   expect((await a.sdk.storage.from(attachmentBucket).download(intent.object_path)).error).not.toBeNull();
  }
  const missing=await begin(request,a,own.id);expect((await validate(request,a,missing)).file).toMatchObject({status:'aguardando_upload',validation_reason:'object_missing',can_download:false});
  expect((await upload(a,missing)).error).toBeNull();expect((await validate(request,a,missing)).file).toMatchObject({status:'quarentena',scanner_status:'not_configured'});
  const huge=Buffer.alloc(attachmentMaxBytes+1,32);pdf.copy(huge);const excess=await begin(request,a,own.id,{size_bytes:attachmentMaxBytes,sha256:hash(huge)});
  expect((await upload(a,excess,huge)).error).not.toBeNull();
  expect((await validate(request,a,excess)).file).toMatchObject({status:'aguardando_upload',validation_reason:'object_missing',can_download:false});
 }finally{await dispose(a);}
});

test('anexos reais: portal A/B, envio próprio, atribuição atual e capacidades revogadas',async({request})=>{
 const a=await actor('fileclienta'),b=await actor('fileclientb'),owner=await actor('manager'),worker=await actor('fileworker');
 try{
  const own=await portal(request,a),other=await portal(request,b),intent=await begin(request,a,own.id);
  expect((await upload(a,intent)).error).toBeNull();await validate(request,a,intent);
  expect((await request.post('/api/attachments/intents',{headers:b.headers,data:{office_id:office,input:input(own.id)}})).status()).toBe(404);
  const theirOptions=await post(request,b,'/requests',{query:own.protocol,page:1,size:3});expect(theirOptions.items).toHaveLength(0);
  expect((await post(request,b,'/search',{request_id:other.id,page:1,size:3})).items).toHaveLength(0);
  const staff=await begin(request,owner,own.id);expect((await upload(owner,staff)).error).toBeNull();await validate(request,owner,staff);
  expect((await post(request,a,'/search',{request_id:own.id,page:1,size:5})).items.map((f:any)=>f.id)).toEqual([intent.file.id]);
  expect((await request.post('/api/attachments/search',{headers:worker.headers,data:{office_id:office,request_id:own.id,page:1,size:3}})).status()).toBe(404);
  const current=await data(await request.post(`/api/requests/${own.id}/detail`,{headers:owner.headers,data:{office_id:office,page:1}}));
  await data(await request.post(`/api/requests/${own.id}/actions`,{headers:owner.headers,data:{office_id:office,expected_version:current.version,mutation:{kind:'transfer',assignee_id:await membership(worker),reason:'Atribuição fictícia para verificar escopo11'}}}));
  expect((await post(request,worker,'/search',{request_id:own.id,page:1,size:3})).total).toBe(2);
  const pending=await begin(request,worker,own.id);
  await setCaps(owner,worker,workerCaps.filter(cap=>cap!=='files.upload'));
  expect((await upload(worker,pending)).error).not.toBeNull();
  expect((await request.post('/api/attachments/process',{headers:worker.headers,data:{office_id:office,action:'validate',args:{intent_id:pending.intent_id}}})).status()).toBe(403);
  await setCaps(owner,worker,workerCaps.filter(cap=>cap!=='requests.read'));
  expect((await request.post('/api/attachments/search',{headers:worker.headers,data:{office_id:office,request_id:own.id,page:1,size:3}})).status()).toBe(403);
  await setCaps(owner,worker,workerCaps.filter(cap=>cap!=='files.read'));
  expect((await request.post('/api/attachments/search',{headers:worker.headers,data:{office_id:office,request_id:own.id,page:1,size:3}})).status()).toBe(403);
 }finally{await setCaps(owner,worker,workerCaps);await dispose(a,b,owner,worker);}
});

test('anexos reais: JWT de sessão encerrada perde upload e metadados',async({request})=>{
 const a=await actor('filerevoked');try{
  const own=await portal(request,a),intent=await begin(request,a,own.id);const token=a.headers.Authorization;
  expect((await a.sdk.auth.signOut({scope:'global'})).error).toBeNull();
  const response=await fetch(`${url}/storage/v1/object/${attachmentBucket}/${intent.object_path}`,{method:'POST',headers:{apikey:key,Authorization:token,'content-type':'application/pdf','x-upsert':'false'},body:pdf});expect(response.ok).toBe(false);
  expect((await request.post('/api/attachments/search',{headers:{Authorization:token},data:{office_id:office,request_id:own.id,page:1,size:3}})).status()).toBe(401);
 }finally{await dispose(a);}
});

test('anexos reais: item obrigatório e política independente preservam snapshot do atendimento',async({request})=>{
 const owner=await actor('manager'),worker=await actor('fileworker');try{
  const service=await data(await request.post('/api/services',{headers:owner.headers,data:{office_id:office,service:{...emptyService,code:`F11-${randomUUID().slice(0,8).toUpperCase()}`,name:'Serviço fictício com anexo11',category:'Laboratório',price_cents:50},reason:'Fixture sintética local11'}}),201);
  const own=await data(await request.post('/api/requests',{headers:worker.headers,data:{office_id:office,idempotency_key:randomUUID(),request:{origin:'presencial',title:'Atendimento fictício com item11',customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:2,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}}}),201);
  const item=own.items[0];
  for(const request_item_id of [null,randomUUID()])expect((await request.post('/api/attachments/intents',{headers:worker.headers,data:{office_id:office,input:input(own.id,{request_item_id})}})).status()).toBe(422);
  const intent=await begin(request,worker,own.id,{request_item_id:item.id});
  expect(await post(request,owner,'/policy',{service_id:service.id})).toMatchObject({version:1,max_bytes:attachmentMaxBytes});
  const policy=await post(request,owner,'/policy/update',{service_id:service.id,expected_version:1,max_bytes:pdf.length-1,mime_types:['application/pdf'],reason:'Limite menor fictício para verificar política11'});expect(policy.version).toBe(2);
  expect((await request.post('/api/attachments/policy/update',{headers:owner.headers,data:{office_id:office,service_id:service.id,expected_version:1,max_bytes:pdf.length,mime_types:['application/pdf'],reason:'Versão obsoleta fictícia'}})).status()).toBe(409);
  expect((await request.post('/api/attachments/intents',{headers:worker.headers,data:{office_id:office,input:input(own.id,{request_item_id:item.id})}})).status()).toBe(422);
  expect((await request.post('/api/attachments/policy',{headers:worker.headers,data:{office_id:office,service_id:service.id}})).status()).toBe(403);
  expect((await upload(worker,intent)).error).toBeNull();expect((await validate(request,worker,intent)).file.status).toBe('quarentena');
  const after=await data(await request.post(`/api/requests/${own.id}/detail`,{headers:worker.headers,data:{office_id:office,page:1}}));expect(after.items[0].snapshot).toEqual(item.snapshot);expect(after.items[0].snapshot.total_cents).toBe(100);
 }finally{await dispose(owner,worker);}
});

test('anexos reais: cópia privada de fixture clean cria outro objeto e mantém quarentena',async({request})=>{
 const owner=await actor('manager'),a=await actor('fileclienta'),b=await actor('fileclientb');try{
  const own=await portal(request,a),target=await portal(request,b),source=await begin(request,a,own.id);expect((await upload(a,source)).error).toBeNull();await validate(request,a,source);
  // Local administrator fixture ONLY. No production RPC or scanner release.
  await localSql(`UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id='${id(source.file.id)}';`);
  const authorized=await post(request,a,`/${source.file.id}/download`,{});expect(authorized.object_path).toBe(source.object_path);expect(authorized).not.toHaveProperty('url');
  const downloaded=await a.sdk.storage.from(attachmentBucket).download(source.object_path);expect(downloaded.error).toBeNull();expect(hash(Buffer.from(await downloaded.data!.arrayBuffer()))).toBe(hash(pdf));
  expect((await a.sdk.storage.from(attachmentBucket).createSignedUrl(source.object_path,60)).error).not.toBeNull();
  expect((await a.sdk.storage.from(attachmentBucket).createSignedUploadUrl(source.object_path)).error).not.toBeNull();
  const listed=await a.sdk.storage.from(attachmentBucket).list(source.object_path.split('/').slice(0,-1).join('/'));expect(listed.data??[]).toHaveLength(0);
  expect((await b.sdk.storage.from(attachmentBucket).download(source.object_path)).error).not.toBeNull();
  const args={source_file_id:source.file.id,target_request_id:target.id,target_item_id:null,idempotency_key:randomUUID()};
  const removeFault=await failOneCompletion(`NEW.action='copy' AND EXISTS(SELECT FROM private.upload_intents WHERE id=NEW.target_id AND source_file_id='${id(source.file.id)}')`);
  let copied;
  try{
   expect((await request.post('/api/attachments/process',{headers:owner.headers,data:{office_id:office,action:'copy',args}})).status()).toBe(503);
   expect(await localSql(`SELECT count(*)=1 AND bool_and(f.status='aguardando_upload') FROM private.upload_intents i JOIN public.files f ON f.id=i.file_id JOIN storage.objects o ON o.bucket_id=i.bucket AND o.name=i.object_path WHERE i.source_file_id='${id(source.file.id)}';`)).toBe('t');
   copied=await post(request,owner,'/process',{action:'copy',args});
  }finally{await removeFault();}
  expect(copied.file).toMatchObject({status:'quarentena',scanner_status:'not_configured',sha256:hash(pdf),can_download:false});expect(copied.file.id).not.toBe(source.file.id);
  expect((await post(request,owner,'/process',{action:'copy',args})).file.id).toBe(copied.file.id);
  expect((await request.post('/api/attachments/process',{headers:owner.headers,data:{office_id:office,action:'copy',args:{...args,target_request_id:own.id}}})).status()).toBe(409);
  expect(await localSql(`SELECT (i.object_path<>s.object_path AND f.actual_sha256='${hash(pdf)}' AND EXISTS(SELECT FROM storage.objects o WHERE o.bucket_id=i.bucket AND o.name=i.object_path)) FROM public.files f JOIN private.upload_intents i ON i.file_id=f.id CROSS JOIN private.upload_intents s WHERE f.id='${id(copied.file.id)}' AND s.file_id='${id(source.file.id)}';`)).toBe('t');
  expect((await request.post(`/api/attachments/${copied.file.id}/download`,{headers:owner.headers,data:{office_id:office}})).status()).toBe(409);
  expect((await post(request,b,'/search',{request_id:target.id,page:1,size:3})).items).toHaveLength(0);
 }finally{await dispose(owner,a,b);}
});

test('anexos reais: plano antes da limpeza preserva proteção, referência, retenção e quarentena',async({request})=>{
 const owner=await actor('manager'),a=await actor('fileclienta');try{
  const own=await portal(request,a),fixtures:Record<string,AttachmentIntent>={};
  for(const kind of ['eligible','expired','protected','reference','hold','retention','quarantine','available']){
   const intent=await begin(request,a,own.id,{sha256:['expired','quarantine','available'].includes(kind)?hash(pdf):'0'.repeat(64)});fixtures[kind]=intent;expect((await upload(a,intent)).error).toBeNull();if(kind!=='expired')await validate(request,a,intent);
  }
  await localSql(`UPDATE private.upload_intents SET expires_at=clock_timestamp()-interval '1 minute' WHERE id='${id(fixtures.expired.intent_id)}';
   UPDATE public.files SET protected=true WHERE id='${id(fixtures.protected.file.id)}';
   INSERT INTO private.file_references(office_id,file_id,reference_kind) VALUES('${id(office)}','${id(fixtures.reference.file.id)}','fixture_local11');
   UPDATE public.files SET legal_hold=true WHERE id='${id(fixtures.hold.file.id)}';
   UPDATE public.files SET retain_until=clock_timestamp()+interval '1 day' WHERE id='${id(fixtures.retention.file.id)}';
   UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id='${id(fixtures.available.file.id)}';`);
  expect((await request.post('/api/attachments/process',{headers:owner.headers,data:{office_id:office,action:'cleanup',args:{plan_id:randomUUID()}}})).status()).toBe(404);
  const plan=await post(request,owner,'/cleanup-plan',{});expect(plan.count).toBeGreaterThanOrEqual(2);expect(plan.orphan_count).toBeGreaterThanOrEqual(1);
  const removeFault=await failOneCompletion(`NEW.action='cleanup' AND NEW.target_id='${id(plan.id)}'`);
  let result;
  try{
   expect((await request.post('/api/attachments/process',{headers:owner.headers,data:{office_id:office,action:'cleanup',args:{plan_id:plan.id}}})).status()).toBe(503);
   expect(await localSql(`SELECT f.status<>'removido' AND NOT EXISTS(SELECT FROM storage.objects o JOIN private.upload_intents i ON i.bucket=o.bucket_id AND i.object_path=o.name WHERE i.file_id=f.id) FROM public.files f WHERE id='${id(fixtures.eligible.file.id)}';`)).toBe('t');
   // Storage removal is already complete; retry must confirm absent objects and
   // finish the persisted DB reservation without touching protected fixtures.
   result=await post(request,owner,'/process',{action:'cleanup',args:{plan_id:plan.id}});
  }finally{await removeFault();}
  expect(result.removed).toBeGreaterThanOrEqual(2);expect(result.pending).toBe(0);
  for(const kind of ['eligible','expired'])expect(await localSql(`SELECT f.status='removido' AND NOT EXISTS(SELECT FROM storage.objects o JOIN private.upload_intents i ON i.bucket=o.bucket_id AND i.object_path=o.name WHERE i.file_id=f.id) FROM public.files f WHERE id='${id(fixtures[kind].file.id)}';`)).toBe('t');
  for(const kind of ['protected','reference','hold','retention','quarantine','available'])expect(await localSql(`SELECT f.status<>'removido' AND EXISTS(SELECT FROM storage.objects o JOIN private.upload_intents i ON i.bucket=o.bucket_id AND i.object_path=o.name WHERE i.file_id=f.id) FROM public.files f WHERE id='${id(fixtures[kind].file.id)}';`)).toBe('t');
  const unknown=process.env.AUTH_LAB_UNKNOWN_OBJECT_PATH!;expect(unknown.split('/').map(id)).toHaveLength(3);
  expect(await localSql(`SELECT count(*) FROM storage.objects WHERE bucket_id='request-attachments' AND name='${unknown}';`)).toBe('1');
  expect((await post(request,owner,'/process',{action:'cleanup',args:{plan_id:plan.id}})).removed).toBe(result.removed);
 }finally{await dispose(owner,a);}
});

test('anexos reais: navegador cliente envia PDF pelo Storage e recebe quarentena persistida',async({page,request})=>{
 const a=await actor('fileclientb');try{
  const own=await portal(request,a);
  await page.setViewportSize({width:360,height:640});await page.goto('/login-cliente');
  await page.getByLabel('E-mail',{exact:true}).fill('fileclientb@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Entrar na área do cliente',exact:true}).click();await expect(page).toHaveURL('/area-cliente');
  await page.locator('.operation-shortcuts').getByRole('link',{name:/Anexos privados/}).click();await expect(page).toHaveURL('/meus-anexos');
  await page.getByRole('button',{name:'Selecionar solicitação',exact:true}).click();await page.getByRole('searchbox',{name:'Buscar solicitação',exact:true}).fill(own.protocol);
  await page.getByRole('button',{name:`Escolher ${own.protocol} · ${own.title}`,exact:true}).click();
  await page.getByLabel('Arquivo',{exact:true}).setInputFiles({name:'pdf-ui-ficticio.pdf',mimeType:'application/pdf',buffer:pdf});
  const intention=page.waitForResponse(r=>r.url().endsWith('/api/attachments/intents'));
  const stored=page.waitForResponse(r=>r.request().method()==='POST'&&r.url().includes('/storage/v1/object/request-attachments/'));
  const completed=page.waitForResponse(r=>r.url().endsWith('/api/attachments/process'));
  await page.getByRole('button',{name:'Enviar arquivo',exact:true}).click();
  const intended=await intention;expect(intended.status()).toBe(201);const intent:AttachmentIntent=(await intended.json()).data;expect((await stored).ok()).toBe(true);
  const processed=await completed;expect(processed.status()).toBe(200);expect((await processed.json()).data.file).toMatchObject({id:intent.file.id,status:'quarentena',scanner_status:'not_configured',sha256:hash(pdf)});
  await expect(page.getByRole('status')).toContainText('mantido em quarentena');await expect(page.getByRole('list',{name:'Arquivos privados'})).toContainText('pdf-ui-ficticio.pdf');
  await expect(page.getByRole('button',{name:/Baixar/})).toHaveCount(0);await expect(page.locator('[role="progressbar"],.spinner,.loading-overlay')).toHaveCount(0);
  expect((await post(request,a,'/search',{request_id:own.id,page:1,size:3})).items).toEqual(expect.arrayContaining([expect.objectContaining({id:intent.file.id,status:'quarentena'})]));
  expect((await a.sdk.storage.from(attachmentBucket).download(intent.object_path)).error).not.toBeNull();
 }finally{await dispose(a);}
});
