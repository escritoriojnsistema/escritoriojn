import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contrato visual local com sessão fictícia; não comprova Auth hospedado.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
const caps=['foundation.access','requests.read','files.read','customers.read','rural.read','services.read','checklists.read','cash.read','charges.read','expenses.read','finance.reports.read','settings.access','users.manage','audit.read','archives.manage','categories.manage','access.manage'];
async function setup(page:Page,role='owner',permissions=caps){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/**',r=>{
  const path=new URL(r.request().url()).pathname;
  if(path==='/api/auth/context')return r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Pessoa fictícia',role_code:role,permissions}]}}});
  if(path==='/api/auth/activity')return r.fulfill({json:{data:{user_id:user,session_id:office,idle_minutes:30,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString()}}});
  if(path==='/api/notifications/summary')return r.fulfill({json:{data:{unread:0}}});
  if(path==='/api/document-commercial/presence')return r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}});
  if(path==='/api/account/read')return r.fulfill({json:{data:{name:'Pessoa fictícia',cpf:null,email:'fixture@example.test',version:'a'.repeat(64),cpf_masked:null,pending_email:null,can_edit:role!=='client'}}});
  // Unavailable business reads keep the test focused on navigation, without
  // inventing domain records or pretending that hosted data was accessed.
  return r.fulfill({status:503,json:{error:{code:'FIXTURE_UNAVAILABLE'}}});
 });
}
async function geometry(page:Page,width:number){
 expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(width);
 const shortcuts=page.getByRole('navigation',{name:'Atalhos do aplicativo'});expect(await shortcuts.getByRole('link').count()).toBeLessThanOrEqual(4);
 if(await shortcuts.locator('a[href="/caixa"]').count())expect(await shortcuts.getByRole('link').evaluateAll(links=>links.map(link=>link.getAttribute('href')))).toEqual(['/caixa','/solicitacoes','/clientes','/configuracoes']);
}
for(const width of [320,375,768,1440])for(const role of ['owner','admin','employee','client'])test(`grupos e ícones ${role} ${width}`,async({page})=>{
 test.setTimeout(60000); // Complete section journey visits seven workspaces.
 await page.setViewportSize({width,height:900});const client=role==='client';await setup(page,role,client?[]:caps);
 await page.goto(client?'/minhas-solicitacoes':'/solicitacoes');await expect(page.getByRole('heading',{level:1,name:client?'Minhas solicitações':'Solicitações',exact:true})).toBeVisible();
 const sidebar=page.locator('.operation-sidebar .operation-navigation');
 for(const path of ['/anexos','/meus-anexos','/imoveis-rurais','/pendencias','/cobrancas','/despesas','/relatorios-financeiros','/equipe','/auditoria','/arquivados','/configuracoes/categorias','/configuracoes/acessos','/configuracoes/privacidade','/conta','/minha-conta'])await expect(sidebar.locator(`a[href="${path}"]`)).toHaveCount(0);
 if(width<900){await page.getByRole('button',{name:'Abrir menu',exact:true}).click();const menu=page.getByRole('dialog',{name:'Menu de navegação'});await expect(menu.getByRole('link',{name:'Configurações',exact:true})).toBeVisible();await expect(menu.getByRole('link',{name:'Anexos',exact:true})).toHaveCount(0);await page.getByRole('button',{name:'Fechar menu',exact:true}).click();}
 const requests=page.getByRole('navigation',{name:'Áreas de solicitações'});await expect(requests.getByRole('link',{name:'Anexos',exact:true}).locator('svg')).toBeVisible();await requests.getByRole('link',{name:'Anexos',exact:true}).click();await expect(page.getByRole('heading',{name:'Anexos privados',exact:true})).toBeVisible();
 await expect(sidebar.locator(`a[href="${client?'/minhas-solicitacoes':'/solicitacoes'}"]`)).toHaveAttribute('aria-current','page');
 await expect(page.getByRole('main').getByRole('link',{name:'Voltar às solicitações',exact:true})).toBeVisible();await geometry(page,width);
 if(!client){
  for(const [parent,label,child,title] of [['/clientes','Áreas de clientes','Imóveis rurais','Imóveis rurais'],['/servicos','Áreas de serviços','Checklist','Checklist']]){
   await page.goto(parent);await page.getByRole('navigation',{name:label}).getByRole('link',{name:child,exact:true}).click();await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();await expect(sidebar.locator(`a[href="${parent}"]`)).toHaveAttribute('aria-current','page');await geometry(page,width);
  }
 }
 await page.goto(client?'/minhas-configuracoes':'/configuracoes');const options=page.getByRole('navigation',{name:'Opções de configurações'});
 await expect(options.getByRole('link',{name:/^Conta/})).toBeVisible();if(client)await expect(options.getByRole('link')).toHaveCount(1);
 await options.getByRole('link',{name:/^Conta/}).click();if(client)await expect(page.getByRole('region',{name:'Dados de acesso'})).toContainText('fixture@example.test');else await expect(page.getByLabel('E-mail de acesso',{exact:true})).toHaveValue('fixture@example.test');await expect(sidebar.locator(`a[href="${client?'/minhas-configuracoes':'/configuracoes'}"]`)).toHaveAttribute('aria-current','page');
 if(width<900)await expect(page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link',{name:'Ajustes',exact:true}).locator('svg')).toHaveClass(/lucide-settings/);
 await page.getByRole('main').getByRole('link',{name:'Voltar às configurações',exact:true}).click();await expect(page.getByRole('heading',{name:'Configurações',exact:true})).toBeVisible();await geometry(page,width);
 if(role==='owner'&&[375,1440].includes(width))await page.screenshot({path:`/workspace/scratch/menu-agrupado-${width}.png`,fullPage:true});
});
test('concessões independentes permanecem dentro de Configurações e Serviços',async({page})=>{
 await setup(page,'employee',['foundation.access','audit.read','users.manage','requests.read','checklists.read']);await page.goto('/configuracoes');
 const options=page.getByRole('navigation',{name:'Opções de configurações'});await expect(options.getByRole('link')).toHaveCount(3);await expect(options.getByRole('link',{name:/Auditoria/})).toBeVisible();await expect(options.getByRole('link',{name:/Equipe e convites/})).toBeVisible();
 await page.getByRole('navigation',{name:'Navegação da operação'}).getByRole('link',{name:'Serviços',exact:true}).click();await expect(page).toHaveURL(/\/pendencias$/);await expect(page.getByRole('heading',{name:'Checklist',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Áreas de serviços'})).toHaveCount(0);
});
test('URL de configurações do outro portal continua bloqueada antes da montagem',async({page})=>{
 await setup(page,'client',[]);await page.goto('/minhas-configuracoes');await expect(page.getByRole('heading',{name:'Configurações',exact:true})).toBeVisible();await page.goto('/configuracoes');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
});
