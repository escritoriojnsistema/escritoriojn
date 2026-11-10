import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {emptyService} from '../shared/services.ts';
import {app} from '../server/app.ts';

// No remote URL override: every identity, request and object belongs to this
// disposable local GoTrue/PostgREST/Storage laboratory.
let lab,server;const clients=[];
try{
 lab=await createAuthLab({storage:true,artifacts:false,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});
 assert.match(lab.url,/^http:\/\/127\.0\.0\.1:\d+$/);await lab.migrate();
 process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});clients.push(c);return c;};
 const admin=sdk(lab.serviceRoleKey),users={},sessions={},actors={},password='Local-'+randomBytes(24).toString('hex')+'!';
 for(const name of ['owner','employee','client','other']){const r=await admin.auth.admin.createUser({email:`dcar29-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','CAR29 laboratório','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users.client}','Cliente fictício29'),('${users.employee}','Funcionário fictício29'),('${users.other}','Outro cliente fictício29');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users.client}','client'),('${office}','${users.employee}','employee'),('${office}','${users.other}','client');INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT m.id,p.code FROM public.memberships m CROSS JOIN public.permissions p WHERE m.user_id='${users.employee}' AND p.code IN('foundation.access','rural.read','rural.read_all','rural.records.manage','customers.read','customers.read_all','customers.update','requests.read','requests.read_all','requests.create','requests.update','requests.transfer','services.perform','files.read','files.upload','checklists.read','checklists.update','checklists.waive','services.manage','checklists.manage');`,'migrator');
 for(const name of ['owner','employee','client','other']){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`dcar29-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);sessions[name]=r.data.session.access_token;actors[name]=c;}
 server=createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${server.address().port}/api/`;
 const post=async(name,path,body,status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+sessions[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});assert.equal(r.status,status,`${path}: ${r.status} ${r.status!==status?await r.clone().text():''}`);return r;};
 const data=async(path,body,status=200)=>(await(await post('owner',path,body,status)).json()).data;
 const year=2026,today=new Date().toISOString().slice(0,10),suffix=randomUUID().slice(0,8).toUpperCase(),categoryName='CAR29 '+suffix;
 await data('categories/command',{command:{kind:'create',name:categoryName,execution_level:3,reason:'Categoria fictícia exclusiva do laboratório29'},idempotency_key:randomUUID()});
 const customer=await data('customers',{customer:{kind:'person',name:'Contribuinte fictício29',identifier:'',contacts:[]}},201);
 const service=await data('services',{service:{...emptyService,code:'ITR-'+suffix,name:'Honorário fictício29',category:categoryName,price_cents:100},reason:'Serviço fictício do laboratório29'},201);
 const newRequest=title=>data('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title,customer_id:customer.id,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 const category=(await data('categories/state',{})).items.find(c=>c.name===categoryName);assert.ok(category);
 const portal=(await(await post('client','requests',{idempotency_key:randomUUID(),request:{origin:'portal',title:'CAR29 pedido fictício',message:'Organizar documentos fictícios para CAR',category_id:category.id}},201)).json()).data;
 const ownerPortal=await data(`requests/${portal.id}/detail`,{page:1});
 const triaged=await data(`requests/${portal.id}/actions`,{expected_version:ownerPortal.version,mutation:{kind:'triage',customer_id:customer.id,items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}],reason:'Classificação fictícia CAR29'}});
 const itemId=triaged.items[0].id;
 const ownerMembership=(await lab.sql(`SELECT id FROM public.memberships WHERE office_id='${office}' AND user_id='${users.owner}';`,'migrator')).trim(),employeeMembership=(await lab.sql(`SELECT id FROM public.memberships WHERE office_id='${office}' AND user_id='${users.employee}';`,'migrator')).trim();
 await data('checklists/model/publish',{service_id:service.id,expected_version:0,definition:{name:'Checklist CAR fictício29',items:[{key:'documento',label:'Documento de identificação fictício',requirement:'required',condition:null}]},reason:'Modelo fictício exclusivo do laboratório29',scope:'internal'});
 const property=(await data('rural/command',{property_id:null,command:{kind:'create',customer_id:customer.id,name:'Imóvel fictício CAR29',municipality:'Cidade de teste',state:'MG',location:'Zona rural fictícia',identifiers:{}},key:randomUUID()})).id;
 await data('rural/command',{property_id:property,command:{kind:'party',expected_version:1,customer_id:customer.id,role:'holder',valid_from:'2020-01-01',valid_until:null},key:randomUUID()});
 await data('rural/command',{property_id:property,command:{kind:'link',expected_version:2,request_id:portal.id,file_id:null,exercise:null},key:randomUUID()});
 const state=async(name='owner')=>(await(await post(name,'rural/workflow-state',{request_id:portal.id,page:1})).json()).data;
 const command=async(name,c,status=200,key=randomUUID())=>{const res=await post(name,'rural/workflow-command',{request_id:portal.id,command:c,key},status);return (await res.json()).data;};
 await command('owner',{kind:'configure',item_id:itemId,service_kind:'CAR',expected_version:0});
 const latest=await data(`requests/${portal.id}/detail`,{page:1});
 await data(`requests/${portal.id}/actions`,{expected_version:latest.version,mutation:{kind:'transfer',assignee_id:employeeMembership,reason:'Preparação pelo funcionário fictício29'}});
 await command('employee',{kind:'open',item_id:itemId,property_id:property});assert.equal((await state('employee')).case.can_prepare,true);
 await command('employee',{kind:'advance',expected_version:1,stage:'em_analise'},403);
 await command('employee',{kind:'configure',item_id:itemId,service_kind:'CCIR',expected_version:1},403);
 const bytes=Buffer.from('%PDF-1.4\n% DOCUMENTO FICTICIO LOCAL29\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
 const intent=(await(await post('employee','attachments/intents',{input:{request_id:portal.id,request_item_id:itemId,name:'arquivo-ficticio29.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'documento',idempotency_key:randomUUID()}},201)).json()).data;
 assert.ifError((await actors.employee.storage.from(intent.bucket).upload(intent.object_path,bytes,{contentType:'application/pdf',upsert:false})).error);
 const checked=(await(await post('employee','attachments/process',{action:'validate',args:{intent_id:intent.intent_id}})).json()).data;assert.equal(checked.file.status,'quarentena');
 const key=randomUUID(),hand={kind:'handoff',expected_version:1,owner_id:ownerMembership};await command('employee',hand,200,key);await command('employee',hand,200,key);
 assert.equal((await state('employee')).case.can_reserved,false);assert.equal((await state()).case.can_reserved,true);
 await command('owner',{kind:'advance',expected_version:2,stage:'em_analise'});
 await command('owner',{kind:'complement',expected_version:3,pending:'Enviar cópia legível do documento fictício'});
 const ownPortal=(await(await post('client',`requests/${portal.id}/detail`,{page:1})).json()).data;
 const portalList=(await(await post('client','requests/search',{query:'',scope:'mine',status:'',page:1,size:3})).json()).data;assert.equal(portalList.items.find(i=>i.id===portal.id).rural_progress.stage,'complementacao');
 assert.equal(ownPortal.rural_progress.stage,'complementacao');assert.equal(ownPortal.rural_progress.pending,'Enviar cópia legível do documento fictício');assert.equal('result_file_id'in ownPortal.rural_progress,false);assert.equal('property_name'in ownPortal.rural_progress,false);
 await post('other',`requests/${portal.id}/detail`,{page:1},404);
 assert.equal((await state('employee')).case.can_prepare,true);
 await command('employee',{...hand,expected_version:4});await command('owner',{kind:'advance',expected_version:5,stage:'em_analise'});await command('owner',{kind:'advance',expected_version:6,stage:'em_preparacao'});
 const done={kind:'complete',expected_version:7,external_reference:'Referência externa fictícia29',file_id:intent.file.id};await command('owner',done,409);
 const checklist=await data('checklists/view',{request_id:portal.id,item_id:itemId});const entry=checklist.instance.entries.find(e=>e.applicable&&e.requirement==='required');assert.ok(entry);
 await data('checklists/entries/update',{entry_id:entry.id,expected_version:entry.version,status:'dispensado',file_id:null,reason:'Dispensa fictícia justificada no laboratório local29'});
 await command('owner',done);const final=await state();assert.equal(final.case.stage,'concluido');assert.equal(final.case.result_file_id,intent.file.id);
 const quarantine=(await lab.sql(`SELECT status FROM public.files WHERE id='${intent.file.id}';`,'migrator')).trim();assert.equal(quarantine,'quarentena');
 await post('client','rural/workflow-state',{request_id:portal.id,page:1},403);
 const samples=[];for(let i=0;i<5;i++){const start=performance.now();await state();samples.push(Math.round((performance.now()-start)*100)/100);}
 const proof={state_roundtrip_ms_local:samples,proof:'etapa29-real-local',date_utc:today,auth:true,postgrest:true,express:true,employee_open_upload_follow:true,owner_only_direct_rpc:true,handoff_and_complement_transfer:true,idempotency_after_transfer:true,own_portal_progress:true,other_client_denied:true,checklist_required_gate:true,quarantine_preserved:true,result_follows_existing_release:true,hosted_writes:false};
 await mkdir(new URL('../docs/evidencias/etapa-29/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/evidencias/etapa-29/real-local.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch(e){console.error('Etapa29 real local: '+e.message);process.exitCode=1;}finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
