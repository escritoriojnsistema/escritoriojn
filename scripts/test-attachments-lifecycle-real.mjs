import assert from 'node:assert/strict';
import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {app} from '../server/app.ts';
import {emptyService} from '../shared/services.ts';

// Real disposable GoTrue, PostgREST and Storage providers. Never load .env or
// hosted credentials. Fixtures/grants below belong exclusively to this lab.
let lab,server;
const clients=[],proof={proof:'attachments-lifecycle-real-local',date_utc:new Date().toISOString().slice(0,10),hosted_writes:false,scanner_configured:false,checks:{}};
const passed=name=>{assert.equal(proof.checks[name],undefined);proof.checks[name]=true;console.log('PASS '+name);};
const hash=b=>createHash('sha256').update(b).digest('hex');
const pdf=Buffer.from('%PDF-1.4\n% ARQUIVO FICTICIO LOCAL\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jT0sAAAAASUVORK5CYII=','base64');
try {
 lab=await createAuthLab({storage:true,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});
 assert.match(lab.url,/^http:\/\/127\.0\.0\.1:\d+$/);assert.match(lab.databaseContainer,/^jn-auth-lab-[a-f0-9-]+-postgres$/);
 await lab.migrate();process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;};
 const service=sdk(lab.serviceRoleKey),users={},actors={},tokens={},suffix=randomUUID().slice(0,8),password='Ficticio-'+randomBytes(24).toString('hex')+'!';
 for(const name of ['owner','admin','employee','client','other','foreign']){const r=await service.auth.admin.createUser({email:`attachments-${suffix}-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Laboratório FICTÍCIO anexos','${randomUUID()}');`,'migrator')).trim();
 const foreignOffice=randomUUID();
 await lab.sql(`INSERT INTO public.offices(id,name)VALUES('${foreignOffice}','Outro laboratório FICTÍCIO');INSERT INTO public.profiles(id,display_name)VALUES('${users.foreign}','Pessoa FICTÍCIA outro escritório');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${foreignOffice}','${users.foreign}','owner');`,'migrator');
 for(const name of ['admin','employee','client','other'])await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users[name]}','Pessoa FICTÍCIA anexos');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users[name]}','${['admin','employee'].includes(name)?name:'client'}');`,'migrator');
 const caps=['foundation.access','services.read','services.perform','requests.read','requests.read_all','requests.create','requests.update','requests.transfer','files.read','files.upload','files.copy','files.manage'];
 await lab.sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)SELECT m.id,p.code FROM public.memberships m CROSS JOIN public.permissions p WHERE m.office_id='${office}' AND m.user_id IN('${users.admin}','${users.employee}') AND p.code IN(${caps.map(c=>`'${c}'`).join(',')});`,'migrator');
 const login=async(name,key=name)=>{const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`attachments-${suffix}-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);actors[key]=c;tokens[key]=r.data.session.access_token;return c;};
 for(const name of Object.keys(users))await login(name);
 await login('client','secondSession');
 server=createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const data=async(name,path,body={},status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});const result=await r.json();assert.equal(r.status,status,`${name} ${path}: HTTP ${r.status} ${JSON.stringify(result)}`);assert.match(r.headers.get('cache-control')??'',/no-store/);return result.data??result.error;};
 const fixtureCategoryName='Categoria FICTÍCIA anexos '+suffix;
 const fixtureCategories=await data('owner','categories/command',{command:{kind:'create',name:fixtureCategoryName,execution_level:3,reason:'Categoria exclusivamente local'},idempotency_key:randomUUID()});
 const fixtureCategory=fixtureCategories.items.find(x=>x.name===fixtureCategoryName);assert.ok(fixtureCategory);
 const initialForm=await data('owner','category-intake/form',{category_id:fixtureCategory.id,manage:true});
 await data('owner','category-intake/publish',{category_id:fixtureCategory.id,key:randomUUID(),command:{expected_revision:initialForm.revision,enabled:true,instructions:'Informações exclusivamente FICTÍCIAS',fields:[{key:'observacao',label:'Observação FICTÍCIA',type:'text',required:false,options:[]}],documents:[],reason:'Publicação exclusivamente local'}});
 const fixtureForm=await data('client','category-intake/form',{category_id:fixtureCategory.id,manage:false});
 const request=async(name='client')=>{const opened=await data(name,'category-intake/open',{category_id:fixtureCategory.id,revision:fixtureForm.revision,answers:{},message:'Anexos FICTÍCIOS exclusivamente locais.',key:randomUUID()});assert.equal(opened.draft,true);const state=await data(name,'category-intake/state',{request_id:opened.request_id});const sent=await data(name,'category-intake/command',{request_id:opened.request_id,version:state.version,command:{kind:'submit'},key:randomUUID()});assert.equal(sent.draft,false);return {id:opened.request_id,protocol:opened.protocol};};
 const own=await request(),other=await request('other');
 assert.equal((await lab.sql(`SELECT status IN('aberto','aguardando_responsavel','em_atendimento') FROM public.requests WHERE id='${own.id}';`)).trim(),'t');
 const options=await data('client','attachments/requests',{query:own.protocol,page:1,size:5});assert.equal(options.items.find(x=>x.id===own.id)?.can_work,true);
 assert.equal((await data('client','attachments/requests',{query:own.id,page:1,size:5})).items.find(x=>x.id===own.id)?.can_work,true);
 const upload=async(name,req,{bytes=pdf,mime='application/pdf',classification='documento',item=null}={})=>{
  const input={request_id:req.id,request_item_id:item,name:mime==='image/png'?'imagem-ficticia.png':'arquivo-ficticio.pdf',mime_type:mime,size_bytes:bytes.length,sha256:hash(bytes),classification,idempotency_key:randomUUID()};
  const intent=await data(name,'attachments/intents',{input},201);assert.equal(intent.can_upload,true);
  await data(name,`attachments/${intent.file.id}/preview`,{},409);
  assert.ifError((await actors[name].storage.from(intent.bucket).upload(intent.object_path,bytes,{contentType:mime,upsert:false})).error);
  const processed=await data(name,'attachments/process',{action:'validate',args:{intent_id:intent.intent_id}});
  assert.equal(processed.file.status,'quarentena');assert.equal(processed.file.scanner_status,'not_configured');assert.equal(processed.file.can_download,false);assert.equal(processed.file.can_copy,false);assert.equal(processed.file.can_preview,true);
  return {...intent,file:processed.file,bytes,input};
 };
 const preview=async(name,f)=>{const p=await data(name,`attachments/${f.file.id}/preview`);assert.deepEqual(Object.keys(p).sort(),['bucket','object_path','name','mime_type','size_bytes','sha256'].sort());assert.equal(p.object_path,f.object_path);assert.equal(p.size_bytes,f.bytes.length);assert.equal(p.sha256,hash(f.bytes));const r=await actors[name].storage.from(p.bucket).download(p.object_path);assert.ifError(r.error);assert.ok(r.data);const b=Buffer.from(await r.data.arrayBuffer());assert.equal(b.length,p.size_bytes);assert.equal(hash(b),p.sha256);assert.deepEqual(await data(name,`attachments/${f.file.id}/preview`),p);};
 const version=async f=>JSON.parse((await lab.sql(`SELECT to_json(updated_at) FROM public.files WHERE id='${f.file.id}';`)).trim());
 const exists=async f=>(await lab.sql(`SELECT EXISTS(SELECT FROM storage.objects WHERE bucket_id='${f.bucket}' AND name='${f.object_path}');`)).trim()==='t';
 const begin=async(name,f,key=randomUUID(),status=200)=>{const body={expected_updated_at:await version(f),key};const command=await data(name,`attachments/${f.file.id}/delete`,body,status);return {command,body};};
 const complete=(name,command,key,status=200)=>data(name,'attachments/delete/complete',{command_id:command.id,key},status);
 const remove=async(name,f,allowed)=>{const r=await actors[name].storage.from(f.bucket).remove([f.object_path]);if(allowed)assert.ifError(r.error);assert.equal(await exists(f),!allowed,`${name}: Storage object absence must match authorization`);};
 const purge=async(name,f)=>{const {command,body}=await begin(name,f);assert.equal(command.completed,false);assert.equal(command.object_path,f.object_path);await complete(name,command,body.key,409);await remove(name,f,true);assert.deepEqual(await complete(name,command,body.key),{deleted:true,file_id:f.file.id});assert.deepEqual(await complete(name,command,body.key),{deleted:true,file_id:f.file.id});assert.deepEqual(await data(name,`attachments/${f.file.id}/delete`,body),{id:command.id,file_id:f.file.id,bucket:null,object_path:null,completed:true});assert.equal((await lab.sql(`SELECT NOT EXISTS(SELECT FROM public.files WHERE id='${f.file.id}') AND NOT EXISTS(SELECT FROM private.upload_intents WHERE file_id='${f.file.id}') AND NOT EXISTS(SELECT FROM storage.objects WHERE bucket_id='${f.bucket}' AND name='${f.object_path}') AND(SELECT count(*)=1 FROM public.audit_events WHERE target_id='${f.file.id}' AND action='files.deleted');`)).trim(),'t');};
 const file=await upload('client',own),image=await upload('client',own,{bytes:png,mime:'image/png'});
 await preview('client',file);await preview('client',image);passed('own_submitted_portal_pdf_png_real_upload_validation_private_preview');
 for(const name of ['other','foreign']){await data(name,`attachments/${file.file.id}/preview`,{},name==='other'?404:403);await begin(name,file,randomUUID(),name==='other'?404:403);assert.ok((await actors[name].storage.from(file.bucket).download(file.object_path)).error);await remove(name,file,false);}
 await data('client',`attachments/${file.file.id}/preview`,{office_id:foreignOffice},403);
 await data('other','attachments/intents',{input:file.input},404);
 assert.equal((await data('other','attachments/search',{request_id:other.id,page:1,size:5})).total,0);
 passed('cross_client_office_request_and_storage_isolation');
 await data('client',`attachments/${file.file.id}/download`,{},409);
 await data('owner','attachments/process',{action:'copy',args:{source_file_id:file.file.id,target_request_id:own.id,target_item_id:null,idempotency_key:randomUUID()}},409);
 assert.ok((await actors.client.storage.from(file.bucket).createSignedUrl(file.object_path,60)).error);
 const listing=await actors.client.storage.from(file.bucket).list(office);assert.ok(listing.error||listing.data.length===0);
 assert.ok((await actors.client.storage.from(file.bucket).copy(file.object_path,`${office}/${randomUUID()}/${randomUUID()}`)).error);
 assert.equal((await lab.sql(`SELECT bool_and(status='quarentena' AND scanner_status='not_configured') FROM public.files WHERE id IN('${file.file.id}','${image.file.id}');`)).trim(),'t');
 passed('quarantine_no_release_copy_sign_or_bucket_listing');
 await remove('client',file,false); // An ordinary preview never authorizes deletion.
 for(const fixture of [{set:'protected=true',clear:'protected=false'},{set:'legal_hold=true',clear:'legal_hold=false'},{set:"retain_until=clock_timestamp()+interval '1 day'",clear:'retain_until=NULL'}]){await lab.sql(`UPDATE public.files SET ${fixture.set} WHERE id='${file.file.id}';`,'migrator');const e=await begin('client',file,randomUUID(),409);assert.equal(e.command.code,'FILE_PROTECTED');await lab.sql(`UPDATE public.files SET ${fixture.clear} WHERE id='${file.file.id}';`,'migrator');}
 await lab.sql(`INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES('${office}','${file.file.id}','local_fictional_reference');`,'migrator');assert.equal((await begin('client',file,randomUUID(),409)).command.code,'FILE_IN_USE');await lab.sql(`DELETE FROM private.file_references WHERE file_id='${file.file.id}';`,'migrator');
 await data('client',`attachments/${file.file.id}/delete`,{expected_updated_at:'2000-01-01T00:00:00Z',key:randomUUID()},409);
 passed('protection_legal_hold_retention_reference_and_stale_version_block_delete');
 const reserved=await begin('client',file);assert.deepEqual((await data('client',`attachments/${file.file.id}/delete`,reserved.body)),reserved.command);
 await data('client',`attachments/${file.file.id}/preview`,{},409);await complete('client',reserved.command,reserved.body.key,409);
 await begin('client',file,randomUUID(),409);
 await assert.rejects(()=>lab.sql(`INSERT INTO private.file_references(office_id,file_id,reference_kind)VALUES('${office}','${file.file.id}','late_local_reference');`,'migrator'),/FILE_DELETE_PENDING/);
 await assert.rejects(()=>lab.sql(`UPDATE public.files SET legal_hold=true WHERE id='${file.file.id}';`,'migrator'),/FILE_DELETE_PENDING/);
 for(const name of ['other','secondSession','owner']){await complete(name,reserved.command,reserved.body.key,404);await remove(name,file,false);}
 await data('secondSession',`attachments/${file.file.id}/delete`,reserved.body,409);
 await remove('client',file,true);assert.deepEqual(await complete('client',reserved.command,reserved.body.key),{deleted:true,file_id:file.file.id});
 assert.deepEqual(await data('client',`attachments/${file.file.id}/delete`,reserved.body),{...reserved.command,bucket:null,object_path:null,completed:true});
 assert.equal((await lab.sql(`SELECT NOT EXISTS(SELECT FROM public.files WHERE id='${file.file.id}') AND NOT EXISTS(SELECT FROM private.upload_intents WHERE file_id='${file.file.id}');`)).trim(),'t');
 passed('reserved_delete_real_storage_purge_idempotency_and_exact_actor_session');
 await purge('client',image);passed('png_physically_deleted_without_false_archiving');

 // Staff requires current grants AND actual responsibility. Role names alone
 // are never used as authority in these local fixture assignments.
 const membership={};for(const name of ['owner','admin','employee'])membership[name]=(await lab.sql(`SELECT id FROM public.memberships WHERE office_id='${office}' AND user_id='${users[name]}';`,'migrator')).trim();
 const assign=async(name,r)=>lab.sql(`UPDATE private.request_assignments SET ended_at=clock_timestamp() WHERE request_id='${r.id}' AND ended_at IS NULL;UPDATE public.requests SET assignee_id='${membership[name]}' WHERE id='${r.id}';INSERT INTO private.request_assignments(office_id,request_id,membership_id,actor_id)VALUES('${office}','${r.id}','${membership[name]}','${users.owner}');`,'migrator');
 for(const name of ['owner','admin','employee']){await assign(name,own);const f=await upload(name,own);await preview(name,f);await data('client',`attachments/${f.file.id}/preview`,{},404);await purge(name,f);}
 passed('owner_admin_employee_current_grants_responsibility_preview_and_purge');
 await assign('employee',own);const revoked=await upload('employee',own);await preview('employee',revoked);
 const job=await begin('employee',revoked);
 await lab.sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${membership.employee}' AND permission_code='files.manage';`,'migrator');
 await remove('employee',revoked,false);await complete('employee',job.command,job.body.key,409);
 await lab.sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${membership.employee}','files.manage');`,'migrator');
 await remove('employee',revoked,true);
 await lab.sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${membership.employee}' AND permission_code='files.read';`,'migrator');
 await data('employee',`attachments/${revoked.file.id}/preview`,{},403);
 assert.deepEqual(await complete('employee',job.command,job.body.key),{deleted:true,file_id:revoked.file.id});
 await lab.sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${membership.employee}','files.read');`,'migrator');
 passed('live_capability_loss_blocks_storage_delete_and_post_removal_completion_recovers');
 const scope=await upload('employee',own);await preview('employee',scope);await assign('owner',own);
 await lab.sql(`DELETE FROM private.team_member_permissions WHERE membership_id='${membership.employee}' AND permission_code='requests.read';`,'migrator');
 await data('employee',`attachments/${scope.file.id}/preview`,{},403);assert.ok((await actors.employee.storage.from(scope.bucket).download(scope.object_path)).error);
 await lab.sql(`INSERT INTO private.team_member_permissions(membership_id,permission_code)VALUES('${membership.employee}','requests.read');`,'migrator');
 await purge('owner',scope);passed('second_preview_and_storage_recheck_live_request_capability');

 // Exercise the existing sensitive30 gate using its real public setup APIs.
 const categoryName='Categoria FICTÍCIA sensível '+suffix;
 const categories=await data('owner','categories/command',{command:{kind:'create',name:categoryName,execution_level:3,reason:'Categoria exclusivamente local'},idempotency_key:randomUUID()});const category=categories.items.find(x=>x.name===categoryName);assert.ok(category);
 const customer=await data('owner','customers',{customer:{kind:'person',name:'Pessoa FICTÍCIA sensível',identifier:'',contacts:[]}},201);
 const svc=await data('owner','services',{service:{...emptyService,code:'LOCAL-'+suffix.toUpperCase(),name:'Serviço FICTÍCIO sensível',category:categoryName,price_cents:100},reason:'Serviço exclusivamente local'},201);
 const sensitive=await data('client','requests',{request:{origin:'portal',title:'Pedido FICTÍCIO sensível',message:'Conferência exclusivamente local',category_id:category.id},idempotency_key:randomUUID()},201);
 const before=await data('owner',`requests/${sensitive.id}/detail`,{page:1});const triage=await data('owner',`requests/${sensitive.id}/actions`,{expected_version:before.version,mutation:{kind:'triage',customer_id:customer.id,items:[{service_id:svc.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}],reason:'Conferência FICTÍCIA local'}});
 await data('owner','checklists/model/publish',{service_id:svc.id,expected_version:0,definition:{name:'Checklist FICTÍCIO',items:[{key:'documento',label:'Documento FICTÍCIO',requirement:'required',condition:null}]},reason:'Modelo FICTÍCIO local',scope:'internal'});
 await data('owner','specialized/command',{request_id:sensitive.id,command:{kind:'configure',item_id:triage.items[0].id,service_kind:'aposentadoria',expected_version:0},key:randomUUID()});
 await data('owner','specialized/command',{request_id:sensitive.id,command:{kind:'open',item_id:triage.items[0].id},key:randomUUID()});
 const medical=await upload('owner',sensitive,{classification:'medico',item:triage.items[0].id});await preview('owner',medical);await assign('employee',sensitive);
 for(const name of ['client','employee','admin']){await data(name,`attachments/${medical.file.id}/preview`,{},404);await begin(name,medical,randomUUID(),name==='admin'?403:404);assert.ok((await actors[name].storage.from(medical.bucket).download(medical.object_path)).error);await remove(name,medical,false);}
 passed('sensitive30_medical_bytes_preview_and_deletion_do_not_expand_grants');
 // Simulate only elapsed reservation time, never provider bytes or identity.
 // An explicitly reauthorized command from a new GoTrue session can reclaim it;
 // the old valid JWT must lose both Storage removal and completion authority.
 const abandoned=await upload('client',own),abandonedJob=await begin('client',abandoned);
 await login('client','recoverySession');
 const oldSid=JSON.parse(Buffer.from(tokens.client.split('.')[1],'base64url').toString()).session_id;
 const newSid=JSON.parse(Buffer.from(tokens.recoverySession.split('.')[1],'base64url').toString()).session_id;assert.notEqual(oldSid,newSid);
 const recoveryKey=randomUUID();assert.equal((await begin('recoverySession',abandoned,recoveryKey,409)).command.code,'FILE_DELETE_PENDING');
 await complete('recoverySession',abandonedJob.command,abandonedJob.body.key,404);
 await lab.sql(`UPDATE private.file_deletions SET expires_at=clock_timestamp()-interval '1 minute' WHERE id='${abandonedJob.command.id}';`,'migrator');
 const recoverable=await data('recoverySession','attachments/search',{request_id:own.id,page:1,size:5});assert.equal(recoverable.items.find(f=>f.id===abandoned.file.id)?.can_delete,true);
 const reclaimed=await begin('recoverySession',abandoned,recoveryKey);assert.equal(reclaimed.command.id,abandonedJob.command.id);assert.equal(reclaimed.command.completed,false);assert.equal(reclaimed.command.object_path,abandoned.object_path);
 await remove('client',abandoned,false);await complete('client',abandonedJob.command,abandonedJob.body.key,404);await complete('client',reclaimed.command,recoveryKey,404);
 await complete('recoverySession',reclaimed.command,recoveryKey,409);
 await remove('recoverySession',abandoned,true);assert.deepEqual(await complete('recoverySession',reclaimed.command,recoveryKey),{deleted:true,file_id:abandoned.file.id});
 assert.deepEqual(await data('recoverySession',`attachments/${abandoned.file.id}/delete`,reclaimed.body),{id:reclaimed.command.id,file_id:abandoned.file.id,bucket:null,object_path:null,completed:true});
 assert.equal((await lab.sql(`SELECT NOT EXISTS(SELECT FROM public.files WHERE id='${abandoned.file.id}') AND NOT EXISTS(SELECT FROM private.upload_intents WHERE file_id='${abandoned.file.id}') AND(SELECT count(*)=1 FROM public.audit_events WHERE target_id='${abandoned.file.id}' AND action='files.delete_reclaimed');`)).trim(),'t');
 passed('expired_reservation_new_session_explicit_reclaim_old_session_denied_real_purge');
 const expired=await upload('client',own);const oldToken=tokens.client;assert.ifError((await actors.client.auth.signOut({scope:'local'})).error);tokens.client=oldToken;
 await data('client',`attachments/${expired.file.id}/preview`,{},401);
 const stale=await fetch(`${lab.url}/storage/v1/object/authenticated/${expired.bucket}/${expired.object_path}`,{headers:{apikey:lab.anonKey,Authorization:'Bearer '+oldToken}});assert.equal(stale.ok,false);
 passed('revoked_gotrue_session_denies_preview_and_storage_with_old_jwt');
 assert.equal((await lab.sql("SELECT count(*) FROM public.files WHERE status='disponivel' OR scanner_status='clean';")).trim(),'0');
 proof.providers={gotrue:true,postgrest:true,express:true,storage:true,worker_real_handler:true};proof.check_count=Object.keys(proof.checks).length;proof.all_passed=true;
 await mkdir(new URL('../docs/evidencias/anexos-rodape-pos34/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/evidencias/anexos-rodape-pos34/auth-storage-real.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch(error){console.error('Attachments lifecycle real local: '+error.stack);process.exitCode=1;}
finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
