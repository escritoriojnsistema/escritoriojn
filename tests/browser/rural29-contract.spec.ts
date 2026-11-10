import { test, expect, type Page } from '@playwright/test';
import { emptyService } from '../../shared/services';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contrato visual fictício; Auth e banco reais têm suíte própria.');
test.beforeEach(async({page})=>{await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));await page.route('**/api/document-workflow/cash-queue',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5}}}));});
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',id='33333333-3333-4333-8333-333333333333',service='44444444-4444-4444-8444-444444444444',other='55555555-5555-4555-8555-555555555555';
const permissions=['foundation.access','requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','customers.read','services.perform','services.discount','services.surcharge','services.courtesy','services.price_override','users.manage','rural.read','rural.records.manage','customers.update','checklists.read'];
const definition={...emptyService,name:'Cópia de teste',code:'COPIA-TESTE',category:'Cópias',unit:'página',price_cents:50,max_discount_bps:1000,allow_courtesy:true,allow_price_override:true};
const date='2026-10-20T10:00:00.000Z';
const summary={id,protocol:'JN-2026-000001',title:'Atendimento de teste',public_status:'recebido',created_at:date,updated_at:date,status:'aberto',origin:'presencial',priority:'normal',created_by:user,assignee_id:user,assignee_name:'Pessoa Fictícia',customer_name:null,version:1};
const snapshot={service_id:service,version_id:service,version:1,effective_from:date,quoted_at:date,definition,quantity:2,unit_price_cents:50,base_cents:100,total_cents:100,adjustment:{kind:'none',value:0,reason:''}};
const staff={...summary,portal:false,customer_id:null,message:'',priority_reason:'',items:[{id:service,snapshot,fields:{},participant_ids:[],checklist:[]}],history:[{id,kind:'created',actor_id:user,actor_name:'Pessoa Fictícia',reason:'Abertura',from_status:null,to_status:'aberto',from_assignee:null,to_assignee:user,created_at:date}],history_page:1,history_total:1,can_update:true,can_transfer:true,can_cancel:true};
const portal={id,protocol:summary.protocol,title:'Solicitação de teste',public_status:'recebido',created_at:date,updated_at:date,portal:true,message:'Preciso de atendimento',services:['Cópia de teste']};
async function setupBase(page:Page,{client=false,empty=false,caps=permissions,role='owner'}={}){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:client?'client':role,permissions:client?['foundation.access']:caps,office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'}]}}}));
 await page.route('**/api/categories/state',r=>r.fulfill({json:{data:{items:[{id:other,name:'Atendimento',revision:1,is_documents:false}],can_manage:false}}}));
 await page.route('**/api/requests**',r=>{
  const url=r.request().url(),b=r.request().postDataJSON();expect(r.request().headers().authorization).toMatch(/^Bearer /);
  if(url.endsWith('/search'))return r.fulfill({json:{data:{items:empty?[]:[client?portal:summary],total:empty?0:1,page:b.page,page_size:b.size,portal:client}}});
  if(url.endsWith('/options'))return r.fulfill({json:{data:{items:b.kind==='services'?[{id:service,label:definition.name,definition}]:b.kind==='assignees'?[{id:other,label:'Outra Pessoa'}]:[{id:other,label:'Cliente Fictício'}],total:1,page:b.page,page_size:b.size}}});
  if(url.endsWith('/detail'))return r.fulfill({json:{data:client?portal:{...staff,can_update:caps.includes('requests.update'),can_transfer:caps.includes('requests.transfer'),can_cancel:caps.includes('requests.cancel')}}});
  if(url.endsWith('/actions'))return r.fulfill({json:{data:b.mutation.kind==='transfer'?{access_lost:true}:{...staff,version:2,history:[...staff.history,{...staff.history[0],id:other,kind:b.mutation.kind,reason:b.mutation.note??b.mutation.reason}]}}});
  return r.fulfill({status:201,json:{data:client?{...portal,title:b.request.title,message:b.request.message}:{...staff,title:b.request.title}}});
 });
}
async function setup29(page:Page,{employee=false,client=false}={}){
 await setupBase(page,{client,role:employee?'employee':'owner'});
 let ruralCase:any={id,kind:'CAR',stage:'recebido',pending:'',updated_at:date,property_name:'Imóvel fictício29',version:1,can_prepare:!client,can_reserved:false,can_complement:false,can_handoff:!client,can_complete:false,checklist_pending:1,external_reference:'',result_file_id:null};
 const state={posts:[] as any[],failures:[] as number[]};
 await page.route('**/api/rural/workflow-state',r=>r.fulfill({json:{data:{case:ruralCase,properties:[{id:other,name:'Imóvel fictício29'}],items:[{id:service,name:'CAR teste',kind:'CAR',config_version:1}],owners:[{id:other,name:'Proprietário fictício'}],history:[{stage:'recebido',actor_name:'Funcionário fictício',created_at:date}],history_total:1,page:1,can_configure:!employee&&!client,can_open:!client}}}));
 await page.route('**/api/rural/workflow-command',r=>{const b=r.request().postDataJSON();state.posts.push(b);const failure=state.failures.shift();if(failure)return r.fulfill({status:failure,json:{error:{code:'TEST'}}});const c=b.command;ruralCase={...ruralCase,stage:c.kind==='handoff'?'encaminhado':c.kind==='advance'?c.stage:c.kind==='complement'?'complementacao':ruralCase.stage,version:ruralCase.version+1,can_prepare:false,can_handoff:false,can_reserved:!employee,can_complement:!employee};return r.fulfill({json:{data:{id}}});});
 if(client){await page.route('**/api/requests/*/detail',r=>r.fulfill({json:{data:{...portal,rural_progress:{kind:'CAR',stage:'complementacao',pending:'Enviar documento legível',updated_at:date}}}}));}
 await page.goto(client?'/minhas-solicitacoes':'/solicitacoes');await page.getByRole('button',{name:`Ver solicitação ${summary.protocol}`,exact:true}).click();
 if(!client)await page.getByRole('button',{name:'CCIR/CAR · Organizar e encaminhar',exact:true}).click();
 return state;
}
for(const [width,height] of [[320,640],[360,640],[768,900],[1440,900]])test(`29: encaminhamento compacto, sem loader e com menu em ${width}`,async({page})=>{
 await page.setViewportSize({width,height});const state=await setup29(page,{employee:true});await expect(page.getByText('CAR · Recebido',{exact:false})).toBeVisible();await page.getByLabel('Área CCIR/CAR').selectOption('handoff');await page.getByLabel('Proprietário responsável').selectOption(other);
 await expect(page.getByRole('button',{name:'Salvar encaminhamento',exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
 if(width<768){const nav=page.getByRole('navigation',{name:'Atalhos do aplicativo'});expect(await nav.getByRole('link').count()).toBeLessThanOrEqual(4);const action=await page.getByRole('button',{name:'Salvar encaminhamento',exact:true}).boundingBox(),bar=await nav.boundingBox();expect(action!.y+action!.height).toBeLessThanOrEqual(bar!.y);}
 if(process.env.TEAM_UI_CAPTURE)await page.screenshot({path:`docs/evidencias/etapa-29/encaminhamento-${width}.png`,fullPage:true});
 await page.getByRole('button',{name:'Salvar encaminhamento',exact:true}).click();await expect(page.getByText('CAR · Encaminhado ao proprietário',{exact:false})).toBeVisible();expect(state.posts[0].command).toEqual({kind:'handoff',owner_id:other,expected_version:1});await expect(page.getByLabel('Área CCIR/CAR').locator('option[value="analysis"]')).toHaveCount(0);
});
test('29: resultado incerto conserva chave e bloqueia saída até retry confirmado',async({page})=>{
 const state=await setup29(page);state.failures.push(503);await page.getByLabel('Área CCIR/CAR').selectOption('handoff');await page.getByLabel('Proprietário responsável').selectOption(other);await page.getByRole('button',{name:'Salvar encaminhamento',exact:true}).click();await expect(page.getByText(/Resultado não confirmado. Salvar encaminhamento/)).toBeVisible();await expect(page.getByRole('button',{name:'Voltar à lista',exact:true})).toBeDisabled();await expect(page.getByLabel('Área CCIR/CAR')).toBeDisabled();await expect(page.getByRole('button',{name:'CCIR/CAR · Fechar acompanhamento'})).toBeDisabled();await page.getByRole('button',{name:'Salvar encaminhamento',exact:true}).click();await expect(page.getByText('CAR · Encaminhado ao proprietário',{exact:false})).toBeVisible();expect(state.posts[1]).toEqual(state.posts[0]);
});
test('29: proprietário recebe ações reservadas após encaminhamento',async({page})=>{
 await setup29(page);await page.getByLabel('Área CCIR/CAR').selectOption('handoff');await page.getByLabel('Proprietário responsável').selectOption(other);await page.getByRole('button',{name:'Salvar encaminhamento',exact:true}).click();await page.getByLabel('Área CCIR/CAR').selectOption('analysis');await page.getByRole('button',{name:'Salvar encaminhamento',exact:true}).click();await expect(page.getByText('CAR · Em análise',{exact:false})).toBeVisible();await expect(page.getByLabel('Área CCIR/CAR').locator('option[value="preparation"]')).toHaveCount(1);
});
test('29: portal mostra progresso factual e pendência sem ação interna',async({page})=>{
 await setup29(page,{client:true});await expect(page.getByRole('region',{name:'Progresso CCIR/CAR'})).toContainText('Enviar documento legível');await expect(page.getByText(/Conclusão interna não confirma aceitação/)).toBeVisible();await expect(page.getByLabel('Área CCIR/CAR')).toHaveCount(0);await expect(page.getByText('Imóvel fictício29')).toHaveCount(0);
});
test('29: leitor mantém consulta sem ação de abertura nem envio sem permissão',async({page})=>{
 await setupBase(page,{caps:permissions.filter(p=>!['rural.records.manage','customers.update','requests.update','requests.transfer'].includes(p))});
 await page.route('**/api/rural/workflow-state',r=>r.fulfill({json:{data:{case:null,properties:[{id:other,name:'Imóvel visível'}],items:[{id:service,name:'CAR teste',kind:'CAR',config_version:1}],owners:[],history:[],history_total:0,page:1,can_configure:false,can_open:false}}}));
 await page.goto('/solicitacoes');await page.getByRole('button',{name:`Ver solicitação ${summary.protocol}`,exact:true}).click();await page.getByRole('button',{name:'CCIR/CAR · Organizar e encaminhar',exact:true}).click();await expect(page.getByLabel('Área CCIR/CAR').locator('option[value="open"]')).toHaveCount(0);await expect(page.getByRole('button',{name:'Salvar encaminhamento',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Atualizar CCIR/CAR'})).toBeEnabled();
});
