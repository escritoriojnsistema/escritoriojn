import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Synthetic browser authority; real provider measured separately by measure-entry-pos28.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
async function fixture(page:Page){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Pessoa fictícia',role_code:'owner',permissions:['foundation.access','customers.read','requests.read']}]}}}));
 await page.route('**/api/auth/activity',r=>r.fulfill({json:{data:{user_id:user,session_id:office,idle_minutes:30,server_time:new Date().toISOString(),expires_at:new Date(Date.now()+1800000).toISOString()}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/customers/**',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5}}}));
}
test('public homepage paints while restored authority is pending, with no private UI',async({page})=>{
 await fixture(page);let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/api/auth/context',async r=>{await gate;await r.fulfill({status:403,json:{error:{code:'AUTH_FORBIDDEN'}}});});
 try{await page.goto('/');await expect(page.getByRole('heading',{name:'Bem-vindo ao Escritório JN'})).toBeVisible();await expect(page.locator('.operation-layout')).toHaveCount(0);}finally{release();}
 await expect(page.locator('.operation-layout')).toHaveCount(0);
});
test('login preloads the panel without fetching unrelated business pages',async({page})=>{
 const pages:string[]=[];page.on('request',r=>{if(/\/features\/(rural|documents|customers|requests|settings)\/.*Page\.tsx/.test(r.url()))pages.push(new URL(r.url()).pathname);});
 await page.goto('/login');await page.getByLabel('E-mail',{exact:true}).waitFor();await page.waitForLoadState('networkidle');expect(pages).toEqual([]);
});
for (const width of [360,1440]) test(`first feature chunk preserves verified panel and menu at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});
 await fixture(page);let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{started=resolve;});
 await page.route('**/src/features/customers/CustomersPage.tsx*',async r=>{started();await gate;await r.continue();});
 try{
  await page.goto('/painel');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.getByRole('main').getByRole('link',{name:/Clientes Cadastro/}).click();await requested;
  await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();await expect(page.locator(width===360?'.operation-mobile-nav':'.operation-sidebar')).toBeVisible();await expect(page.locator('[role="progressbar"],.spinner,.loading-overlay')).toHaveCount(0);
 }finally{release();}
 await expect(page.getByRole('heading',{name:'Clientes',exact:true})).toBeVisible();
});
test('authority denial blocks the previous screen even while its next chunk is pending',async({page})=>{
 await fixture(page);let release!:()=>void,started!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;}),requested=new Promise<void>(resolve=>{started=resolve;});
 await page.route('**/src/features/customers/CustomersPage.tsx*',async r=>{started();await gate;await r.continue();});
 try{
  await page.goto('/painel');await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  await page.getByRole('main').getByRole('link',{name:/Clientes Cadastro/}).click();await requested;
  await page.route('**/api/auth/context',r=>r.fulfill({status:403,json:{error:{code:'AUTH_FORBIDDEN'}}}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();await expect(page.locator('.operation-layout')).toHaveCount(0);
 }finally{release();}
 await expect(page.locator('.operation-layout')).toHaveCount(0);
});
