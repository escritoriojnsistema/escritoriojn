import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Local visual contract');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',category='33333333-3333-4333-8333-333333333333';
async function setup(page:Page,role:string,level:number|null,caps:string[]=[]){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions:['foundation.access','requests.read','requests.create',...caps],office_name:'Fixture',display_name:'Fixture'}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/document-workflow/cash-queue',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5}}}));
 await page.route('**/api/categories/state',r=>r.fulfill({json:{data:{can_manage:false,items:[{id:category,name:'Categoria central',revision:1,is_documents:false,execution_level:level}]}}}));
 await page.route('**/api/requests/search',r=>r.fulfill({json:{data:{items:[],total:0,page:1,page_size:5,portal:false}}}));
 await page.goto('/solicitacoes');await page.getByRole('button',{name:'Nova solicitação',exact:true}).click();
}
for(const width of [360,1440])for(const [role,level,caps,collect] of [['owner',null,[],false],['employee',1,[],true],['admin',2,['requests.level2'],false],['employee',3,[],false]] as const){
 test(`category first ${role}/${level} ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});await setup(page,role,level,[...caps]);
  await expect(page.getByLabel('Tipo de abertura',{exact:true})).toHaveCount(0);
  const select=page.getByRole('combobox',{name:'Categoria da solicitação',exact:true});await expect(select).toBeVisible();await select.selectOption(category);
  await expect(page.getByRole('button',{name:collect?'Abrir pré-atendimento':'Abrir atendimento',exact:true})).toBeVisible();
  await page.getByLabel('Título',{exact:true}).fill('Nova categoria');
  const sent=page.waitForRequest(r=>r.url().endsWith('/api/requests'));
  await page.route('**/api/requests',r=>r.fulfill({status:503,json:{error:{code:'REQUESTS_UNAVAILABLE'}}}));
  await page.getByRole('button',{name:collect?'Abrir pré-atendimento':'Abrir atendimento',exact:true}).click();
  const body=(await sent).postDataJSON();expect(body.request.category_id).toBe(category);expect(body.request).not.toHaveProperty('preintake');expect(body.request).not.toHaveProperty('mode');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 });
}
