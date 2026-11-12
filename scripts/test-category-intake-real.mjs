import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {app} from '../server/app.ts';
import {registrationAcceptance} from '../shared/registrationAcceptance.ts';
import {emptyService} from '../shared/services.ts';
import {emptyTemplate} from '../shared/templates.ts';
import {renderDocumentPdf} from '../supabase/functions/document-artifacts/renderer.ts';

// Disposable local providers and fictional data only. No hosted credentials or scanner fixture.
let lab,server;
const sdks=[];
try {
 lab=await createAuthLab({storage:true,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});
 await lab.migrate();
 process.env.VITE_SUPABASE_URL=lab.url;
 process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const client=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});sdks.push(client);return client;};
 const admin=sdk(lab.serviceRoleKey),users={},actors={},tokens={},password='LocalCategory-'+randomBytes(24).toString('hex')+'!';
 const suffix=randomUUID().slice(0,8);
 for(const name of ['owner','client','other']) {
  const result=await admin.auth.admin.createUser({email:`category-${suffix}-${name}@example.test`,password,email_confirm:true});
  assert.ifError(result.error);users[name]=result.data.user.id;
 }
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Laboratório FICTÍCIO categorias','${randomUUID()}');`,'migrator')).trim();
 for(const name of ['client','other']) await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users[name]}','Pessoa FICTÍCIA categoria');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users[name]}','client');`,'migrator');
 for(const name of ['owner','client','other']) {
  const client=sdk(lab.anonKey),result=await client.auth.signInWithPassword({email:`category-${suffix}-${name}@example.test`,password});
  assert.ifError(result.error);assert.ifError((await client.rpc('session_activity',{p_human:false})).error);
  actors[name]=client;tokens[name]=result.data.session.access_token;
 }
 server=createServer(app);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}/api/`;
 const post=async(name,path,body,status=200)=>{
  const response=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+tokens[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});
  assert.equal(response.status,status,`${path}: HTTP ${response.status} ${response.status!==status?await response.clone().text():''}`);
  assert.match(response.headers.get('cache-control')??'',/no-store/);return response;
 };
 const data=async(name,path,body,status=200)=>(await(await post(name,path,body,status)).json()).data;
 // Configure public registration only after creating the isolated fixture identities.
 await lab.sql(`SELECT private.configure_client_registration('${office}',true);`,'migrator');
 const signup=sdk(lab.anonKey),rejectedEmail=`category-${suffix}-missing@example.test`;
 const rejected=await signup.auth.signUp({email:rejectedEmail,password,options:{data:{display_name:'Pessoa FICTÍCIA sem aceite'}}});
 assert.ok(rejected.error);assert.equal(rejected.data.user,null);
 assert.equal((await lab.sql(`SELECT NOT EXISTS(SELECT FROM auth.users WHERE email='${rejectedEmail}');`)).trim(),'t');
 const started=(await lab.sql('SELECT clock_timestamp();')).trim();
 const accepted=await signup.auth.signUp({email:`category-${suffix}-accepted@example.test`,password,options:{data:{display_name:'Pessoa FICTÍCIA com aceite',jn_client_acceptance:{...registrationAcceptance}}}});
 assert.ifError(accepted.error);assert.ok(accepted.data.user);assert.equal(accepted.data.session,null);
 const uid=accepted.data.user.id;
 const evidence=JSON.parse((await lab.sql(`SELECT row_to_json(a) FROM private.client_registration_acceptances a WHERE user_id='${uid}';`)).trim());
 assert.equal(evidence.office_id,office);assert.equal(evidence.policy_version,registrationAcceptance.version);
 assert.equal(evidence.terms_accepted,true);assert.equal(evidence.privacy_accepted,true);assert.equal(evidence.necessary_cookies_acknowledged,true);assert.equal(evidence.optional_cookies,false);
 assert.ok(Date.parse(evidence.accepted_at)>=Date.parse(started));assert.ok(Date.parse(evidence.accepted_at)<=Date.now());
 assert.equal((await lab.sql(`SELECT role_code='client' FROM public.memberships WHERE office_id='${office}' AND user_id='${uid}';`)).trim(),'t');
 for(const role of ['anon','authenticated','service_role']) assert.equal((await lab.sql(`SELECT has_table_privilege('${role}','private.client_registration_acceptances','SELECT,INSERT,UPDATE,DELETE');`)).trim(),'f');
 await assert.rejects(()=>lab.sql(`UPDATE private.client_registration_acceptances SET accepted_at=clock_timestamp() WHERE user_id='${uid}';`),/immutable/);
 await lab.sql(`UPDATE auth.users SET raw_user_meta_data='{}'::jsonb WHERE id='${uid}';`);
 assert.deepEqual(JSON.parse((await lab.sql(`SELECT row_to_json(a) FROM private.client_registration_acceptances a WHERE user_id='${uid}';`)).trim()),evidence);
 console.log('PASS registration acceptance: real anonymous GoTrue signup rejects missing acknowledgment atomically; exact checked metadata creates only client account with immutable private evidence, policy version, server timestamp, and necessary-only cookie preference; metadata changes preserve evidence.');

 const categoryName='Categoria FICTÍCIA '+suffix;
 const categories=await data('owner','categories/command',{command:{kind:'create',name:categoryName,execution_level:3,reason:'Configuração exclusivamente local'},idempotency_key:randomUUID()});
 const category=categories.items.find(item=>item.name===categoryName);assert.ok(category);
 await data('owner','document-commercial/presence-update',{status:'available',capacity:10});
 const initial=await data('owner','category-intake/form',{category_id:category.id,manage:true});
 await post('client','category-intake/form',{category_id:category.id,manage:true},403);
 const publication={category_id:category.id,key:randomUUID(),command:{expected_revision:initial.revision,enabled:true,instructions:'Dados exclusivamente FICTÍCIOS para validação local',fields:[{key:'finalidade',label:'Finalidade',type:'text',required:true,options:[]},{key:'modalidade',label:'Modalidade',type:'select',required:true,options:['Primeira','Segunda']},{key:'emissao',label:'Emissão',type:'date',required:false,options:[]}],documents:[{key:'identidade',label:'Identificação FICTÍCIA em PDF',required:true,max_files:1,max_bytes:1048576,mime_types:['application/pdf'],classification:'identificacao'}],reason:'Publicação exclusivamente local'}};
 const published=await data('owner','category-intake/publish',publication);
 assert.deepEqual(await data('owner','category-intake/publish',publication),published);
 await post('client','category-intake/publish',publication,403);
 const form=await data('client','category-intake/form',{category_id:category.id,manage:false});
 assert.equal(form.fields.length,3);assert.equal(form.documents[0].key,'identidade');assert.equal(form.has_services,false);
 const opening={category_id:category.id,revision:form.revision,answers:{},message:'',key:randomUUID()};
 const [opened,concurrent]=await Promise.all([data('client','category-intake/open',opening),data('client','category-intake/open',opening)]);
 assert.deepEqual(concurrent,opened);assert.equal(opened.category_form,true);assert.equal(opened.draft,true);
 assert.deepEqual(await data('client','category-intake/open',opening),opened);
 assert.deepEqual(await data('client','portal-intake/resume',{key:opening.key}),opened);
 assert.equal(await data('other','portal-intake/resume',{key:opening.key}),null);
 await post('other','category-intake/state',{request_id:opened.request_id},404);
 await post('other',`requests/${opened.request_id}/detail`,{page:1},404);
 assert.equal((await data('owner','requests/search',{query:categoryName,scope:'queue',status:'',page:1,size:5})).total,0);
 let state=await data('client','category-intake/state',{request_id:opened.request_id});
 const command=(value,status=200)=>data('client','category-intake/command',{request_id:opened.request_id,version:state.version,command:value,key:randomUUID()},status);
 await command({kind:'submit'},422);
 await post('client',`portal-requests/${opened.request_id}/command`,{expected_version:state.version,command:{kind:'resubmit'},idempotency_key:randomUUID()},422);
 await command({kind:'save',answers:{finalidade:'FICTÍCIA',modalidade:'Inválida'},message:''},422);
 const answers={finalidade:'Finalidade FICTÍCIA local',modalidade:'Primeira',emissao:'2026-11-12'};
 const saving={request_id:opened.request_id,version:state.version,command:{kind:'save',answers,message:''},key:randomUUID()};
 state=await data('client','category-intake/command',saving);
 assert.deepEqual(await data('client','category-intake/command',saving),state);
 await command({kind:'submit'},422);
 await post('client',`portal-requests/${opened.request_id}/command`,{expected_version:state.version,command:{kind:'resubmit'},idempotency_key:randomUUID()},422);
 const bytes=await renderDocumentPdf({content:'Arquivo FICTÍCIO local. Sem dados reais.',title:'Identificação fictícia',protocol:'DOC-LOCAL',created_at:new Date().toISOString(),signature_policy:'none'});
 const upload={request_id:opened.request_id,request_item_id:null,name:'identificacao-ficticia.pdf',mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'identificacao',idempotency_key:randomUUID()};
 const intent=await data('client','attachments/intents',{input:upload},201);assert.equal(intent.can_upload,true);
 assert.ifError((await actors.client.storage.from(intent.bucket).upload(intent.object_path,bytes,{contentType:'application/pdf',upsert:false})).error);
 const processed=await data('client','attachments/process',{action:'validate',args:{intent_id:intent.intent_id}});
 assert.equal(processed.file.status,'quarentena');assert.notEqual(processed.file.scanner_status,'clean');
 const denied=await actors.other.storage.from(intent.bucket).download(intent.object_path);assert.ok(denied.error);assert.equal(denied.data,null);
 await post('other','attachments/search',{request_id:opened.request_id,page:1,size:3},404);
 // An uploaded PDF alone must not fulfill a named slot before explicit binding.
 await command({kind:'submit'},422);
 state=await command({kind:'bind_file',slot_key:'identidade',file_id:intent.file.id});
 assert.equal(state.files[0].slot_key,'identidade');assert.equal(state.files[0].status,'quarentena');
 const send={request_id:opened.request_id,version:state.version,command:{kind:'submit'},key:randomUUID()};
 state=await data('client','category-intake/command',send);assert.equal(state.draft,false);assert.equal(state.protocol,opened.protocol);
 assert.deepEqual(await data('client','category-intake/command',send),state);
 const staff=await data('owner',`requests/${opened.request_id}/detail`,{page:1});
 assert.ok(staff.assignee_id);assert.deepEqual(staff.category_intake.answers,answers);
 assert.equal(staff.category_intake.files[0].slot_key,'identidade');assert.equal(staff.category_intake.documents[0].required,true);
 const queue=await data('owner','requests/search',{query:categoryName,scope:'queue',status:'',page:1,size:5});
 assert.ok(queue.items.some(item=>item.id===opened.request_id));
 assert.equal((await lab.sql(`SELECT count(*)=1 FROM public.requests WHERE id='${opened.request_id}';`)).trim(),'t');
 assert.equal((await lab.sql(`SELECT status='quarentena' AND scanner_status<>'clean' FROM public.files WHERE id='${intent.file.id}';`)).trim(),'t');
 console.log('PASS category intake: real Auth/REST/Express/Storage, manager publication, typed required answers, one concurrent draft/protocol and nonce resume, UUID/Storage isolation, named PDF slot, authoritative old-submit gate, same-protocol queue dispatch, staff answers/metadata, retained quarantine.');

 // Existing service33 and approved-model bookings must automatically capture the same category gate.
 const service=await data('owner','services',{service:{...emptyService,code:'CAT-'+suffix.toUpperCase(),name:'Serviço FICTÍCIO '+suffix,category:categoryName,price_cents:500,quantity_max:3,fields:[{key:'objetivo',label:'Objetivo do serviço',type:'text',required:true}],checklist:['Conferência FICTÍCIA']},reason:'Serviço exclusivamente local'},201);
 const managed=await data('owner','portal-intake/manage',{service_id:service.id});
 await data('owner','portal-intake/publish',{service_id:service.id,key:randomUUID(),command:{expected_revision:managed.revision,version_id:managed.current_version_id,enabled:true,instructions:'Campos do serviço FICTÍCIO',reason:'Publicação exclusivamente local'}});
 const serviceForm=await data('client','portal-intake/form',{service_id:service.id});
 const serviceOpened=await data('client','portal-intake/open',{form:{service_id:serviceForm.service_id,version_id:serviceForm.version_id,revision:serviceForm.revision,answers:{objetivo:'Objetivo FICTÍCIO'},quantity:1,message:'',checklist_version:serviceForm.checklist_version},key:randomUUID()});
 assert.equal(serviceOpened.category_form,true);
 const captured=await data('client','category-intake/state',{request_id:serviceOpened.request_id});
 assert.equal(captured.category_id,category.id);assert.equal(captured.category_name,categoryName);assert.deepEqual(captured.answers,{});
 await post('client',`portal-requests/${serviceOpened.request_id}/command`,{expected_version:captured.version,command:{kind:'resubmit'},idempotency_key:randomUUID()},422);
 const template=await data('owner','templates/save',{template_id:null,definition:{...emptyTemplate,code:'CATD-'+suffix.toUpperCase(),name:'Declaração FICTÍCIA '+suffix,content:'Declaração FICTÍCIA para {{documento.nome}}.',variables:[{key:'documento.nome',label:'Nome informado',type:'text',required:true}],demonstration:false,review_required:false,signature_policy:'none'},expected_version:0,reason:'Modelo exclusivamente local',idempotency_key:randomUUID()});
 await data('owner','templates/approve',{template_id:template.id,version_id:template.versions[0].id,expected_version:1,reason:'Aprovação exclusivamente local',idempotency_key:randomUUID()});
 const modelState=await data('owner','document-commercial/model-state',{template_id:template.id});
 await data('owner','document-commercial/offer-manage',{template_id:template.id,value:{service_id:service.id,instructions:'Oferta FICTÍCIA',execution_level:3,portal_enabled:true,intake_keys:['documento.nome'],required_intake_keys:['documento.nome'],allow_self_approval:false},expected_revision:modelState.offer_revision??modelState.offer?.revision??0,idempotency_key:randomUUID()});
 const offer=await data('client','document-commercial/offer-form',{template_id:template.id});
 const booking={value:{template_id:offer.template_id,template_version_id:offer.template_version_id,service_version_id:offer.service_version_id,offer_revision:offer.offer_revision,origin:'portal',answers:{'documento.nome':'Pessoa FICTÍCIA'},customer_id:null,assignee_id:null,intake:{answers:{objetivo:'Objetivo FICTÍCIO'},quantity:1,message:'',checklist_version:offer.checklist_version}},idempotency_key:randomUUID()};
 const booked=await data('client','document-commercial/booking',booking);assert.equal(booked.category_form,true);assert.equal(booked.draft,true);
 assert.deepEqual(await data('client','document-commercial/booking',booking),booked);
 const modelCaptured=await data('client','category-intake/state',{request_id:booked.request_id});
 assert.equal(modelCaptured.category_id,category.id);assert.equal(modelCaptured.category_name,categoryName);assert.deepEqual(modelCaptured.answers,{});
 const modelPortal=await data('client',`portal-requests/${booked.request_id}/state`,{});assert.equal(modelPortal.category_form,true);
 await post('client',`portal-requests/${booked.request_id}/command`,{expected_version:modelCaptured.version,command:{kind:'resubmit'},idempotency_key:randomUUID()},422);
 console.log('PASS existing service/model capture: published service33 and approved-model bookings retain single draft with category_form marker, category name and requirements; original portal resubmit cannot bypass captured category answers.');


} catch(error) {
 console.error('Category intake local: '+error.stack);process.exitCode=1;
} finally {
 for(const client of sdks) await client.auth.dispose();
 if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 await lab?.close();
}
