import {test,expect} from '@playwright/test';
import {createClient,type SupabaseClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {emptyService} from '../../shared/services';
import {emptyTemplate} from '../../shared/templates';
const url=process.env.AUTH_LAB_URL!,key=process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,office=process.env.AUTH_LAB_OFFICE!,password=process.env.AUTH_LAB_PASSWORD!;
test('editorial23 real: portal, atribuição, devolução no navegador, nova revisão e aprovação',async({page,request})=>{
 test.setTimeout(120000);
 expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
 const actors:Record<string,{sdk:SupabaseClient;headers:{Authorization:string}}>={};
 try{
 for(const name of ['manager','portalclient','editor23','reviewer23']){const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});expect((await sdk.auth.signInWithPassword({email:name+'@example.test',password})).error).toBeNull();actors[name]={sdk,headers:{Authorization:'Bearer '+(await sdk.auth.getSession()).data.session!.access_token}};}
 async function post(who:string,path:string,body:Record<string,unknown>,status=200){const r=await request.post('/api/'+path,{headers:actors[who].headers,data:{office_id:office,...body}});expect(r.status(),path+' '+await r.text()).toBe(status);return (await r.json()).data;}
 const owner=actors.manager.sdk;
 async function member(name:string){const {data,error}=await owner.rpc('team_dashboard',{p_office_id:office,p_kind:'members',p_page:1,p_query:name+'@example.test',p_status:'all'});expect(error).toBeNull();return data.items[0].id as string;}
 const editor=await member('editor23'),reviewer=await member('reviewer23');
 const base=['foundation.access','requests.read','requests.read_all','customers.read','customers.read_all','documents.read'];
 async function grant(id:string,permissions:string[]){expect((await owner.rpc('team_set_member',{p_office_id:office,p_membership_id:id,p_role_code:'employee',p_active:true,p_permissions:permissions,p_request_id:randomUUID()})).error).toBeNull();}
 await grant(editor,[...base,'templates.read','services.read','services.perform','documents.create','documents.update']);await grant(reviewer,[...base,'documents.review']);
 const suffix=randomUUID().slice(0,8).toUpperCase(),title='Documento editorial23 '+suffix;
 const template=await post('manager','templates/save',{template_id:null,definition:{...emptyTemplate,code:'REV23-'+suffix,name:title,content:'Declaração local de teste editorial.',demonstration:false,review_required:true},expected_version:0,reason:'Modelo do laboratório descartável',idempotency_key:randomUUID()});
 const version=template.versions[0].id;
 await post('manager','templates/approve',{template_id:template.id,version_id:version,expected_version:1,reason:'Aprovação humana local do modelo',idempotency_key:randomUUID()});
 const service=await post('manager','services',{service:{...emptyService,code:'REV23-'+suffix,name:title,category:'Rural',price_cents:2000,approval_required:true},reason:'Serviço local'},201);
 const created=await post('portalclient','requests',{idempotency_key:randomUUID(),request:{origin:'portal',title,message:'Solicitação fictícia local para revisão.'}},201);
 let attendance=await post('manager',`requests/${created.id}/actions`,{expected_version:1,mutation:{kind:'triage',customer_id:null,items:[{service_id:service.id,quantity:1,adjustment:{kind:'none',value:0,reason:''},fields:{},participant_ids:[],checklist:[]}],reason:'Triagem local editorial'}});
 attendance=await post('manager',`requests/${created.id}/actions`,{expected_version:attendance.version,mutation:{kind:'transfer',assignee_id:editor,reason:'Execução pelo editor local'}});
 let document=await post('editor23','documents/create',{request_id:created.id,request_item_id:attendance.items[0].id,template_version_id:version,participants:[],idempotency_key:randomUUID()});
 async function operate(operation:unknown){document=await post('editor23','documents/operate',{document_id:document.id,operation});}
 await operate({kind:'prepare',expected_revision:document.revision,idempotency_key:randomUUID()});
 const command=(who:string,value:unknown,idempotency_key=randomUUID(),status=200)=>post(who,'document-workflow/command',{document_id:document.id,command:value,idempotency_key},status);
 const submit={kind:'freeze',expected_revision:document.revision,reason:'Encaminhamento interno local23',reviewer_id:reviewer,due_at:null,expected_event_id:null},submitKey=randomUUID();
 let state=await command('editor23',submit,submitKey);expect((await command('editor23',submit,submitKey)).publications[0].id).toBe(state.publications[0].id);
 let publication=state.publications[0];
 await command('editor23',{kind:'approve',publication_id:publication.id,expected_revision:document.revision,expected_event_id:publication.review.last_event_id,reason:'Autoaprovação proibida'},randomUUID(),403);
 await page.setViewportSize({width:360,height:740});await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).fill('reviewer23@example.test');await page.getByLabel('Senha',{exact:true}).fill(password);await page.getByRole('button',{name:'Entrar na área da equipe',exact:true}).click();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 async function openReview(){await page.goto('/documentos');await page.getByRole('tab',{name:'Revisões',exact:true}).click();await page.getByLabel('Buscar revisão',{exact:true}).fill(title);await page.getByRole('button',{name:'Consultar revisões',exact:true}).click();await page.getByRole('link',{name:'Abrir documento',exact:true}).click();await page.getByRole('tab',{name:'Versões e PDF',exact:true}).click();await page.getByText('Revisão e entrega',{exact:true}).click();}
 await openReview();
 const internal='OBSERVACAO INTERNA LOCAL23: corrigir texto';
 async function browserDecision(kind:string,reason:string){await page.getByLabel('Ação documental',{exact:true}).selectOption(kind);await page.getByLabel('Motivo ou evidência da etapa',{exact:true}).fill(reason);const response=page.waitForResponse(r=>r.url().endsWith('/api/document-workflow/command'));await page.getByRole('button',{name:'Registrar ação',exact:true}).click();const r=await response;expect(r.status(),await r.text()).toBe(200);return (await r.json()).data;}
 state=await browserDecision('return',internal);expect(state.publications[0].review.status).toBe('returned');
 await command('reviewer23',{kind:'approve',publication_id:publication.id,expected_revision:document.revision,expected_event_id:publication.review.last_event_id,reason:'Decisão concorrente atrasada'},randomUUID(),409);
 let portal=await post('portalclient','document-workflow/request-reviews',{request_id:created.id,page:1,size:3});expect(portal.items[0].status).toBe('returned');expect(JSON.stringify(portal)).not.toContain(internal);
 await operate({kind:'save',expected_revision:document.revision,input:{...document.input,content:document.input.content+' Texto corrigido.'},idempotency_key:randomUUID()});expect(document.revision).toBe(2);
 await operate({kind:'prepare',expected_revision:document.revision,idempotency_key:randomUUID()});
 state=await command('editor23',{...submit,expected_revision:document.revision});publication=state.publications[0];
 await grant(reviewer,base);await command('reviewer23',{kind:'approve',publication_id:publication.id,expected_revision:document.revision,expected_event_id:publication.review.last_event_id,reason:'Capacidade revogada deve bloquear'},randomUUID(),403);await grant(reviewer,[...base,'documents.review']);
 await openReview();state=await browserDecision('approve','Revisão corrigida conferida localmente');expect(state.publications[0].approved).toBe(true);
 portal=await post('portalclient','document-workflow/request-reviews',{request_id:created.id,page:1,size:3});expect(portal.items.some((i:{status:string})=>i.status==='approved')).toBe(true);const serialized=JSON.stringify(portal);for(const forbidden of [internal,'reviewer_id','last_reason','last_actor_name','content'])expect(serialized).not.toContain(forbidden);
 // Two real authenticated HTTP decisions race for the exact same submission.
 await operate({kind:'save',expected_revision:document.revision,input:{...document.input,content:document.input.content+' Revisão para disputa concorrente.'},idempotency_key:randomUUID()});
 await operate({kind:'prepare',expected_revision:document.revision,idempotency_key:randomUUID()});
 state=await command('editor23',{...submit,expected_revision:document.revision});publication=state.publications[0];
 const outcomes=await Promise.all(['approve','reject'].map(kind=>request.post('/api/document-workflow/command',{headers:actors.reviewer23.headers,data:{office_id:office,document_id:document.id,idempotency_key:randomUUID(),command:{kind,publication_id:publication.id,expected_revision:document.revision,expected_event_id:publication.review.last_event_id,reason:'Decisão simultânea local '+kind}}})));
 expect(outcomes.map(r=>r.status()).sort()).toEqual([200,409]);
 const history=await post('reviewer23','document-workflow/review-history',{document_id:document.id,page:1});
 expect(history.items.filter((event:{revision:number;kind:string})=>event.revision===3&&['approve','reject'].includes(event.kind))).toHaveLength(1);
 for(const [who,path,body] of [['reviewer23','document-workflow/review-queue',{query:title,status:'',page:1,size:3}],['portalclient','document-workflow/request-reviews',{request_id:created.id,page:1,size:3}]] as const){const times:number[]=[];for(let i=0;i<20;i++){const start=performance.now();await post(who,path,body);times.push(performance.now()-start);}times.sort((a,b)=>a-b);console.log(JSON.stringify({local_measurement:path,samples:20,p50_ms:Math.round(times[9]),p95_ms:Math.round(times[18])}));}
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }finally{for(const actor of Object.values(actors))await actor.sdk.auth.signOut();}
});
