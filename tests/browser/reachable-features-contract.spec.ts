import {test,expect,type Page} from '@playwright/test';
import {quickRequiredPermissions} from '../../shared/finance19';
test.skip(!process.env.TEAM_UI_CONTRACT,'Contratos locais com dados fictícios.');
const office='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222';
async function setup(page:Page,permissions:string[]){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,office_name:'Escritório fictício',display_name:'Equipe fictícia',role_code:'owner',permissions:['foundation.access',...permissions]}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/document-commercial/presence',r=>r.fulfill({json:{data:{status:'offline',capacity:1,last_seen:null,session_current:false}}}));
 await page.route('**/api/cash/dashboard',r=>r.fulfill({json:{data:{sessions:[],total:0,page:1,page_size:3,scope:'own',can_open:false,can_manage:false,can_read_all:false}}}));
 await page.route('**/api/cash/configuration',r=>r.fulfill({json:{data:{units:[],accounts:[],payment_methods:[],units_total:0,accounts_total:0,payment_methods_total:0,page:1,page_size:50,unit_id:null}}}));
 await page.route('**/api/finance/quick/context',r=>r.fulfill({status:503,json:{error:{code:'FIXTURE_UNAVAILABLE'}}}));
}
for(const width of [360,1440])test(`Atendimento rápido tem entrada autorizada pelo Caixa ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page,[...quickRequiredPermissions]);await page.goto('/caixa');await expect(page.getByRole('heading',{name:'Caixa',exact:true})).toBeVisible();
 if(width===360)await page.getByRole('button',{name:'Abrir menu',exact:true}).click();
 const link=page.getByRole('link',{name:'Atendimento rápido',exact:true});await expect(link).toHaveAttribute('href','/atendimento-rapido',{timeout:3000});await link.click();
 await expect(page.getByRole('heading',{name:'Atendimento rápido',exact:true})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('Atendimento rápido não aparece somente pelo papel ou por composição incompleta',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page,quickRequiredPermissions.filter(p=>p!=='quick.perform'));await page.goto('/caixa');await expect(page.getByRole('heading',{name:'Caixa',exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Atendimento rápido',exact:true})).toHaveCount(0);
});
test('Atendimento rápido não cria saída concorrente nas áreas financeiras incorporadas',async({page})=>{
 await page.setViewportSize({width:1440,height:900});await setup(page,[...quickRequiredPermissions]);await page.route('**/api/charges/**',r=>r.fulfill({status:503,json:{error:{code:'FIXTURE_UNAVAILABLE'}}}));
 await page.goto('/caixa');const shortcut=page.getByRole('link',{name:'Atendimento rápido',exact:true});await expect(shortcut).toBeVisible();
 await page.getByRole('tab',{name:'Cobranças',exact:true}).click();await expect(shortcut).toHaveCount(0,{timeout:3000});
 await page.getByRole('tab',{name:'Meu caixa',exact:true}).click();await expect(shortcut).toBeVisible();
});
