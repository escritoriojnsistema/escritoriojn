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
 for(const name of ['owner','employee','client','other']){const r=await admin.auth.admin.createUser({email:`dspec30-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Especializado30 laboratório','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users.client}','Cliente fictício30'),('${users.employee}','Funcionário fictício30'),('${users.other}','Outro cliente fictício30');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users.client}','client'),('${office}','${users.employee}','employee'),('${office}','${users.other}','client');INSERT INTO private.team_member_permissions(membership_id,permission_code) SELECT m.id,p.code FROM public.memberships m CROSS JOIN public.permissions p WHERE m.user_id='${users.employee}' AND p.code IN('foundation.access','specialized.read','specialized.manage','customers.read','customers.read_all','customers.update','requests.read','requests.read_all','requests.create','requests.update','requests.transfer','services.perform','files.read','files.upload','checklists.read','checklists.update','checklists.waive','services.manage','checklists.manage');`,'migrator');
 for(const name of ['owner','employee','client','other']){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`dspec30-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);sessions[name]=r.data.session.access_token;actors[name]=c;}
 server=createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${server.address().port}/api/`;
 const post=async(name,path,body,status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+sessions[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});assert.equal(r.status,status,`${path}: ${r.status} ${r.status!==status?await r.clone().text():''}`);return r;};
 const data=async(path,body,status=200)=>(await(await post('owner',path,body,status)).json()).data;
 const year=2026,today=new Date().toISOString().slice(0,10),suffix=randomUUID().slice(0,8).toUpperCase(),categoryName='Especializado30 '+suffix;
 await data('categories/command',{command:{kind:'create',name:categoryName,execution_level:3,reason:'Categoria fictícia exclusiva do laboratório30'},idempotency_key:randomUUID()});
 const customer=await data('customers',{customer:{kind:'person',name:'Contribuinte fictício30',identifier:'',contacts:[]}},201);
 const service=await data('services',{service:{...emptyService,code:'ITR-'+suffix,name:'Honorário fictício30',category:categoryName,price_cents:100},reason:'Serviço fictício do laboratório30'},201);
 const newRequest=title=>data('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title,customer_id:customer.id,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 const category=(await data('categories/state',{})).items.find(c=>c.name===categoryName);assert.ok(category);
 const portal=(await(await post('client','requests',{idempotency_key:randomUUID(),request:{origin:'portal',title:'Especializado30 pedido fictício',message:'Organizar documentos fictícios para Especializado',category_id:category.id}},201)).json()).data;
 const ownerPortal=await data(`requests/${portal.id}/detail`,{page:1});
 const triaged=await data(`requests/${portal.id}/actions`,{expected_version:ownerPortal.version,mutation:{kind:'triage',customer_id:customer.id,items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}],reason:'Classificação fictícia Especializado30'}});
 const itemId=triaged.items[0].id;
 const ownerMembership=(await lab.sql(`SELECT id FROM public.memberships WHERE office_id='${office}' AND user_id='${users.owner}';`,'migrator')).trim(),employeeMembership=(await lab.sql(`SELECT id FROM public.memberships WHERE office_id='${office}' AND user_id='${users.employee}';`,'migrator')).trim();
 await data('checklists/model/publish',{service_id:service.id,expected_version:0,definition:{name:'Checklist Especializado fictício30',items:[{key:'documento',label:'Documento de identificação fictício',requirement:'required',condition:null}]},reason:'Modelo fictício exclusivo do laboratório30',scope:'internal'});
 const state=async(name='owner')=>(await(await post(name,'specialized/state',{request_id:portal.id,page:1})).json()).data;
 const command=async(name,c,status=200,key=randomUUID())=>{const res=await post(name,'specialized/command',{request_id:portal.id,command:c,key},status);return(await res.json()).data;};
 await command('owner',{kind:'configure',item_id:itemId,service_kind:'aposentadoria',expected_version:0});
 await command('owner',{kind:'open',item_id:itemId});
 await command('owner',{kind:'note',expected_version:1,text:'NOTA ESTRATEGICA PRIVADA30'});
 const bytes=Buffer.from('%PDF-1.4\n% DOCUMENTO MEDICO FICTICIO LOCAL30\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
 const intent=(await(await post('owner','attachments/intents',{input:{request_id:portal.id,request_item_id:itemId,name:'arquivo-medico-ficticio30.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'medico',idempotency_key:randomUUID()}},201)).json()).data;
 assert.ifError((await actors.owner.storage.from(intent.bucket).upload(intent.object_path,bytes,{contentType:'application/pdf',upsert:false})).error);
 const checked=(await(await post('owner','attachments/process',{action:'validate',args:{intent_id:intent.intent_id}})).json()).data;assert.equal(checked.file.status,'quarentena');
 const latest=await data(`requests/${portal.id}/detail`,{page:1});
 await data(`requests/${portal.id}/actions`,{expected_version:latest.version,mutation:{kind:'transfer',assignee_id:employeeMembership,reason:'Preparação pelo funcionário fictício30'}});
 assert.equal((await state('employee')).case.can_prepare,true);assert.deepEqual((await state('employee')).notes,[]);
 const employeeFiles=(await(await post('employee','attachments/search',{request_id:portal.id,page:1,size:5})).json()).data;assert.equal(employeeFiles.total,0);
 await post('employee',`attachments/${intent.file.id}/download`,{},404);
 const directDownload=await actors.employee.rpc('files_download',{p_office_id:office,p_file_id:intent.file.id,p_event_id:randomUUID()});assert.equal(directDownload.error.code,'PT404');
 // Quarantine remains blocked for everyone. A separate explicit test-only clean fixture
 // proves the sensitive gate also blocks a file that would otherwise be downloadable.
 await lab.sql(`UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id='${intent.file.id}';`,'migrator');
 assert.ok((await actors.employee.storage.from(intent.bucket).download(intent.object_path)).error);
 assert.ifError((await actors.owner.storage.from(intent.bucket).download(intent.object_path)).error);
 await lab.sql(`UPDATE public.files SET status='quarentena',scanner_status='not_configured' WHERE id='${intent.file.id}';`,'migrator');
 const forbidden=await actors.employee.rpc('specialized_command30',{o:office,rid:portal.id,c:{kind:'note',expected_version:2,text:'forged'},k:randomUUID()});assert.equal(forbidden.error.code,'PT403');
 const key=randomUUID(),hand={kind:'handoff',expected_version:2,owner_id:ownerMembership};await command('employee',hand,200,key);await command('employee',hand,200,key);
 await command('owner',{kind:'advance',expected_version:3,stage:'em_analise'});
 await command('owner',{kind:'deadline',expected_version:4,type:'externo',label:'Marco fictício conferido',due_on:'2026-12-10',alert_on:'2026-12-09',checked_on:today,source:'Ofício fictício conferido',responsible_id:ownerMembership});
 await command('owner',{kind:'complement',expected_version:5,pending:'Enviar cópia legível'});
 const ownPortal=(await(await post('client',`requests/${portal.id}/detail`,{page:1})).json()).data;
 assert.equal(ownPortal.specialized_progress.pending,'Enviar cópia legível');assert.ok(!JSON.stringify(ownPortal).includes('ESTRATEGICA'));assert.ok(!JSON.stringify(ownPortal).includes('medico'));assert.ok(!JSON.stringify(ownPortal).includes('Ofício fictício'));
 await post('other',`requests/${portal.id}/detail`,{page:1},404);await post('client','specialized/state',{request_id:portal.id,page:1},403);
 await command('employee',{...hand,expected_version:6});await command('owner',{kind:'advance',expected_version:7,stage:'em_analise'});
 const checklist=await data('checklists/view',{request_id:portal.id,item_id:itemId});const entry=checklist.instance.entries.find(e=>e.applicable&&e.requirement==='required');assert.ok(entry);
 await data('checklists/entries/update',{entry_id:entry.id,expected_version:entry.version,status:'dispensado',file_id:null,reason:'Dispensa fictícia justificada no laboratório local30'});
 await command('owner',{kind:'complete',expected_version:8},409);
 await command('owner',{kind:'finish_deadline',expected_version:8,deadline_id:(await state()).deadlines[0].id});
 await data('charges/create',{request_id:portal.id,installments:[{due_date:'2026-12-10',amount_cents:100}],idempotency_key:randomUUID()});
 const expense=await data('cash/expense',{operation:{kind:'create',idempotency_key:randomUUID(),category:'Externa fictícia',payee:'Prestador fictício',description:'Despesa externa fictícia do laboratório30',due_date:'2026-12-10',amount_cents:50,evidence:'Evidência fictícia local30'}});
 await command('owner',{kind:'expense',expected_version:9,expense_id:expense.expense.id,expected_expense_version:expense.expense.version});
 const financial=(await state()).financial;assert.equal(financial.fees.due_cents,100);assert.equal(financial.fees.balance_cents,100);assert.equal(financial.expenses[0].status,'pending');assert.equal(financial.expenses[0].amount_cents,50);
 await command('owner',{kind:'complete',expected_version:10});
 const samples=[];for(let i=0;i<5;i++){const start=performance.now();await state();samples.push(Math.round((performance.now()-start)*100)/100);}
 const proof={proof:'etapa30-real-local',date_utc:today,auth:true,postgrest:true,express:true,storage:true,restricted_upload_validation:true,sensitive_bytes_denied_to_employee:true,ordinary_metadata_hidden:true,private_notes_hidden:true,reserved_direct_rpc_denied:true,handoff_and_complement_transfer:true,idempotency_after_transfer:true,own_portal_factual_progress:true,other_client_denied:true,manual_deadline_gate:true,fees_from_existing_ledger:true,expense_link_preserves_pending_status:true,checklist_required:true,quarantine_preserved:true,hosted_writes:false,state_roundtrip_ms_local:samples};
 await mkdir(new URL('../docs/evidencias/etapa-30/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/evidencias/etapa-30/real-local.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch(e){console.error('Etapa30 real local: '+e.message);process.exitCode=1;}finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
