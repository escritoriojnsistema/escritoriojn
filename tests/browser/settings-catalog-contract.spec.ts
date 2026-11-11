import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Dados fictícios; persistência e autoridade verificadas no banco descartável.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',category='33333333-3333-4333-8333-333333333333',folder='44444444-4444-4444-8444-444444444444',model='55555555-5555-4555-8555-555555555555';
const caps=['foundation.access','settings.access','categories.manage','access.manage','archives.manage','audit.read','users.manage','requests.read','requests.archives.manage','requests.read_all'];
async function setup(page:Page,role='owner',permissions=caps){
 const state={categories:[{id:category,name:'Documentos',revision:1,is_documents:true}],commands:[] as any[],policies:{team:{audience:'team',idle_minutes:30,revision:1,updated_at:new Date().toISOString()},client:{audience:'client',idle_minutes:30,revision:1,updated_at:new Date().toISOString()}},bookings:[] as any[],searches:[] as any[],archives:[] as any[]};
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Pessoa fictícia',role_code:role,permissions}]}}}));
 await page.route('**/api/auth/activity',r=>r.fulfill({json:{data:{user_id:user,session_id:office,idle_minutes:30,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString()}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/categories/**',r=>{if(r.request().url().endsWith('/command')){const b=r.request().postDataJSON();state.commands.push(b);if(b.command.kind==='create')state.categories.push({id:folder,name:b.command.name,revision:1,is_documents:false});}return r.fulfill({json:{data:{items:state.categories,can_manage:role==='owner'}}});});
 await page.route('**/api/access-settings/**',r=>{if(r.request().url().endsWith('/policy')){const b=r.request().postDataJSON();state.policies[b.audience as 'team'|'client']={...state.policies[b.audience as 'team'|'client'],idle_minutes:b.idle_minutes,revision:2};}return r.fulfill({json:{data:{policies:state.policies,can_manage:true,audience:'team'}}});});
 await page.route('**/api/requests/search',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:3,portal:role==='client'}}}));
 const offer={template_id:model,template_version_id:model,service_version_id:model,offer_revision:1,name:'Declaração de teste',template_code:'DOC-TESTE',folder_id:folder,folder_name:'Declarações',folder_category:'Declarações',instructions:'',price_cents:2500,service_id:model,service_code:'SERVICO-TESTE',service_category:'Documentos',service_checklist:['Documento de identidade'],variables:[]};
 await page.route('**/api/document-commercial/**',r=>{const path=r.request().url().split('/').at(-1),b=r.request().postDataJSON();if(path==='presence')return r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}});if(path==='offers'){state.searches.push(b);return r.fulfill({json:{data:{items:[offer],categories:state.categories.map(c=>({...c,count:1})),folders:[{id:folder,name:'Declarações',category:'Declarações'}],total:1,page:1,page_size:5}}});}if(path==='offer-form')return r.fulfill({json:{data:offer}});if(path==='booking'){state.bookings.push(b);return r.fulfill({json:{data:{request_id:model,protocol:'AT-000321',status:'recebido',waiting:true}}});}return r.fulfill({status:404,json:{error:{}}});});
 await page.route('**/api/request-archives/**',r=>{const path=r.request().url().split('/').at(-1);if(path==='policy')return r.fulfill({json:{data:{days:90,version:1,cutoff:'2026-08-01T00:00:00Z'}}});if(path==='archive'){state.archives.push(r.request().postDataJSON());return r.fulfill({json:{data:{request_id:model,archived:true}}});}return r.fulfill({json:{data:{items:state.archives.length?[]:[{id:model,protocol:'AT-000321',title:'Solicitação concluída',status:'concluido',version:3,closed_at:'2026-11-01T00:00:00Z',archived:false,archived_at:null}],total:state.archives.length?0:1,page:1,page_size:3,cutoff:'2026-08-01T00:00:00Z'}}});});
 return state;
}
for(const width of [360,1440]){
 test(`configurações: navegação, categorias e prazo personalizado em ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});const state=await setup(page);await page.goto('/configuracoes');
  const nav=page.getByRole('navigation',{name:'Opções de configurações'});await expect(nav.getByRole('link')).toHaveCount(6);
  await nav.getByRole('link',{name:/Categorias/}).click();await page.getByRole('button',{name:'Nova categoria'}).click();await page.getByLabel('Nome da categoria').fill('Categoria adicional');await page.getByLabel('Nível de execução').selectOption('1');await page.getByLabel('Motivo').fill('Organização autorizada de teste');await page.getByRole('button',{name:'Salvar categoria'}).click();await expect(page.getByRole('status')).toContainText('criada');expect(state.commands[0].command.kind).toBe('create');
  await page.goto('/configuracoes/acessos');const team=page.locator('form').filter({has:page.getByRole('heading',{name:'Equipe',exact:true})});await team.getByRole('combobox').selectOption('custom');await team.getByRole('spinbutton').fill('47');await team.getByRole('button',{name:'Salvar prazo da equipe'}).click();await expect(page.getByRole('status')).toContainText('salvo');expect(state.policies.team.idle_minutes).toBe(47);expect(state.policies.client.idle_minutes).toBe(30);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.locator('[role="progressbar"],.loader,.spinner')).toHaveCount(0);
  if(width===360)expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);
  await page.screenshot({path:`/workspace/scratch/settings-${width}.png`,fullPage:true});
 });
 test(`configurações: cliente solicita por categoria e pasta em ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});const state=await setup(page,'client',['foundation.access']);await page.goto('/minhas-solicitacoes');await page.getByRole('button',{name:'Nova solicitação',exact:true}).click();await page.getByRole('combobox',{name:'Categoria da solicitação'}).selectOption(category);
  await page.getByRole('combobox',{name:'Pasta',exact:true}).selectOption(folder);await expect.poll(()=>state.searches.at(-1)?.category).toBe(category);await page.getByRole('button',{name:'Solicitar',exact:true}).click();await expect(page.getByText('R$ 25,00',{exact:true})).toBeVisible();await expect(page.getByText('Documento de identidade',{exact:true})).toBeVisible();await expect(page.getByText('DOC-TESTE',{exact:false})).toHaveCount(0);await page.getByRole('button',{name:'Enviar solicitação',exact:true}).click();await expect(page.getByRole('status')).toContainText('AT-000321');expect(state.bookings).toHaveLength(1);expect(state.bookings[0].value).not.toHaveProperty('price_cents');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`/workspace/scratch/catalog-${width}.png`,fullPage:true});
 });
}
for(const role of ['client','employee'])test(`configurações: ${role} não ganha gestão por conhecer a URL`,async({page})=>{
 await setup(page,role,role==='client'?[]:['foundation.access','settings.access','access.manage','categories.manage']);
 await page.goto(role==='client'?'/configuracoes':'/configuracoes/acessos');
 if(role==='client'){await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();await expect(page.getByRole('navigation',{name:'Opções de configurações'})).toHaveCount(0);}
 else await expect(page.getByRole('alert')).toContainText('não permite');
 await expect(page.getByRole('button',{name:'Salvar prazo da equipe'})).toHaveCount(0);
});
test('configurações: administrador autorizado arquiva concluída com motivo',async({page})=>{
 const state=await setup(page,'admin');await page.goto('/solicitacoes');await page.getByText('Relatórios e prazo',{exact:true}).click();await page.getByRole('button',{name:'Arquivar',exact:true}).click();await page.getByLabel('Motivo',{exact:true}).fill('Atendimento finalizado e conferido');await page.getByRole('button',{name:'Confirmar arquivo',exact:true}).click();await expect(page.getByRole('status')).toContainText('arquivada');expect(state.archives[0]).toMatchObject({expected_version:3,reason:'Atendimento finalizado e conferido'});
});
test('configurações: prazo oficial encerra a sessão sem depender de navegação',async({page})=>{
 await setup(page);let deadline=0;await page.route('**/api/auth/activity',r=>{deadline||=Date.now()+1800;return r.fulfill({json:{data:{user_id:user,session_id:office,idle_minutes:5,server_time:new Date().toISOString(),expires_at:new Date(deadline).toISOString()}}});});await page.goto('/configuracoes');await expect(page.getByRole('navigation',{name:'Opções de configurações'})).toBeVisible();await expect(page).toHaveURL(/\/login(?:\?|$)/,{timeout:8000});
});
