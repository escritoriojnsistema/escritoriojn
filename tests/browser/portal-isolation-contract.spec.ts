import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Sessões e dados fictícios; autoridade SQL/API verificada separadamente.');
const office='11111111-1111-4111-8111-111111111111',clientOffice='33333333-3333-4333-8333-333333333333',user='22222222-2222-4222-8222-222222222222';
async function setup(page:Page,role='owner'){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>{if(!localStorage.getItem('sb-team-ui-auth-token'))localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}}));},{token,user});
 const contexts=[{office_id:office,user_id:user,office_name:'Escritório equipe',display_name:'Equipe fictícia',role_code:role,permissions:['foundation.access','settings.access','users.manage','audit.read','requests.read','files.read','customers.read']},{office_id:clientOffice,user_id:user,office_name:'Escritório cliente',display_name:'Cliente fictício',role_code:'client',permissions:[]}];
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}}));
 let checks=0;await page.route('**/api/auth/context',r=>{checks++;return r.fulfill({json:{data:{user:{id:user},contexts}}});});
 await page.route('**/api/auth/activity',r=>r.fulfill({json:{data:{user_id:user,session_id:office,idle_minutes:30,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString()}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/requests/search',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:3,scope:'mine'}}}));
 await page.route('**/api/account/read',r=>r.fulfill({json:{data:{name:'Pessoa fictícia',cpf:null,cpf_masked:null,email:'fixture@example.test',version:'a'.repeat(64),pending_email:null,can_edit:true}}}));
 return {contexts,checks:()=>checks};
}
for(const width of [360,1440])for(const role of ['owner','admin','employee'])test(`${role} ${width}: foco/reload e URL cliente não misturam o portal`,async({page})=>{
 await page.setViewportSize({width,height:900});const s=await setup(page,role);await page.goto('/painel');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 const count=s.checks();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(s.checks).toBeGreaterThan(count);await page.reload();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 let accountReads=0;page.on('request',r=>{if(r.url().includes('/api/account/read'))accountReads++;});
 await page.goto('/minha-conta');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
 await expect(page.getByRole('link',{name:'Ir para minha área'})).toHaveAttribute('href','/painel');expect(accountReads).toBe(0);await expect(page.getByRole('button',{name:'Meu vínculo no portal',exact:true})).toHaveCount(0);
 await page.getByRole('link',{name:'Ir para minha área'}).click();await expect(page.locator('.operation-area').first()).toHaveText('Área da equipe');
 if(process.env.PORTAL_CAPTURE)await page.screenshot({path:`docs/evidencias/correcoes-pos33/equipe-${role}-${width}.png`,fullPage:true});
});
for(const width of [360,1440])test(`cliente ${width}: retorno global e URL equipe conservam área após revalidação`,async({page})=>{
 await page.setViewportSize({width,height:900});const s=await setup(page);await page.goto('/minhas-solicitacoes');await expect(page.getByRole('heading',{name:'Minhas solicitações',exact:true})).toBeVisible();
 const count=s.checks();await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await expect.poll(s.checks).toBeGreaterThan(count);
 await expect(page.getByRole('link',{name:'Escritório JN — início'}).first()).toHaveAttribute('href','/area-cliente');
 await page.goto('/conta');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Ir para minha área'})).toHaveAttribute('href','/area-cliente');
 await page.getByRole('link',{name:'Ir para minha área'}).click();await expect(page.locator('.operation-area').first()).toHaveText('Área do cliente');
 const links=await page.locator('.operation-sidebar nav a').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('href')));expect(links).not.toContain('/clientes');expect(links).not.toContain('/caixa');expect(links).toContain('/meus-documentos');expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if(process.env.PORTAL_CAPTURE)await page.screenshot({path:`docs/evidencias/correcoes-pos33/cliente-${width}.png`,fullPage:true});
});
test('revogação do papel escolhido não migra silenciosamente para cliente',async({page})=>{
 const s=await setup(page);await page.goto('/painel');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();s.contexts.splice(0,1);await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
 await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();await page.goto('/area-cliente');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
});
for(const portal of ['team','client'] as const)test(`login ${portal} fixa a escolha mesmo com dois vínculos`,async({page})=>{
 const state=await setup(page);
 let attempt=0;
 await page.route('https://team-ui.supabase.co/auth/v1/token**',r=>{
  attempt++;const sid=`55555555-5555-4555-8555-${String(attempt).padStart(12,'0')}`;
  const access_token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:sid})).toString('base64url')}.fixture`;
  return r.fulfill({json:{access_token,refresh_token:`new-fixture-${attempt}`,token_type:'bearer',expires_in:3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}}});
 });
 await page.route('https://team-ui.supabase.co/rest/v1/rpc/my_access_context',r=>r.fulfill({json:state.contexts}));
 await page.goto(portal==='team'?'/login':'/login-cliente');await page.getByLabel('E-mail',{exact:true}).fill('fixture@example.test');await page.getByLabel('Senha',{exact:true}).fill('Password-local-123!');
 await page.getByRole('button',{name:portal==='team'?'Entrar na área da equipe':'Entrar na área do cliente',exact:true}).click();await expect(page).toHaveURL(new RegExp(`${portal==='team'?'/painel':'/area-cliente'}$`));
 await expect(page.locator('.operation-area').first()).toHaveText(portal==='team'?'Área da equipe':'Área do cliente');
 await page.reload();await page.goto(portal==='team'?'/minha-conta':'/conta');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
});
test('sino não mostra mensagem de carregamento ao consultar em segundo plano',async({page})=>{
 await setup(page);await page.setViewportSize({width:360,height:850});await page.goto('/painel');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 let release!:()=>void;const gate=new Promise<void>(resolve=>release=resolve);
 await page.route('**/api/notifications/search',async r=>{await gate;return r.fulfill({json:{data:{items:[],total:0,page:1,page_size:3,unread:0}}});});
 await page.getByRole('button',{name:'Abrir notificações',exact:true}).click();
 try{await expect(page.getByRole('dialog',{name:'Notificações',exact:true})).toBeVisible();await expect(page.getByText(/Consultando seus avisos|Carregando/)).toHaveCount(0);}finally{release();}
});
for(const quota of [false,true])test(`aceite legítimo muda para equipe e conserva marcador mais recente (quota=${quota})`,async({page})=>{
 const s=await setup(page),staff=s.contexts.shift()!;await page.goto('/area-cliente');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
 if(quota)await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='jn-session-portal')throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};});
 await page.route(`**/api/team/invitations/${office}/state`,r=>r.fulfill({json:{data:{office_name:'Equipe fictícia',verified:true,has_password:true,role_code:'employee'}}}));
 await page.route(`**/api/team/invitations/${office}/accept`,r=>{s.contexts.push({...staff,role_code:'employee'});return r.fulfill({json:{data:{office_id:office,role_code:'employee'}}});});
 await page.goto(`/convite?id=${office}`);await page.getByRole('button',{name:'Aceitar convite e entrar',exact:true}).click();await expect(page).toHaveURL(/\/painel$/);await expect(page.locator('.operation-area').first()).toHaveText('Área da equipe');
 await page.reload();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.goto('/minha-conta');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
});
test('quota de localStorage não perde o portal após reload/navegação completa',async({page})=>{
 await setup(page);await page.addInitScript(()=>{const original=Storage.prototype.setItem;Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='jn-session-portal')throw new DOMException('Quota','QuotaExceededError');return original.call(this,key,value);};});
 await page.goto('/area-cliente');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.reload();await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.goto('/painel');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Ir para minha área'})).toHaveAttribute('href','/area-cliente');
});
test('resposta antiga de convite não altera portal nem URL de outra sessão',async({page})=>{
 const s=await setup(page),staff=s.contexts.shift()!;
 await page.route(`**/api/team/invitations/${office}/state`,r=>r.fulfill({json:{data:{office_name:'Equipe fictícia',verified:true,has_password:true,role_code:'employee'}}}));
 let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),sent=new Promise<void>(r=>started=r);
 await page.route(`**/api/team/invitations/${office}/accept`,async r=>{started();await gate;s.contexts.push({...staff,role_code:'employee'});return r.fulfill({json:{data:{office_id:office,role_code:'employee'}}});});
 await page.goto('/area-cliente');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.goto(`/convite?id=${office}`);await page.getByRole('button',{name:'Aceitar convite e entrar',exact:true}).click();await sent;
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:clientOffice})).toString('base64url')}.fixture`;
 try{await page.evaluate(async({token,user})=>{const browserPath='/src/features/auth/browser.ts',portalPath='/src/features/auth/sessionPortal.ts';const {supabase}=await import(browserPath),{rememberSessionPortal}=await import(portalPath);rememberSessionPortal({access_token:token,refresh_token:'new-fixture',user:{id:user}},'client');const r=await supabase.auth.setSession({access_token:token,refresh_token:'new-fixture'});if(r.error)throw r.error;},{token,user});}finally{release();}
 await expect.poll(s.checks).toBeGreaterThan(1);await page.waitForLoadState('networkidle');await expect(page).toHaveURL(new RegExp(`/convite\\?id=${office}$`));await page.goto('/painel');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
});
test('callback de convite seleciona equipe somente após verificar a nova sessão',async({page})=>{
 const s=await setup(page);s.contexts.shift();
 await page.route(`**/api/team/invitations/${office}/state`,r=>r.fulfill({json:{data:{office_name:'Equipe fictícia',verified:true,has_password:true,role_code:'employee'}}}));
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:clientOffice})).toString('base64url')}.fixture`;
 await page.goto(`/auth/callback?area=team&invite=${office}#access_token=${token}&refresh_token=fixture-new&type=invite`);await expect(page.getByRole('button',{name:'Aceitar convite e entrar',exact:true})).toBeVisible();
 expect(new URL(page.url()).hash).toBe('');expect((await page.evaluate(()=>JSON.parse(localStorage.getItem('jn-session-portal')??'null'))).portal).toBe('team');
});
test('retorno neutro de confirmação conserva o login do cliente quando o acesso é negado',async({page})=>{
 const s=await setup(page);s.contexts.shift();await page.goto('/area-cliente');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await page.route('**/api/auth/context',r=>r.fulfill({status:403,json:{error:{code:'ACCESS_DENIED'}}}));await page.goto('/acesso');await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Voltar para entrar',exact:true})).toHaveAttribute('href','/login-cliente');
});
