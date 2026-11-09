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
 for(const name of ['owner','client']){const r=await admin.auth.admin.createUser({email:`ditr28-${name}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[name]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','ITR28 laboratório','${randomUUID()}');`,'migrator')).trim();
 await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users.client}','Cliente fictício28');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users.client}','client');`,'migrator');
 for(const name of ['owner','client']){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`ditr28-${name}@example.test`,password});assert.ifError(r.error);assert.ifError((await c.rpc('session_activity',{p_human:false})).error);sessions[name]=r.data.session.access_token;actors[name]=c;}
 server=createServer(app);await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const base=`http://127.0.0.1:${server.address().port}/api/`;
 const post=async(name,path,body,status=200)=>{const r=await fetch(base+path,{method:'POST',headers:{Authorization:'Bearer '+sessions[name],'Content-Type':'application/json'},body:JSON.stringify({office_id:office,...body})});assert.equal(r.status,status,`${path}: ${r.status} ${r.status!==status?await r.clone().text():''}`);return r;};
 const data=async(path,body,status=200)=>(await(await post('owner',path,body,status)).json()).data;
 const year=2026,today=new Date().toISOString().slice(0,10),suffix=randomUUID().slice(0,8).toUpperCase(),categoryName='ITR28 '+suffix;
 await data('categories/command',{command:{kind:'create',name:categoryName,execution_level:3,reason:'Categoria fictícia exclusiva do laboratório28'},idempotency_key:randomUUID()});
 const customer=await data('customers',{customer:{kind:'person',name:'Contribuinte fictício28',identifier:'',contacts:[]}},201);
 const service=await data('services',{service:{...emptyService,code:'ITR-'+suffix,name:'Honorário fictício28',category:categoryName,price_cents:100},reason:'Serviço fictício do laboratório28'},201);
 const newRequest=title=>data('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title,customer_id:customer.id,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 const requests=[];for(const title of ['Original A','Retificadora A','Tentativa equivalente A','Original B'])requests.push(await newRequest('ITR28 '+title));
 const propertyInput={kind:'create',customer_id:customer.id,name:'Imóvel A fictício28',municipality:'Cidade de teste',state:'MG',location:'Zona rural fictícia',identifiers:{}};
 const createProperty=name=>data('rural/command',{property_id:null,command:{...propertyInput,name},key:randomUUID()});
 const propertyA=(await createProperty('Imóvel A fictício28')).id,propertyB=(await createProperty('Imóvel B fictício28')).id;assert.notEqual(propertyA,propertyB);
 for(const property of [propertyA,propertyB])await data('rural/command',{property_id:property,command:{kind:'party',expected_version:1,customer_id:customer.id,role:'taxpayer',valid_from:'2020-01-01',valid_until:null},key:randomUUID()});
 let versionA=2;for(const attendance of requests.slice(0,3))await data('rural/command',{property_id:propertyA,command:{kind:'link',expected_version:versionA++,request_id:attendance.id,file_id:null,exercise:year},key:randomUUID()});
 await data('rural/command',{property_id:propertyB,command:{kind:'link',expected_version:2,request_id:requests[3].id,file_id:null,exercise:year},key:randomUUID()});
 const state=(property,caseId=null)=>data('rural/ditr-state',{property_id:property,exercise:year,case_id:caseId,page:1});
 assert.equal((await state(propertyA)).calendar,null);
 const create=(property,attendance,previous=null,key=randomUUID())=>({property_id:property,command:{kind:'create',exercise:year,request_id:attendance.id,modality:previous?'rectifying':'original',previous_case_id:previous},key});
 const firstBody=create(propertyA,requests[0]),first=await data('rural/ditr-command',firstBody);assert.deepEqual(await data('rural/ditr-command',firstBody),first);
 const second=await data('rural/ditr-command',create(propertyB,requests[3]));assert.notEqual(first.id,second.id);
 await post('owner','rural/ditr-command',create(propertyA,requests[2]),409);
 const bytes=Buffer.from('%PDF-1.4\n% ARQUIVO FICTICIO DO LABORATORIO LOCAL28\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n');
 const upload=async(attendance,name)=>{
  const intent=await data('attachments/intents',{input:{request_id:attendance.id,request_item_id:attendance.items[0].id,name,mime_type:'application/pdf',size_bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),classification:'documento',idempotency_key:randomUUID()}},201);
  assert.ifError((await actors.owner.storage.from(intent.bucket).upload(intent.object_path,bytes,{contentType:'application/pdf',upsert:false})).error);
  const checked=await data('attachments/process',{action:'validate',args:{intent_id:intent.intent_id}});assert.equal(checked.file.status,'quarentena');return intent.file.id;
 };
 const receiptFile=await upload(requests[0],'recibo-ficticio28.pdf');
 const evidence=async(caseId,kind,fileId,reference,amount=null)=>{const selected=(await state(propertyA,caseId)).selected;return data('rural/ditr-command',{property_id:propertyA,command:{kind:'evidence',case_id:caseId,expected_version:selected.version,evidence_kind:kind,file_id:fileId,external_reference:reference,amount_cents:amount,external_date:today},key:randomUUID()});};
 await evidence(first.id,'receipt',receiptFile,'RECIBO FICTÍCIO EXTERNO LOCAL28');
 const rectified=await data('rural/ditr-command',create(propertyA,requests[1],first.id));
 const originalAfter=await state(propertyA,first.id),rectification=await state(propertyA,rectified.id);
 assert.equal(originalAfter.selected.modality,'original');assert.equal(originalAfter.evidence.length,1);assert.equal(originalAfter.evidence[0].file_id,receiptFile);
 assert.equal(rectification.selected.previous_case_id,first.id);assert.equal(rectification.selected.root_case_id,first.id);assert.equal(rectification.selected.revision,2);assert.equal(rectification.evidence.length,0);
 assert.match(originalAfter.selected.internal_protocol,/^AT-/);assert.notEqual(originalAfter.selected.internal_protocol,originalAfter.evidence[0].external_reference);
 const charge=await data('charges/create',{request_id:requests[0].id,installments:[{due_date:today,amount_cents:100}],idempotency_key:randomUUID()});
 const configure=async(configuration)=>(await data('cash/configure',{configuration,idempotency_key:randomUUID()})).resource.id;
 const unit=await configure({kind:'unit',id:null,expected_version:null,name:'Unidade fictícia28 '+suffix,active:true});
 const account=await configure({kind:'account',id:null,expected_version:null,name:'Espécie fictícia28 '+suffix,active:true,unit_id:unit,type:'cash'});
 const method=await configure({kind:'payment_method',id:null,expected_version:null,name:'Forma fictícia28 '+suffix,active:true,unit_id:unit,type:'cash',destination_account_id:account});
 const opened=await data('cash/open',{unit_id:unit,cash_account_id:account,opening_cents:0,idempotency_key:randomUUID()}),cash=opened.sessions.find(s=>s.unit_id===unit).id;
 await data('cash/payment',{operation:{kind:'record',session_id:cash,expected_version:1,idempotency_key:randomUUID(),evidence:'Pagamento FICTÍCIO honorário28',payment_method_id:method,status:'confirmed',allocations:[{charge_id:charge.charge.id,expected_charge_version:1,amount_cents:100}],presented_cents:100,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null}});
 const feePaid=await state(propertyA,first.id);assert.equal(feePaid.selected.service.paid_cents,100);assert.equal(feePaid.selected.service.balance_cents,0);assert.deepEqual(feePaid.evidence.map(e=>e.kind),['receipt']);
 const guideFile=await upload(requests[0],'guia-ficticia28.pdf'),paymentFile=await upload(requests[0],'comprovante-ficticio28.pdf');
 await evidence(first.id,'tax_guide',guideFile,'GUIA FICTÍCIA LOCAL28',5000);await evidence(first.id,'tax_payment',paymentFile,'COMPROVANTE FICTÍCIO LOCAL28',5000);
 const separated=await state(propertyA,first.id);assert.deepEqual(separated.evidence.map(e=>e.kind).sort(),['receipt','tax_guide','tax_payment']);assert.deepEqual(separated.selected.service,feePaid.selected.service);
 assert.equal('tax_paid'in separated.selected,false);
 const calendar={kind:'calendar',exercise:year,starts_on:'2026-08-01',due_on:'2026-09-30',source_url:'https://www.gov.br/receitafederal/pt-br',checked_on:today,expected_calendar_id:null};
 await post('owner','rural/ditr-command',{property_id:propertyA,command:{...calendar,source_url:'https://gov.br.example.test/falso'},key:randomUUID()},422);
 assert.deepEqual(await data('rural/ditr-command',{property_id:propertyA,command:calendar,key:randomUUID()}),{id:null});
 const firstCalendar=(await state(propertyA)).calendar;assert.equal(firstCalendar.exercise,year);assert.equal(firstCalendar.checked_on,today);assert.ok(firstCalendar.responsible_name);
 await data('rural/ditr-command',{property_id:propertyA,command:{...calendar,due_on:'2026-10-01',expected_calendar_id:firstCalendar.id},key:randomUUID()});
 const nextCalendar=(await state(propertyB)).calendar;assert.notEqual(nextCalendar.id,firstCalendar.id);assert.equal(nextCalendar.due_on,'2026-10-01');
 await post('client','rural/ditr-state',{property_id:propertyA,exercise:year,case_id:first.id,page:1},403);
 const references=Number((await lab.sql(`SELECT count(*) FROM private.file_references WHERE office_id='${office}' AND file_id IN('${receiptFile}','${guideFile}','${paymentFile}');`,'migrator')).trim());assert.ok(references>=3);
 const proof={proof:'etapa28-real-local',date_utc:today,auth:true,rest:true,express:true,storage_upload_and_validation:true,quarantine_preserved:true,two_properties_same_year:true,original_duplicate_denied:true,rectification_preserves_original_and_receipt:true,internal_protocol_separate:true,official_fee_ledger_paid:true,fee_payment_without_tax_payment:true,external_guide_and_payment_separate:true,calendar_without_default:true,calendar_official_source_required:true,calendar_responsible_and_revision:true,portal_denied:true,idempotency:true,file_references:references,hosted_writes:false,external_transmission:false};
 await mkdir(new URL('../docs/evidencias/etapa-28/',import.meta.url),{recursive:true});await writeFile(new URL('../docs/evidencias/etapa-28/real-local.json',import.meta.url),JSON.stringify(proof,null,2)+'\n');console.log(JSON.stringify(proof));
}catch(e){console.error('Etapa28 real local: '+e.message);process.exitCode=1;}finally{for(const c of clients)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}await lab?.close();}
