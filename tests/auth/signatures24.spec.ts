import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {createHash,randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {emptyService} from '../../shared/services';
import {emptyTemplate} from '../../shared/templates';
import type {SignatureState} from '../../shared/documentSignatures';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
const hash=(bytes:Buffer)=>createHash('sha256').update(bytes).digest('hex');
const uuid=(v:string)=>{expect(v).toMatch(/^[0-9a-f-]{36}$/);return v;};
/** Administrative scanner fixture ONLY in the disposable local database. */
async function localSql(query:string):Promise<string>{
 const container=process.env.AUTH_LAB_DB_CONTAINER;
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(url)||!/^jn-auth-lab-[0-9a-f-]{36}-postgres$/.test(container??''))throw Error('Local laboratory required');
 const env={...process.env};for(const k of ['DOCKER_HOST','DOCKER_CONTEXT','DOCKER_TLS','DOCKER_TLS_VERIFY','DOCKER_CERT_PATH'])delete env[k];
 return new Promise((resolve,reject)=>{const child=spawn('docker',['--host=unix:///var/run/docker.sock','exec','-i',container!,'psql','-X','-v','ON_ERROR_STOP=1','-q','-A','-t','-U','postgres','-d','auth_lab'],{env,stdio:['pipe','pipe','pipe']});let output='';const timer=setTimeout(()=>{child.kill('SIGKILL');reject(Error('Local SQL timeout'));},10000);child.stdout.on('data',v=>{output+=v;});child.stderr.on('data',v=>{console.error(String(v));});child.on('error',reject);child.on('close',code=>{clearTimeout(timer);code===0?resolve(output.trim()):reject(Error('Local SQL fixture failed'));});child.stdin.on('error',()=>{});child.stdin.end(query);});
}
test('formalização24 real: Auth/API/Storage/worker, saída separada, original exato e bloqueios atuais',async({request,page})=>{
 test.setTimeout(180000);
 expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const owner=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),client=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const signed=await owner.auth.signInWithPassword({email:'manager@example.test',password});expect(signed.error).toBeNull();expect((await client.auth.signInWithPassword({email:'portalclient@example.test',password})).error).toBeNull();
 const headers={Authorization:'Bearer '+signed.data.session!.access_token};
 async function post(path:string,body:Record<string,unknown>,status=200){const r=await request.post('/api/'+path,{headers,data:{office_id:office,...body}});expect(r.status(),path+' '+await r.text()).toBe(status);return r.ok()?(await r.json()).data:undefined;}
 async function artifact(publication_id:string,action:string,status=200){const r=await request.post('/api/document-workflow/artifact',{headers,data:{office_id:office,publication_id,action}});expect(r.status(),action+' '+(r.ok()?'':await r.text())).toBe(status);return r;}
 try{
 const suffix=randomUUID().slice(0,8).toUpperCase(),title='Formalização local24 '+suffix;
 const template=await post('templates/save',{template_id:null,definition:{...emptyTemplate,code:'SIG24-'+suffix,name:title,content:'Declaração de laboratório24 sem dados reais.',demonstration:false,review_required:false,signature_policy:'external'},expected_version:0,reason:'Modelo sintético exclusivamente local',idempotency_key:randomUUID()});
 const templateVersion=template.versions[0].id;await post('templates/approve',{template_id:template.id,version_id:templateVersion,expected_version:1,reason:'Aprovação local do modelo',idempotency_key:randomUUID()});
 const service=await post('services',{service:{...emptyService,code:'SIG24-'+suffix,name:title,category:'Rural',price_cents:2000},reason:'Serviço sintético local24'},201);
 const attendance=await post('requests',{idempotency_key:randomUUID(),request:{origin:'presencial',title,customer_id:null,assignee_id:null,priority:'normal',priority_reason:'',internal_note:'',items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}]}},201);
 let document=await post('documents/create',{request_id:attendance.id,request_item_id:attendance.items[0].id,template_version_id:templateVersion,participants:[],idempotency_key:randomUUID()});
 const operate=async(operation:unknown)=>{document=await post('documents/operate',{document_id:document.id,operation});};
 await operate({kind:'prepare',expected_revision:document.revision,idempotency_key:randomUUID()});
 const workflow=async(command:unknown,status=200)=>post('document-workflow/command',{document_id:document.id,command,idempotency_key:randomUUID()},status);
 let state=await workflow({kind:'freeze',expected_revision:document.revision,reason:'Publicação sintética local24'}),publication=state.publications[0];
 let signature:SignatureState=await post('document-workflow/signature-state',{publication_id:publication.id,page:1});
 const signatureCommand=async(command:Record<string,unknown>,status=200,idempotency_key=randomUUID()):Promise<SignatureState>=>post('document-workflow/signature-command',{publication_id:publication.id,command:{expected_revision:document.revision,expected_event_id:signature.last_event_id,reason:'Conferência sintética local24',...command},idempotency_key},status);
 signature=await signatureCommand({kind:'configure',mode:'external',exit_policy:'after_settlement',expected_signers:['Titular fictício24']});
 const retryCommand={kind:'configure',mode:'external',exit_policy:'after_settlement',expected_signers:['Titular fictício24'],expected_revision:document.revision,expected_event_id:signature.last_event_id,reason:'Tentativa idempotente local24'},retryKey=randomUUID();
 signature=await post('document-workflow/signature-command',{publication_id:publication.id,command:retryCommand,idempotency_key:retryKey});
 expect((await post('document-workflow/signature-command',{publication_id:publication.id,command:retryCommand,idempotency_key:retryKey})).last_event_id).toBe(signature.last_event_id);
 await post('document-workflow/signature-command',{publication_id:publication.id,command:{...retryCommand,reason:'Payload divergente local24'},idempotency_key:retryKey},409);
 await artifact(publication.id,'generate');
 await artifact(publication.id,'signing',422); // no charge is never settlement
 signature=await signatureCommand({kind:'configure',mode:'external',exit_policy:'before_settlement',expected_signers:['Titular fictício24']});
 const base=await artifact(publication.id,'signing'),baseBytes=await base.body();expect(base.headers()['content-type']).toContain('application/pdf');expect(baseBytes.subarray(0,5).toString()).toBe('%PDF-');
 await artifact(publication.id,'download',422); // exit does not imply signature/finance/final handoff
 await workflow({kind:'handoff',publication_id:publication.id,expected_revision:document.revision,reason:'Encaminhamento financeiro antes da assinatura'});
 const charge=await post('charges/create',{request_id:attendance.id,installments:[{due_date:'2026-12-01',amount_cents:2000}],idempotency_key:randomUUID()});
 const configure=async(configuration:unknown)=>(await post('cash/configure',{configuration,idempotency_key:randomUUID()})).resource.id;
 const unit=await configure({kind:'unit',id:null,expected_version:null,name:'Unidade24 '+suffix,active:true});
 const account=await configure({kind:'account',id:null,expected_version:null,name:'Espécie24 '+suffix,active:true,unit_id:unit,type:'cash'});
 const method=await configure({kind:'payment_method',id:null,expected_version:null,name:'Forma24 '+suffix,active:true,unit_id:unit,type:'cash',destination_account_id:account});
 const opened=await post('cash/open',{unit_id:unit,cash_account_id:account,opening_cents:0,idempotency_key:randomUUID()}),cash=opened.sessions.find((s:{unit_id:string})=>s.unit_id===unit).id;
 await post('cash/payment',{operation:{kind:'record',session_id:cash,expected_version:1,idempotency_key:randomUUID(),evidence:'Pagamento sintético local24',payment_method_id:method,status:'confirmed',allocations:[{charge_id:charge.charge.id,expected_charge_version:1,amount_cents:2000}],presented_cents:2000,fee_cents:0,settlement:'not_applicable',settled_on:null,external_reference:null}});
 // A real PDF from the renderer, with an explicit synthetic external suffix. This proves byte preservation, not cryptographic signature validity.
 const external=Buffer.concat([baseBytes.subarray(0,baseBytes.lastIndexOf('%%EOF')),Buffer.from('% Assinatura EXCLUSIVAMENTE FICTICIA para laboratorio24\n%%EOF\n')]),digest=hash(external);
 const intent=await post('attachments/intents',{input:{request_id:attendance.id,request_item_id:attendance.items[0].id,name:'original-externo-local24.pdf',mime_type:'application/pdf',size_bytes:external.length,sha256:digest,classification:'documento',idempotency_key:randomUUID()}},201);
 expect((await owner.storage.from('request-attachments').upload(intent.object_path,external,{contentType:'application/pdf',upsert:false})).error).toBeNull();
 const processed=await post('attachments/process',{action:'validate',args:{intent_id:intent.intent_id}});expect(processed.file).toMatchObject({status:'quarentena',scanner_status:'not_configured',sha256:digest});
 signature=await signatureCommand({kind:'import',file_id:intent.file.id});
 await signatureCommand({kind:'validate',result:'validated',verified_signers:['Titular fictício24'],evidence:'Scanner real ausente deve impedir validação',sha256:digest},422);
 await artifact(publication.id,'download',422);
 // Explicit local fixture: no real scanner is configured or claimed.
 await localSql(`UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id='${uuid(intent.file.id)}';`);
 await signatureCommand({kind:'validate',result:'validated',verified_signers:[],evidence:'Signatário faltante deve impedir validação',sha256:digest},422);
 await signatureCommand({kind:'validate',result:'validated',verified_signers:['Titular fictício24'],evidence:'Hash diferente deve impedir validação','sha256':'0'.repeat(64)},422);
 signature=await signatureCommand({kind:'validate',result:'validated',verified_signers:['Titular fictício24'],evidence:'Declaração humana FICTÍCIA local, conferida sobre bytes exatos; não houve validação criptográfica real',sha256:digest});
 expect(signature.status).toBe('validated');expect(signature.file).toMatchObject({id:intent.file.id,sha256:digest,size_bytes:external.length});
 const download=await artifact(publication.id,'download');expect(await download.body()).toEqual(external);expect(hash(await download.body())).toBe(digest);expect(Number(download.headers()['content-length'])).toBe(external.length);
 expect(await localSql(`SELECT protected OR EXISTS(SELECT FROM private.file_references WHERE file_id='${uuid(intent.file.id)}') FROM public.files WHERE id='${uuid(intent.file.id)}';`)).toBe('t');
 // Current quarantine overrides previously accepted evidence.
 await localSql(`UPDATE public.files SET status='quarentena',scanner_status='not_configured' WHERE id='${uuid(intent.file.id)}';`);await artifact(publication.id,'download',422);await localSql(`UPDATE public.files SET status='disponivel',scanner_status='clean' WHERE id='${uuid(intent.file.id)}';`);
 signature=await signatureCommand({kind:'revoke'});expect(signature.status).toBe('invalid');await artifact(publication.id,'download',403);
 await signatureCommand({kind:'configure',mode:'physical',exit_policy:'after_settlement',expected_signers:['Titular fictício24']},409);
 // Physical acts belong to a separate publication with its approved physical policy.
 const physicalTemplate=await post('templates/save',{template_id:null,definition:{...emptyTemplate,code:'PHY24-'+suffix,name:title+' físico',content:'Representação de via física FICTÍCIA local24.',demonstration:false,review_required:false,signature_policy:'physical'},expected_version:0,reason:'Modelo físico sintético local24',idempotency_key:randomUUID()});
 await post('templates/approve',{template_id:physicalTemplate.id,version_id:physicalTemplate.versions[0].id,expected_version:1,reason:'Aprovação local do modelo físico',idempotency_key:randomUUID()});
 document=await post('documents/create',{request_id:attendance.id,request_item_id:attendance.items[0].id,template_version_id:physicalTemplate.versions[0].id,participants:[],idempotency_key:randomUUID()});
 await operate({kind:'prepare',expected_revision:document.revision,idempotency_key:randomUUID()});state=await workflow({kind:'freeze',expected_revision:document.revision,reason:'Publicação física sintética local24'});publication=state.publications[0];signature=await post('document-workflow/signature-state',{publication_id:publication.id,page:1});
 await artifact(publication.id,'generate');await workflow({kind:'handoff',publication_id:publication.id,expected_revision:document.revision,reason:'Encaminhamento da representação física local24'});
 signature=await signatureCommand({kind:'configure',mode:'physical',exit_policy:'after_settlement',expected_signers:['Titular fictício24']});
 signature=await signatureCommand({kind:'physical',verified_signers:['Titular fictício24'],evidence:'Conferência manual fictícia local de via física',signed_on:'2026-11-04',custody:'Arquivo FICTÍCIO local24',notary_reference:'Referência cartório FICTÍCIA local24'});expect(signature.status).toBe('validated');
 const physical=await artifact(publication.id,'download');expect(hash(await physical.body())).toBe(await localSql(`SELECT sha256 FROM private.document_artifact_jobs WHERE publication_id='${uuid(publication.id)}' AND completed_at IS NOT NULL;`));expect(hash(await physical.body())).not.toBe(digest);
 const times:number[]=[],payloads:number[]=[];for(let i=0;i<20;i++){const t=performance.now();const measured=await request.post('/api/document-workflow/signature-state',{headers,data:{office_id:office,publication_id:publication.id,page:1}});expect(measured.status()).toBe(200);times.push(performance.now()-t);payloads.push((await measured.body()).length);}times.sort((a,b)=>a-b);console.log(JSON.stringify({local_measurement:'document-workflow/signature-state',samples:20,p50_ms:Math.round(times[9]),p95_ms:Math.round(times[18]),payload_bytes:Math.max(...payloads),http_round_trips_per_sample:1,scanner:'explicit local fixture only'}));
 // A real current capability revocation is applied through the management RPC.
 const membership=await owner.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:'reviewer23@example.test',p_status:'all'});expect(membership.error).toBeNull();const membershipId=membership.data.items[0].id;
 const permissions=['foundation.access','requests.read','requests.read_all','customers.read','customers.read_all','documents.read'];
 const grant=async(p_permissions:string[])=>{expect((await owner.rpc('team_set_member',{p_office_id:office,p_membership_id:membershipId,p_role_code:'employee',p_active:true,p_permissions,p_request_id:randomUUID()})).error).toBeNull();};
 await grant(permissions);const reader=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});try{expect((await reader.auth.signInWithPassword({email:'reviewer23@example.test',password})).error).toBeNull();const readerHeaders={Authorization:'Bearer '+(await reader.auth.getSession()).data.session!.access_token};const read=()=>request.post('/api/document-workflow/signature-state',{headers:readerHeaders,data:{office_id:office,publication_id:publication.id,page:1}});expect((await read()).status()).toBe(200);await grant(permissions.filter(p=>p!=='documents.read'));expect((await read()).status()).toBe(403);}finally{await reader.auth.dispose();}
 expect((await request.post('/api/document-workflow/signature-state',{headers,data:{office_id:randomUUID(),publication_id:publication.id,page:1}})).status()).toBe(404);
 // Client cannot inspect signature evidence or operate the internal decision.
 const denied=await request.post('/api/document-workflow/signature-state',{headers:{Authorization:'Bearer '+(await client.auth.getSession()).data.session!.access_token},data:{office_id:office,publication_id:publication.id,page:1}});expect(denied.status()).toBe(403);
 // Real browser uses authenticated state, without traces that retain credentials.
 page.setDefaultTimeout(15000);
 page.on('framenavigated',frame=>{if(frame===page.mainFrame())console.log(JSON.stringify({browser24:'navigation',path:new URL(frame.url()).pathname}));});
 page.on('response',response=>{const path=new URL(response.url()).pathname;if(['/api/auth/context','/api/document-workflow/signature-state','/api/document-workflow/signature-command'].includes(path))console.log(JSON.stringify({browser24:'response',path,status:response.status()}));});
 await page.setViewportSize({width:360,height:740});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('manager@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 console.log('browser24: login verified');
 await page.goto('/documentos');await page.getByRole('tab',{name:'Documentos emitidos',exact:true}).click();console.log('browser24: issued tab');await page.getByLabel('Buscar documento',{exact:true}).fill(document.title);await page.getByLabel('Buscar documento',{exact:true}).press('Enter');await page.getByRole('button',{name:`Abrir documento ${document.title}`,exact:true}).click();console.log('browser24: document opened');await page.getByRole('tab',{name:'Versões e PDF',exact:true}).click();console.log('browser24: PDF tab');await page.getByText('Revisão e entrega',{exact:true}).click();await page.getByLabel('Ação documental',{exact:true}).selectOption('formalization');console.log('browser24: formalization selected');
 const panel=page.getByRole('region',{name:'Formalização',exact:true});await expect(panel).toContainText('Física / cartório');await panel.getByRole('combobox',{name:'Operação de formalização',exact:true}).selectOption('revoke');await panel.getByLabel('Motivo da formalização',{exact:true}).fill('Revogação real pelo navegador local24');const browserDecision=page.waitForResponse(r=>r.url().endsWith('/api/document-workflow/signature-command'));await panel.getByRole('button',{name:'Registrar formalização',exact:true}).click();const browserResponse=await browserDecision;expect(browserResponse.status(),await browserResponse.text()).toBe(200);await expect(panel).toContainText('Inválida / revogada');await artifact(publication.id,'download',403);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await operate({kind:'save',expected_revision:document.revision,input:{...document.input,content:document.input.content+' Alteração posterior exige formalização nova.'},idempotency_key:randomUUID()});
 await artifact(publication.id,'download',403);await artifact(publication.id,'signing',422);
 // Exact saved JWT loses authority when its real Auth session ends.
 expect((await owner.auth.signOut({scope:'global'})).error).toBeNull();await post('document-workflow/signature-state',{publication_id:publication.id,page:1},401);
 console.log(JSON.stringify({proof:'signatures24',external_sha256:digest,external_size_bytes:external.length,base_sha256:hash(baseBytes),byte_identical:true,local_only:true,real_scanner:false}));
 }finally{await owner.auth.dispose();await client.auth.dispose();}
});
