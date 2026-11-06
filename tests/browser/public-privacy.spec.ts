import {test,expect} from '@playwright/test';
for(const width of [320,360,768,1440]) test(`Portal da Equipe e transparência acessíveis em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await page.goto('/');
 await expect(page.getByRole('link',{name:'Portal da Equipe'})).toBeVisible();
 await page.getByRole('link',{name:'Portal da Equipe'}).click();await expect(page).toHaveURL(/\/login$/);
 await expect(page.getByRole('heading',{name:'Área da Equipe'})).toBeVisible();
 await expect(page.getByRole('link',{name:'Cookies e preferências'})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 for(const route of ['/login-cliente','/cadastro']){await page.goto(route);await expect(page.getByRole('link',{name:'Privacidade',exact:true})).toBeVisible();await expect(page.getByRole('checkbox')).toHaveCount(0);}
 await page.goto('/cookies');await expect(page.getByRole('heading',{name:'Cookies e preferências'})).toBeVisible();
 await page.getByRole('button',{name:'Salvar somente necessários'}).click();await expect(page.getByRole('status')).toContainText('Preferência salva');
 expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('jn-privacy-notice-v1')!))).toEqual({policyVersion:'2026-11-06.1',necessary:true,optional:false,consent:false});
 await page.reload();await expect(page.getByRole('heading',{name:'Opcionais',exact:true})).toBeVisible();expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('jn-privacy-notice-v1')!).optional)).toBe(false);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('recuperação anônima volta ao portal solicitado sem login ou logout',async({page})=>{
 const writes:string[]=[];page.on('request',r=>{if(r.method()!=='GET')writes.push(r.url());});
 for(const [area,path]of [['client','/login-cliente'],['team','/login']]){
  await page.goto(`/recuperar-senha?area=${area}`);await page.getByRole('link',{name:'Voltar',exact:true}).first().click();await expect(page).toHaveURL(new RegExp(`${path}$`));
 }
 expect(writes).toEqual([]);
});
for(const role of ['employee','client'])test(`Voltar preserva sessão verificada ${role}`,async({page})=>{
 test.skip(!process.env.PRIVACY_AUTH_UI,'Laboratório SDK dedicado');
 const uid='22222222-2222-4222-8222-222222222222',sid='11111111-1111-4111-8111-111111111111';
 const token=`e30.${Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,session_id:sid,role:'authenticated'})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,uid})=>{localStorage.setItem('sb-privacy-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'local-only-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:uid,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{},created_at:'2026-10-18T00:00:00Z'}}));},{token,uid});
 await page.route('https://privacy-ui.supabase.co/**',r=>r.fulfill({json:{id:uid,aud:'authenticated',email:'fixture@example.test'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:uid},contexts:[{office_id:sid,user_id:uid,role_code:role,permissions:['foundation.access'],office_name:'Laboratório',display_name:'Teste'}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 const writes:string[]=[];page.on('request',r=>{if(r.url().includes('/logout'))writes.push(r.url());});
 await page.goto(`/recuperar-senha?area=${role==='client'?'client':'team'}`);
 const back=page.getByRole('link',{name:'Voltar',exact:true}).first();
 await expect(back).toHaveAttribute('href',role==='client'?'/minha-conta':'/conta');
 const stored=await page.evaluate(()=>localStorage.getItem('sb-privacy-ui-auth-token'));
 await back.click();await expect(page).toHaveURL(new RegExp(`${role==='client'?'/minha-conta':'/conta'}$`));
 expect(await page.evaluate(()=>localStorage.getItem('sb-privacy-ui-auth-token'))).toBe(stored);expect(writes).toEqual([]);
});
