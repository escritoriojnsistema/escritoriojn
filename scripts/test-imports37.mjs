import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir,writeFile} from 'node:fs/promises';
import {createClient} from '@supabase/supabase-js';
import {createAuthLab} from '../tests/auth/lab.mjs';
import {app} from '../server/app.ts';
import {emptyService} from '../shared/services.ts';
import {importExample37} from '../shared/imports37.ts';
let lab,server;const sdks=[];const evidence={mode:'disposable laboratory',hosted_fixtures:false};
try{
 lab=await createAuthLab({storage:true,storageRootfs:process.env.AUTH_LAB_STORAGE_ROOTFS});await lab.migrate();process.env.VITE_SUPABASE_URL=lab.url;process.env.VITE_SUPABASE_PUBLISHABLE_KEY=lab.anonKey;
 const sdk=key=>{const c=createClient(lab.url,key,{auth:{persistSession:false,autoRefreshToken:false}});sdks.push(c);return c;};const admin=sdk(lab.serviceRoleKey),users={},tokens={},actors={},password='Lab37-'+randomBytes(24).toString('hex')+'!';
 for(const role of ['owner','admin','employee','client','other']){const r=await admin.auth.admin.createUser({email:`import37-${role}@example.test`,password,email_confirm:true});assert.ifError(r.error);users[role]=r.data.user.id;}
 const office=(await lab.sql(`SELECT private.provision_owner('${users.owner}','Laboratório37','${randomUUID()}');`,'migrator')).trim(),other=randomUUID();
 await lab.sql(`INSERT INTO public.offices(id,name)VALUES('${other}','Outro escritório37');INSERT INTO public.profiles(id,display_name)VALUES('${users.other}','Outro FICTÍCIO37');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${other}','${users.other}','owner');`,'migrator');
 for(const role of ['admin','employee','client'])await lab.sql(`INSERT INTO public.profiles(id,display_name)VALUES('${users[role]}','Pessoa FICTÍCIA37');INSERT INTO public.memberships(office_id,user_id,role_code)VALUES('${office}','${users[role]}','${role}');`,'migrator');
 for(const name of Object.keys(users)){const c=sdk(lab.anonKey),r=await c.auth.signInWithPassword({email:`import37-${name}@example.test`,password});assert.ifError(r.error);tokens[name]=r.data.session.access_token;actors[name]=c;assert.ifError((await c.rpc('session_activity',{p_human:false})).error);}
 const rpc=async(name,action,args)=>actors[name].rpc('imports37_'+action,{p_office_id:office,...args});
 // First RED: imports37_history does not exist before the migration is implemented.
 assert.ifError((await rpc('owner','history',{p_page:1,p_size:5})).error);
 server=createServer(app);await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}/api/imports/`;
 const call=async(action,body={},status=200,who='owner')=>{const response=await fetch(origin+action,{method:'POST',headers:{'Content-Type':'application/json',...(who?{Authorization:'Bearer '+tokens[who]}:{})},body:JSON.stringify({office_id:office,...body})});assert.equal(response.status,status,action+' '+JSON.stringify(await response.clone().json()));assert.match(response.headers.get('cache-control'),/no-store/);return (await response.json()).data;};
 await call('history',{page:1,page_size:5},401,null);for(const who of ['admin','employee','client','other'])await call('history',{page:1,page_size:5},403,who);
 const boundary={source:'Fonte de fronteira',as_of:'2026-11-15',expected_debit_cents:0,expected_credit_cents:0,rows:Array.from({length:100},(_,i)=>({source_id:'LIMIT-'+i,customer_id:null,customer_version:null,kind:'person',name:'Cliente '+i+' '+'🟦'.repeat(109),identifier:'',contacts:[],opening_cents:0,evidence:'🟦'.repeat(500),file_id:null}))};
 assert.equal(Buffer.byteLength(JSON.stringify(boundary)),261892);const boundaryPlan=await call('preview',{input:boundary});assert.equal(boundaryPlan.rows.length,100);assert.equal(boundaryPlan.ready,true);evidence.boundary_261892_bytes_accepted=true;
 const input=structuredClone(importExample37);assert.ifError((await rpc('owner','preview',{p_input:input})).error);const p=await call('preview',{input});assert.deepEqual(p.rows.map(r=>r.outcome),['create','create','create','rejected','rejected']);assert.equal(p.rows[3].reason,'DUPLICATE_LINE');
 const malformed=await call('preview',{input:{...input,rows:[null,[],false,1,'wrong']}});assert(malformed.rows.every(r=>r.reason==='INVALID_ROW'));
assert.equal(p.rows[4].reason,'INVALID_ROW');assert.equal(p.ready,true);
 assert.equal((await lab.sql('select count(*) from public.customers;')).trim(),'0');
 const key=randomUUID(),exact={input,fingerprint:p.fingerprint,key};
 const lost=createServer(async(_req,res)=>{try{const upstream=await fetch(origin+'apply',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.owner},body:JSON.stringify({office_id:office,...exact})});assert.equal(upstream.status,200);await upstream.arrayBuffer();res.destroy();}catch{res.destroy();}});await new Promise(r=>lost.listen(0,'127.0.0.1',r));try{await assert.rejects(fetch(`http://127.0.0.1:${lost.address().port}`,{method:'POST',body:JSON.stringify(exact)}));}finally{lost.closeAllConnections();await new Promise(r=>lost.close(r));}
 assert.equal((await lab.sql('select count(*) from public.customers;')).trim(),'3');evidence.response_lost_after_commit_reconciled=true;
 const applied=await call('apply',exact);assert.equal(applied.status,'applied');assert.equal((await lab.sql('select count(*) from public.customers;')).trim(),'3');
 assert.equal((await lab.sql("SELECT bool_and(position('Cliente fictício A' in report::text)=0) FROM private.import_batches37;")).trim(),'t','Persisted reports must not duplicate names from the customer registry');
 const retries=await Promise.all(Array.from({length:4},()=>call('apply',{input,fingerprint:p.fingerprint,key})));assert(retries.every(x=>x.batch_id===applied.batch_id));
 assert.equal((await call('apply',{input,fingerprint:p.fingerprint,key:randomUUID()})).batch_id,applied.batch_id);
 await call('apply',{input:{...input,source:'changed'},fingerprint:p.fingerprint,key},409);
 const changed=structuredClone(input);changed.rows[0].name='Changed';const pc=await call('preview',{input:changed});assert.equal(pc.rows[0].reason,'SOURCE_CHANGED');assert.equal(pc.ready,false);
 // Two different batches cannot import the same source reference twice.
 const cross={...input,source:'Other file name',rows:[input.rows[0]]};const pp=await call('preview',{input:cross});assert.equal(pp.rows[0].outcome,'seen');assert.equal(pp.ready,false);
 const first=applied.rows[0].customer_id;
 const sameSource=await call('preview',{input:{...input,rows:[{...input.rows[0],source_id:'SAME37'},{...input.rows[1],source_id:'SAME37'}]}});assert.equal(sameSource.rows[1].reason,'DUPLICATE_LINE');

 // Explicit verified link: the import never creates a portal identity.
 const member=(await lab.sql(`SELECT id FROM public.memberships WHERE user_id='${users.client}' AND office_id='${office}';`)).trim();
 const verification=await actors.owner.rpc('customer_relation_command',{p_office_id:office,p_customer_id:first,p_action:'identity.verify',p_payload:{membership_id:member,evidence:'Conferência humana FICTÍCIA37'},p_request_id:randomUUID()});assert.ifError(verification.error);
 const version=Number((await lab.sql(`SELECT version FROM public.customers WHERE id='${first}';`)).trim());
 const linked={...input,source:'Abertura FICTÍCIA37',expected_debit_cents:12345,expected_credit_cents:500,rows:[{...input.rows[0],source_id:'BAL37-001',customer_id:first,customer_version:version,opening_cents:12345},{...input.rows[0],source_id:'BAL37-002',customer_id:first,customer_version:version,opening_cents:-500}]};
 // Same person can have several different legacy obligations, each with a unique source_id.
 const pl=await call('preview',{input:linked});assert.equal(pl.ready,true);assert.equal(pl.debit_cents,12345);assert.equal(pl.credit_cents,500);
 const totalsBad={...linked,expected_debit_cents:11845,expected_credit_cents:0};assert.equal((await call('preview',{input:totalsBad})).ready,false);
 const balance=await call('apply',{input:linked,fingerprint:pl.fingerprint,key:randomUUID()});assert.equal(balance.status,'applied');
 assert.equal((await lab.sql('select count(*) from private.payments;')).trim(),'0');assert.equal((await lab.sql('select count(*) from private.cash_entries;')).trim(),'0');assert.equal((await lab.sql('select count(*) from private.charges;')).trim(),'0');
 
 // Real file pipeline11, Storage bytes, existing customer08 and charge/payment15 remain canonical.
 const api=async(path,body,status=200)=>{const r=await fetch(origin.replace('/imports/','/')+path,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.owner},body:JSON.stringify({office_id:office,...body})});assert.equal(r.status,status,path+': '+await r.clone().text());return(await r.json()).data;};
 const category='Legado37-'+randomUUID().slice(0,8);await api('categories/command',{command:{kind:'create',name:category,execution_level:3,reason:'Exclusivamente laboratório37'},idempotency_key:randomUUID()});
 const service=await api('services',{service:{...emptyService,code:'L37-'+randomUUID().slice(0,7).toUpperCase(),name:'Serviço FICTÍCIO37',category,price_cents:10000},reason:'Exclusivamente laboratório37'},201);
 const request=await api('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title:'Acervo FICTÍCIO37',customer_id:first,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 const pdf=Buffer.from('%PDF-1.4\n% Documento inteiramente FICTICIO37\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n'),sha=createHash('sha256').update(pdf).digest('hex');
 const intent=await api('attachments/intents',{input:{request_id:request.id,request_item_id:request.items[0].id,name:'ficticio37.pdf',mime_type:'application/pdf',size_bytes:pdf.length,sha256:sha,classification:'documento',idempotency_key:randomUUID()}},201);
 assert.ifError((await actors.owner.storage.from(intent.bucket).upload(intent.object_path,pdf,{contentType:'application/pdf',upsert:false})).error);
 const checked=await api('attachments/process',{action:'validate',args:{intent_id:intent.intent_id}});assert.equal(checked.file.status,'quarentena');assert.equal(checked.file.can_download,false);
 const fileInput={...linked,expected_debit_cents:0,expected_credit_cents:0,rows:[{...linked.rows[0],source_id:'FILE37-001',opening_cents:0,file_id:intent.file.id}]};
 const pf=await call('preview',{input:fileInput});assert.equal(pf.ready,true,'file preview '+JSON.stringify(pf));const fileBatch=await call('apply',{input:fileInput,fingerprint:pf.fingerprint,key:randomUUID()});
 assert.equal((await lab.sql(`SELECT count(*) FROM private.file_references WHERE file_id='${intent.file.id}' AND reference_kind='imports37';`)).trim(),'1');
 const privateBytes=await actors.owner.storage.from(intent.bucket).download(intent.object_path);assert.ifError(privateBytes.error);assert.equal(createHash('sha256').update(Buffer.from(await privateBytes.data.arrayBuffer())).digest('hex'),sha);await api('attachments/'+intent.file.id+'/download',{},409); // Authorized private preview is distinct from release25/26.
 await lab.sql(`UPDATE public.files SET actual_sha256=NULL WHERE id='${intent.file.id}';`);
 const damagedInput={...fileInput,rows:[{...fileInput.rows[0],source_id:'FILE37-002'}]};assert.equal((await call('preview',{input:damagedInput})).rows[0].reason,'FILE_UNAVAILABLE');
 await lab.sql(`UPDATE public.files SET actual_sha256='${sha}' WHERE id='${intent.file.id}';`);
 const charge=await api('charges/create',{request_id:request.id,installments:[{due_date:'2026-12-01',amount_cents:10000}],idempotency_key:randomUUID()});
 const config=async(configuration)=>(await api('cash/configure',{configuration,idempotency_key:randomUUID()})).resource.id;
 const unit=await config({kind:'unit',id:null,expected_version:null,name:'Unidade FICTÍCIA37',active:true});const account=await config({kind:'account',id:null,expected_version:null,name:'Espécie FICTÍCIA37',active:true,unit_id:unit,type:'cash'});const method=await config({kind:'payment_method',id:null,expected_version:null,name:'Dinheiro FICTÍCIO37',active:true,unit_id:unit,type:'cash',destination_account_id:account});
 const opened=await api('cash/open',{unit_id:unit,cash_account_id:account,opening_cents:0,idempotency_key:randomUUID()});const session=opened.sessions.find(s=>s.unit_id===unit).id;
 const payment=await api('cash/payment',{operation:{kind:'record',session_id:session,expected_version:1,idempotency_key:randomUUID(),evidence:'Conferência manual FICTÍCIA37 posterior à importação',payment_method_id:method,status:'confirmed',allocations:[{charge_id:charge.charge.id,expected_charge_version:1,amount_cents:3000}],presented_cents:3000,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null}});assert.equal(payment.session.received_cents,3000);
 const paymentBefore=(await lab.sql('SELECT md5(jsonb_agg(to_jsonb(x))::text) FROM private.payments x;')).trim();
 // New reference after import survives reversal; no customer deletion or mutation.
 
 const oldName=(await lab.sql(`SELECT name FROM public.customers WHERE id='${first}';`)).trim();await lab.sql(`INSERT INTO private.customer_snapshots(office_id,customer_id,version,data)SELECT office_id,id,version,'{}'::jsonb FROM public.customers WHERE id='${first}';`);
 const detail=await call('detail',{batch_id:balance.batch_id});const reversed=await call('reverse',{batch_id:balance.batch_id,fingerprint:detail.fingerprint,key:randomUUID(),reason:'Fonte de laboratório substituída'});assert.equal(reversed.status,'reversed');
 assert.equal((await lab.sql(`SELECT name FROM public.customers WHERE id='${first}';`)).trim(),oldName);assert.equal((await lab.sql('SELECT md5(jsonb_agg(to_jsonb(x))::text) FROM private.payments x;')).trim(),paymentBefore);
 const reverseFile=await call('reverse',{batch_id:fileBatch.batch_id,fingerprint:fileBatch.fingerprint,key:randomUUID(),reason:'Conferência de reversão do documento FICTÍCIO37'});assert.equal(reverseFile.status,'reversed');assert.equal((await lab.sql(`SELECT count(*) FROM private.file_references WHERE file_id='${intent.file.id}';`)).trim(),'1');assert.equal((await lab.sql(`SELECT count(*) FROM private.customer_snapshots WHERE customer_id='${first}';`)).trim(),'1');
 assert.equal((await call('apply',{input:linked,fingerprint:pl.fingerprint,key:randomUUID()})).status,'reversed');
 const hr=await call('history',{page:1,page_size:3});assert.equal(hr.total,3);assert.equal(hr.items.length,3);
 
 // Different keys and file names still serialize the same legacy source reference.
 const raceRow={...input.rows[0],source_id:'RACE37',name:'Pessoa de corrida FICTÍCIA37',identifier:''};
 const raceInputs=['Arquivo A FICTÍCIO37','Arquivo B FICTÍCIO37'].map(source=>({...input,source,rows:[raceRow]}));
 const racePlans=await Promise.all(raceInputs.map(input=>call('preview',{input})));assert(racePlans.every(p=>p.ready));
 const raceResults=await Promise.all(raceInputs.map((input,i)=>fetch(origin+'apply',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+tokens.owner},body:JSON.stringify({office_id:office,input,fingerprint:racePlans[i].fingerprint,key:randomUUID()})}).then(r=>r.status)));
 assert.deepEqual(raceResults.toSorted(),[200,409]);assert.equal((await lab.sql("SELECT count(*) FROM private.import_rows37 WHERE source_id='RACE37';")).trim(),'1');
 // A verified identity revoked after preview cannot be linked by an old confirmation.
 const revokeInput={...linked,expected_debit_cents:0,expected_credit_cents:0,rows:[{...linked.rows[0],source_id:'REVOKE37',opening_cents:0}]};const revokePlan=await call('preview',{input:revokeInput});assert.equal(revokePlan.ready,true);
 const relation=JSON.parse((await lab.sql(`SELECT jsonb_build_object('id',id,'version',version) FROM private.customer_relations WHERE customer_id='${first}' AND relation_type='identity' AND revoked_at IS NULL;`)).trim());
 assert.ifError((await actors.owner.rpc('customer_relation_command',{p_office_id:office,p_customer_id:first,p_action:'identity.revoke',p_payload:relation,p_request_id:randomUUID()})).error);
 await call('apply',{input:revokeInput,fingerprint:revokePlan.fingerprint,key:randomUUID()},409);
 assert.equal((await call('preview',{input:revokeInput})).rows[0].reason,'LINK_UNAVAILABLE');
 // Measure bounded preview against 10k real local registry rows, without committing the benchmark.
 await lab.sql(`INSERT INTO public.customers(office_id,kind,name,created_by) SELECT '${office}','person','Cadastro SINTÉTICO de carga37 '||n,'${users.owner}' FROM generate_series(1,10000)n;`);
 const load={...input,source:'Prévia de carga FICTÍCIA37',rows:Array.from({length:100},(_,i)=>({...input.rows[0],source_id:'LOAD37-'+i,name:'Novo sintético de prévia37 '+i,identifier:''}))};
 const latencies=[];for(let n=0;n<5;n++){const started=performance.now();const response=await call('preview',{input:load});assert.equal(response.rows.length,100);assert.equal(response.ready,true);latencies.push(performance.now()-started);}latencies.sort((a,b)=>a-b);
 evidence.performance={scope:'local real API,100 preview rows,10004 registry customers,one owner session,sequential samples',samples:5,p50_ms:Number(latencies[2].toFixed(2)),p95_ms:Number(latencies[4].toFixed(2)),proposed_p95_ms:2000};assert(latencies[4]<2000,'100-row preview exceeds proposed local2s target');
 evidence.distinct_key_source_race=true;evidence.revoked_identity_rejects_old_preview=true;
 // Direct RPC validation cannot bypass the API bounds.
 
 for(const bad of [null,[],false,{...input,rows:[]},{...input,expected_debit_cents:'0'},{...input,rows:Array(101).fill({})},{...input,as_of:'2026-02-30'}])assert.equal((await rpc('owner','preview',{p_input:bad})).error?.code,'PT422');
 await lab.sql(`UPDATE public.memberships SET active=false WHERE office_id='${office}' AND user_id='${users.owner}';`);
 await call('detail',{batch_id:applied.batch_id},403);await call('apply',{input,fingerprint:p.fingerprint,key},403);
 evidence.preview=p.rows.map(({row,outcome,reason})=>({row,outcome,reason}));evidence.real_storage_upload_and_validation=true;evidence.quarantine_not_released=true;evidence.file_hash_validation_required=true;evidence.later_payment_cents_preserved=3000;evidence.created_customers=3;evidence.initial_debit_cents=12345;evidence.initial_credit_cents=500;evidence.new_payments=0;evidence.new_cash_entries=0;evidence.new_service_charges=0;evidence.concurrent_retry=true;evidence.source_reference_deduplication=true;evidence.reversed_keeps_later_snapshot=true;evidence.reversed_does_not_resurrect=true;evidence.owner_revocation_denies_replay=true;evidence.scope_denied=['anonymous','admin','employee','client','other office'];
 await mkdir('docs/evidencias/etapa-37',{recursive:true});await writeFile('docs/evidencias/etapa-37/laboratorio.json',JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));
}catch(e){console.error('Imports37 laboratory: '+(e?.message??String(e)));process.exitCode=1;}
finally{for(const c of sdks)await c.auth.dispose();if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await lab?.close();}
