import {test,expect,type Page} from '@playwright/test';
test.setTimeout(120_000);
test.skip(!process.env.TEAM_UI_CONTRACT,'Somente fixtures locais; Auth/banco têm provas próprias.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const permissions=['foundation.access','users.manage','requests.read','requests.create','requests.update','requests.transfer','requests.reclaim','customers.read','services.read','files.read','checklists.read','audit.read','archives.manage'];
async function setup(page:Page,role='owner'){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/**',r=>{const url=new URL(r.request().url()),p=url.pathname;
  if(p==='/api/auth/context')return r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions,office_name:'Escritório Fictício',display_name:'Pessoa Fictícia'}]}}});
  if(p==='/api/account/read')return r.fulfill({json:{data:{name:'Pessoa Fictícia',cpf:null,email:'fixture@example.test',version:'a'.repeat(64),cpf_masked:null,pending_email:null,can_edit:role!=='client'}}});
  if(p==='/api/team')return r.fulfill({json:{data:{kind:'members',scope:{role_code:role,allowed_roles:['employee','admin','owner'],allowed_permissions:permissions,can_create_owner:true,can_delegate:true},total:0,page:1,page_size:5,counts:{members:0,invitations:0},items:[]}}});
  if(p.endsWith('/summary'))return r.fulfill({json:{data:{unread:2}}});
  return r.fulfill({json:{data:{items:[],total:0,unread:0,page:1,page_size:3,portal:role==='client'}}});
 });
}
for(const width of [320,360,768,1440,1920])test(`ajustes: geometria de todas as áreas ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 let reference:{x:number;width:number}|undefined;
 for(const path of ['/equipe','/painel','/clientes','/servicos','/solicitacoes','/anexos','/pendencias','/notificacoes','/auditoria','/arquivados','/conta']){
  if(path==='/equipe')await page.goto(path);else await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);await expect(page.locator('.operation-main')).toBeVisible();
  const main=page.locator('.operation-main'),content=main.locator(':scope > div, :scope > section').first();
  if(process.env.JN_ADJUST_CAPTURE)await page.screenshot({path:`docs/evidencias/ajuste-pos12/${process.env.JN_ADJUST_BASELINE?'antes':'depois'}-${path.slice(1)}-${width}.png`,fullPage:true});
  if(process.env.JN_ADJUST_BASELINE)continue;
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(await content.count()){const box=await content.boundingBox();if(path==='/equipe')reference=box!;else if(reference&&box){expect(box.x).toBeCloseTo(reference.x,0);expect(box.width).toBeCloseTo(reference.width,0);}}
  await expect(page.getByRole('link',{name:/Abrir notificações/})).toBeVisible();
 }
});
for(const width of [320,360,768,1440,1920])test(`ajustes: áreas do cliente usam o mesmo espaço ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page,'client');
 for(const path of ['/area-cliente','/minhas-solicitacoes','/meus-anexos','/minhas-notificacoes','/minha-conta']){
  await page.goto(path);await expect(page.locator('.operation-main')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByRole('link',{name:/Abrir notificações/})).toBeVisible();
  if(width<901)expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);
  if(process.env.JN_ADJUST_CAPTURE)await page.screenshot({path:`docs/evidencias/ajuste-pos12/depois-${path.slice(1)}-${width}.png`,fullPage:true});
 }
});
test('ajustes: sino descarta resposta atrasada de outra conta',async({page})=>{
 await setup(page);let release!:()=>void,entered!:()=>void;const blocked=new Promise<void>(r=>release=r),started=new Promise<void>(r=>entered=r);
 await page.route('**/api/notifications/summary',async r=>{entered();await blocked;await r.fulfill({json:{data:{unread:99}}});});await page.goto('/painel');await started;
 const nextUser='77777777-7777-4777-8777-777777777777',token=`e30.${Buffer.from(JSON.stringify({sub:nextUser,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:'88888888-8888-4888-8888-888888888888'})).toString('base64url')}.fixture`;
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:nextUser,aud:'authenticated'}}));await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:nextUser},contexts:[{office_id:office,user_id:nextUser,role_code:'employee',permissions:['foundation.access'],office_name:'Nova conta',display_name:'Outra pessoa'}]}}}));await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 try{expect(await page.evaluate(async token=>{const modulePath='/src/features/auth/browser.ts';const {supabase}=await import(modulePath);return !(await supabase.auth.setSession({access_token:token,refresh_token:'new-fixture'})).error;},token)).toBe(true);await expect(page.getByText('Nova conta',{exact:true})).toBeVisible();}finally{release();}
 await expect(page.getByRole('link',{name:'Abrir notificações',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:/99 não lidas/})).toHaveCount(0);
});
test('ajustes: sino na própria caixa abre o escritório sinalizado',async({page})=>{
 await setup(page);const second='33333333-3333-4333-8333-333333333333';await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[office,second].map((office_id,n)=>({office_id,user_id:user,role_code:'owner',permissions,office_name:n?'Escritório B':'Escritório A',display_name:'Pessoa Fictícia'}))}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:r.request().postDataJSON().office_id===office?1:0}}}));
 await page.goto('/notificacoes');const select=page.getByRole('combobox',{name:'Escritório',exact:true});await select.selectOption(second);await expect(select).toHaveValue(second);await page.getByRole('link',{name:/Abrir notificações/}).click();await expect(select).toHaveValue(office);
});
test('ajustes: caixa ajusta paginação ao mudar de desktop para mobile',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page);await page.goto('/notificacoes');await expect(page.getByRole('combobox',{name:'Leitura'})).toBeVisible();const changed=page.waitForRequest(r=>r.url().endsWith('/api/notifications/search')&&r.postDataJSON().size===3);await page.setViewportSize({width:360,height:640});await changed;expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);
});
test('ajustes: pendências têm busca e filtro alinhados',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page);await page.goto('/pendencias');
 const filter=page.getByRole('combobox',{name:'Status da solicitação'});await expect(filter).toBeVisible();
 const button=page.getByRole('button',{name:'Buscar',exact:true}),input=page.getByRole('searchbox',{name:'Buscar solicitação'});
 const a=await button.boundingBox(),b=await input.boundingBox();expect(a!.y+a!.height).toBeCloseTo(b!.y+b!.height,0);
 const request=page.waitForRequest('**/api/requests/search');await filter.selectOption('aguardando_cliente');await button.click();expect((await request).postDataJSON().status).toBe('aguardando_cliente');
});
for(const role of ['owner','admin','employee','client'])test(`ajustes: sino da conta ${role} e filtros de notificações`,async({page})=>{
 await setup(page,role);await page.goto(role==='client'?'/area-cliente':'/painel');await page.getByRole('link',{name:/Abrir notificações/}).click();
 await expect(page.getByRole('heading',{name:'Notificações',exact:true})).toBeVisible();await expect(page.getByRole('searchbox',{name:'Buscar solicitação'})).toBeVisible();await expect(page.getByRole('combobox',{name:'Leitura'})).toBeVisible();
});
test('ajustes: responsáveis exibem nome, função e falta de acesso sem permitir atribuição inválida',async({page})=>{
 await setup(page);await page.route('**/api/requests/options',r=>r.fulfill({json:{data:{items:[{id:office,label:'Ana Fictícia',role_code:'admin',eligible:true},{id:user,label:'Bruno Fictício',role_code:'employee',eligible:false}],total:2,page:1,page_size:3}}}));
 await page.goto('/solicitacoes');await page.getByRole('button',{name:'Nova solicitação',exact:true}).click();await page.getByText('Responsável, prioridade e nota interna',{exact:true}).click();await page.getByRole('button',{name:'Selecionar responsável',exact:true}).click();
 await expect(page.getByRole('listitem').filter({hasText:'Ana Fictícia'})).toContainText('Administrador');const denied=page.getByRole('listitem').filter({hasText:'Bruno Fictício'});await expect(denied).toContainText('Funcionário');await expect(denied).toContainText('Sem permissão');await expect(denied.getByRole('button',{name:'Escolher Bruno Fictício'})).toBeDisabled();await expect(denied.getByRole('link',{name:'Gerenciar acesso'})).toBeVisible();await page.getByRole('button',{name:'Escolher Ana Fictícia'}).click();await expect(page.getByText('Ana Fictícia · Administrador',{exact:true})).toBeVisible();
});
test('ajustes: acompanhamento oferece retomada e envia somente motivo e versão',async({page})=>{
 await setup(page);const detail={id:office,protocol:'JN-2026-000001',title:'Atendimento delegado',public_status:'em_analise',created_at:'2026-10-21T12:00:00Z',updated_at:'2026-10-21T12:00:00Z',status:'em_atendimento',origin:'presencial',priority:'normal',created_by:user,assignee_id:user,assignee_name:'Ana Fictícia',customer_name:null,version:2,portal:false,customer_id:null,message:'',priority_reason:'',items:[],history:[],history_page:1,history_total:1,can_update:false,can_transfer:false,can_cancel:false,can_reclaim:true,following_only:true};
 await page.route('**/api/requests/search',r=>r.fulfill({json:{data:{items:[detail],page:1,page_size:5,total:1,portal:false}}}));await page.route('**/api/requests/*/detail',r=>r.fulfill({json:{data:detail}}));let sent:Record<string,any>|undefined;
 await page.route('**/api/requests/*/actions',r=>{sent=r.request().postDataJSON();return r.fulfill({json:{data:{...detail,following_only:false,can_reclaim:false,can_update:true,version:3}}});});
 await page.goto('/solicitacoes');await page.getByRole('button',{name:'Ver solicitação JN-2026-000001'}).click();await expect(page.getByText(/Você está acompanhando este atendimento/)).toBeVisible();await page.getByText('Ações do atendimento',{exact:true}).click();await expect(page.getByRole('button',{name:'Registrar nota'})).toHaveCount(0);await page.getByLabel('Motivo da retomada').fill('Retomada fictícia');await page.getByRole('button',{name:'Retomar atendimento para mim'}).click();await expect(page.getByRole('status')).toContainText('Alteração registrada');expect(sent!.mutation).toEqual({kind:'reclaim',reason:'Retomada fictícia'});expect(sent!.expected_version).toBe(2);
});
