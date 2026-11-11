import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contrato local de navegação com dados fictícios.');
const office='11111111-1111-4111-8111-111111111111',other='33333333-3333-4333-8333-333333333333',user='22222222-2222-4222-8222-222222222222';
async function setup(page:Page,permissions:string[][]){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:permissions.map((p,i)=>({office_id:i?other:office,user_id:user,office_name:i?'Escritório autorizado':'Escritório inicial',display_name:'Gestor fictício',role_code:'admin',permissions:['foundation.access',...p]}))}}}));
 await page.route('**/api/auth/activity',r=>r.fulfill({json:{data:{active:true}}}));await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
}
for(const width of [360,1440])test(`subárea Categorias abre escritório habilitado ${width}`,async({page})=>{
 await page.setViewportSize({width,height:850});await setup(page,[['settings.access'],['settings.access','categories.manage']]);
 let officeRead='';await page.route('**/api/categories/state',r=>{officeRead=r.request().postDataJSON().office_id;return r.fulfill({json:{data:{items:[],can_manage:true}}});});
 await page.goto('/configuracoes/categorias');await expect(page.getByRole('button',{name:'Nova categoria',exact:true})).toBeVisible();await expect.poll(()=>officeRead).toBe(other);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('menu não esconde destinos administrativos/financeiros autorizados dentro dos agrupadores',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page,[['settings.access','categories.manage','access.manage','users.manage','audit.read','archives.manage','cash.read','expenses.read','finance.reports.read','requests.read','charges.read']]);await page.goto('/painel');
 const nav=page.getByRole('navigation',{name:'Navegação da operação'});for(const label of ['Equipe e convites','Auditoria','Arquivados','Categorias','Acessos','Cobranças','Despesas e movimentações','Relatórios financeiros'])await expect(nav.getByRole('link',{name:label,exact:true})).toBeVisible();
});
test('Documentos emitidos não é substituído por Modelos de outro escritório',async({page})=>{
 await setup(page,[['templates.read'],['documents.read','requests.read','customers.read']]);
 await page.route('**/api/documents/search',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5}}}));
 await page.goto('/documentos?aba=issued');await expect(page.getByRole('tab',{name:'Documentos emitidos',exact:true})).toHaveAttribute('aria-selected','true');await expect(page.getByRole('combobox',{name:'Escritório',exact:true}).first()).toHaveValue(other);
});
test('menu mobile completo mantém quatro atalhos e nenhum destino de cliente',async({page})=>{
 await page.setViewportSize({width:320,height:750});await setup(page,[['settings.access','categories.manage','access.manage','users.manage','audit.read','archives.manage','cash.read','expenses.read','finance.reports.read','requests.read','charges.read','customers.read','rural.read','files.read','services.read','templates.read','checklists.read']]);await page.goto('/painel');await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
 const menu=page.getByRole('navigation',{name:'Menu da operação'});for(const name of ['Equipe e convites','Cobranças','Relatórios financeiros','Categorias'])await expect(menu.getByRole('link',{name,exact:true})).toBeVisible();
 expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBe(4);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(await menu.locator('a[href^="/meus"],a[href="/area-cliente"]').count()).toBe(0);
 if(process.env.PORTAL_CAPTURE)await page.screenshot({path:'docs/evidencias/correcoes-pos33/menu-equipe-320.png',fullPage:true});
});
