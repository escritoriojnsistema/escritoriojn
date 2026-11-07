import {test,expect,type Page} from '@playwright/test';
import {office21 as office,user21 as user,doc21,document21 as detail} from '../fixtures/documents21';
import type {WorkflowState} from '../../shared/documentWorkflow';
import type {ReviewMetadata} from '../../shared/editorialReview';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contratos locais com dados fictícios.');
const publication='00000000-0000-4000-8000-000000000022',event='00000000-0000-4000-8000-000000000023',reviewer='00000000-0000-4000-8000-000000000024';
async function setup(page:Page,initial:'none'|'in_review'|'withdrawn'='in_review'){
 const review:ReviewMetadata={status:initial==='none'?'in_review':initial,reviewer_id:null,reviewer_name:null,prepared_by_name:'Preparador de teste',due_at:null,submitted_at:'2026-11-03T12:00:00Z',last_event_id:event,last_reason:'Conferir cláusula',last_actor_name:'Equipe',can_decide:true,can_withdraw:true,can_submit:initial==='withdrawn'};
 const workflow:WorkflowState={document_id:doc21,current_revision:1,can_work:true,can_review:true,publications:initial==='none'?[]:[{id:publication,revision:1,title:detail.title,created_at:detail.updated_at,created_by:user,review_required:true,signature_policy:'none',approved:true,signed:false,handed_off:false,artifact_ready:false,ready:false,blockers:['review'],review}]};
 const state={workflow,posts:[] as any[],failures:[] as number[],queries:[] as any[],history:[] as any[],members:[] as any[]};
 const permissions=['documents.exceptions.request','documents.exceptions.decide','documents.signatures.manage','documents.signatures.validate','files.read','files.upload','foundation.access','documents.read','documents.update','documents.review','requests.read','customers.read'];
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório de teste',display_name:'Equipe',role_code:'owner',permissions}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/document-commercial/intake',r=>r.fulfill({json:{data:null}}));
 await page.route('**/api/documents/search',r=>r.fulfill({json:{data:{items:[{id:doc21,title:detail.title,request_protocol:detail.request_protocol,status:'prepared',revision:1,demonstration:false,updated_at:detail.updated_at}],page:1,page_size:5,total:1}}}));
 await page.route('**/api/documents/detail',r=>r.fulfill({json:{data:{...detail,status:'prepared'}}}));
 await page.route('**/api/document-workflow/**',r=>{const b=r.request().postDataJSON(),path=new URL(r.request().url()).pathname.split('/').at(-1);let data:unknown;
 if(path==='state')data=state.workflow;
 else if(path==='versions')data={items:[],total:0,page:1,page_size:5,current_revision:1};
 else if(path==='review-queue'){state.queries.push(b);data={items:[{document_id:doc21,request_id:detail.request_id,publication_id:publication,protocol:detail.request_protocol,title:detail.title,revision:1,pending_count:2,review}],total:8,page:b.page,page_size:b.size};}
 else if(path==='reviewers'){state.members.push(b);data={items:[{id:reviewer,label:'Revisor elegível',role_code:'employee'}],total:8,page:b.page,page_size:b.size};}
 else if(path==='review-history'){state.history.push(b);data={items:[{id:event,publication_id:publication,revision:1,kind:'submit',actor_name:'Equipe',reason:'Conferir cláusula',created_at:detail.updated_at,reviewer_name:null,due_at:null}],total:6,page:b.page,page_size:5};}
 else if(path==='command'){state.posts.push(b);const status=state.failures.shift();if(status)return r.fulfill({status,json:{error:{code:'FIXTURE'}}});data=state.workflow;}
 else return r.fulfill({status:404,json:{error:{code:'FIXTURE'}}});
 return r.fulfill({json:{data}});});return state;
}
const delivery='00000000-0000-4000-8000-000000000030';
async function deliveries(page:Page,ready=true){
 await setup(page);const value={publication_id:publication,revision:1,ready,blockers:ready?[]:['payment'],can_deliver:true,can_revoke:true,recipient:{id:doc21,name:'Destinatário de teste',contacts:[{position:0,phone:'5511999999999'}]},items:[] as any[],total:0,page:1,page_size:5};const state={value,posts:[] as any[],failures:[] as number[],reads:0};
 await page.route('**/api/document-workflow/delivery-*',r=>{if(r.request().url().endsWith('delivery-command')){const b=r.request().postDataJSON();state.posts.push(b);const status=state.failures.shift();if(status)return r.fulfill({status,json:{error:{code:'FIXTURE'}}});if(b.command.kind==='begin'){value.items=[{id:delivery,channel:b.command.channel,revision:1,sha256:'a'.repeat(64),recipient_name:'Destinatário de teste',recipient_customer_id:doc21,phone:b.command.channel==='whatsapp'?'5511999999999':null,contact_position:b.command.channel==='whatsapp'?0:null,status:'attempt',last_event_id:event,created_at:detail.updated_at,actor_name:'Operador de teste',events:[]}];value.total=1;}}else state.reads++;return r.fulfill({json:{data:r.request().url().endsWith('delivery-command')?{...value,result_delivery_id:delivery}:value}});});
 await page.goto('/documentos?aba=issued');await page.getByRole('button',{name:'Abrir documento Contrato de Teste',exact:true}).click();await page.getByRole('tab',{name:'Versões e PDF',exact:true}).click();await page.getByText('Revisão e entrega',{exact:true}).click();await page.getByLabel('Ação documental').selectOption('delivery');await expect(page.getByRole('heading',{name:'Entregas e impressão',exact:true})).toBeVisible();return state;
}
for(const width of [320,360,768,1440])test(`entregas26 canal e destinatário compactos ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});const s=await deliveries(page);await page.getByLabel('Operação de entrega').selectOption('whatsapp');await page.getByLabel('Telefone vinculado').selectOption('0');await page.getByLabel('Conferi o destinatário e o canal').check();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(1);expect(s.posts[0].command.recipient_customer_id).toBe(doc21);expect(s.posts[0].command.expected_phone).toBe('5511999999999');await expect(page.getByText('Tentativa',{exact:true})).toBeVisible();await expect(page.getByText('Recebimento confirmado',{exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Abrir conversa conferida'})).toHaveAttribute('href',/^https:\/\/wa.me\/5511999999999/);await expect(page.locator('[role="progressbar"],.spinner')).toHaveCount(0);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/entregas26-${width}.png`,fullPage:true});
});
test('entregas26 bloqueia impressão pendente sem chamar mutação',async({page})=>{const s=await deliveries(page,false);await page.getByLabel('Operação de entrega').selectOption('print');await page.getByLabel('Conferi o destinatário e o canal').check();await expect(page.getByRole('button',{name:'Registrar entrega',exact:true})).toBeDisabled();expect(s.posts.length).toBe(0);});
test('entregas26 repete tentativa503 com chave e dados originais',async({page})=>{const s=await deliveries(page);s.failures.push(503);await page.getByLabel('Operação de entrega').selectOption('print');await page.getByLabel('Conferi o destinatário e o canal').check();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect.poll(()=>s.posts.length).toBe(2);expect(s.posts[0]).toEqual(s.posts[1]);});
for(const code of [401,403])test(`entregas26 descarta destinatário após ${code}`,async({page})=>{const s=await deliveries(page);s.failures.push(code);await page.getByLabel('Operação de entrega').selectOption('print');await page.getByLabel('Conferi o destinatário e o canal').check();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect(page.getByLabel('Conferi o destinatário e o canal')).toHaveCount(0);});
test('entregas26 exige nova conferência quando telefone oficial muda durante revalidação',async({page})=>{const s=await deliveries(page);await page.getByLabel('Operação de entrega').selectOption('whatsapp');await page.getByLabel('Telefone vinculado').selectOption('0');await page.getByLabel('Conferi o destinatário e o canal').check();s.value.recipient.contacts[0].phone='5511888888888';await page.getByLabel('Ação documental').selectOption('release');await page.getByLabel('Ação documental').selectOption('delivery');await expect.poll(()=>s.reads).toBe(2);await expect(page.getByLabel('Conferi o destinatário e o canal')).not.toBeChecked();await expect(page.getByRole('button',{name:'Registrar entrega',exact:true})).toBeDisabled();expect(s.posts.length).toBe(0);});

test('audit26 initial503 permite atualizar no painel',async({page})=>{
 await setup(page);
 await page.route('**/api/document-workflow/delivery-state',r=>r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}}));
 await page.goto('/documentos?aba=issued');await page.getByRole('button',{name:'Abrir documento Contrato de Teste',exact:true}).click();await page.getByRole('tab',{name:'Versões e PDF',exact:true}).click();await page.getByText('Revisão e entrega',{exact:true}).click();await page.getByLabel('Ação documental').selectOption('delivery');
 await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByRole('button',{name:'Registrar entrega',exact:true})).toBeEnabled();
 await expect(page.getByLabel('Operação de entrega')).toHaveCount(0);
});

test('audit26 changed contact removes old conversation link',async({page})=>{
 const s=await deliveries(page);await page.getByLabel('Operação de entrega').selectOption('whatsapp');await page.getByLabel('Telefone vinculado').selectOption('0');await page.getByLabel('Conferi o destinatário e o canal').check();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();
 await expect(page.getByRole('link',{name:'Abrir conversa conferida'})).toBeVisible();
 s.value.recipient.contacts[0].phone='5511888888888';await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect.poll(()=>s.reads).toBe(2);
 await expect(page.getByRole('link',{name:'Abrir conversa conferida'})).toHaveCount(0);
});

test('audit26 replay selects original attempt',async({page})=>{
 const s=await deliveries(page);let n=0;
 const manual={id:delivery,channel:'print',revision:1,sha256:'a'.repeat(64),recipient_name:'Destinatário de teste',recipient_customer_id:doc21,phone:null,status:'attempt',last_event_id:event,created_at:detail.updated_at,actor_name:'Operador',events:[]};
 const other={...manual,id:reviewer,channel:'download',status:'available'};
 await page.route('**/api/document-workflow/delivery-command',r=>{n++;if(n===1)return r.fulfill({status:503,json:{error:{code:'UNAVAILABLE'}}});s.value.items=[other,manual];s.value.total=7;s.value.page=2;return r.fulfill({json:{data:{...s.value,result_delivery_id:delivery}}});});
 await page.getByLabel('Operação de entrega').selectOption('print');await page.getByLabel('Conferi o destinatário e o canal').check();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();
 await expect(page.getByLabel('Entrega selecionada')).toHaveValue(delivery);
 await expect(page.getByRole('button',{name:'Obter arquivo final',exact:true})).toBeVisible();
});
test('audit26 same phone at another position requires new confirmation',async({page})=>{
 const s=await deliveries(page);await page.getByLabel('Operação de entrega').selectOption('whatsapp');await page.getByLabel('Telefone vinculado').selectOption('0');await page.getByLabel('Conferi o destinatário e o canal').check();await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect(page.getByRole('link',{name:'Abrir conversa conferida'})).toBeVisible();s.value.recipient.contacts[0].position=1;await page.getByRole('button',{name:'Registrar entrega',exact:true}).click();await expect.poll(()=>s.reads).toBe(2);await expect(page.getByRole('link',{name:'Abrir conversa conferida'})).toHaveCount(0);
});
