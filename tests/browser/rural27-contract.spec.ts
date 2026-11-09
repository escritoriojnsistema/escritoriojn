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
 const permissions=['documents.exceptions.request','documents.exceptions.decide','documents.signatures.manage','documents.signatures.validate','files.read','files.upload','foundation.access','documents.read','documents.update','documents.review','requests.read','customers.read','customers.create','customers.update','rural.read','rural.read_all','rural.create','rural.parties.manage','rural.records.manage'];
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

for(const width of [320,360,1440])test(`rural27 cadastro separado ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 let posted:any;const property={id:doc21,customer_id:user,name:'Fazenda de teste',municipality:'Cidade',state:'MG',location:'Zona rural',identifiers:{},version:1};
 await page.route('**/api/rural/**',r=>{const b=r.request().postDataJSON();if(r.request().url().endsWith('command')){posted=b;return r.fulfill({json:{data:{id:doc21}}});}return r.fulfill({json:{data:b.property_id?{property,parties:[],records:[],parties_total:0,records_total:0,page:1}:{items:[],page:1,page_size:5}}});});
 await page.route('**/api/customers/search',r=>r.fulfill({json:{data:{items:[{id:user,kind:'person',name:'Maria de teste',identifier_masked:null,created_at:detail.updated_at}],total:1,page:1,page_size:5}}}));
 await page.goto('/imoveis-rurais');await page.getByRole('button',{name:'Cadastrar imóvel',exact:true}).click();await page.getByLabel('Cliente selecionado').selectOption(user);await page.getByLabel('Nome do imóvel').fill('Fazenda de teste');await page.getByLabel('Município',{exact:true}).fill('Cidade');await page.getByLabel('UF',{exact:true}).fill('MG');await page.getByRole('button',{name:'Salvar registro',exact:true}).click();await expect(page.getByRole('heading',{name:'Fazenda de teste',exact:true})).toBeVisible();expect(posted.command.customer_id).toBe(user);expect(posted.command.kind).toBe('create');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('.spinner,[role="progressbar"]')).toHaveCount(0);await page.screenshot({path:`/tmp/rural27-${width}.png`,fullPage:true});
});
