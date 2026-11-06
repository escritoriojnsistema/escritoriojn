import {test,expect,type Page} from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT,'Local UI contract; database suite verifies authority.');
const user='22222222-2222-4222-8222-222222222222',office='11111111-1111-4111-8111-111111111111';
async function setup(page:Page,role='owner'){
 const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated',session_id:office})).toString('base64url')}.fixture`;
 await page.addInitScript(({token,user})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'fixture',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{}}})),{token,user});
 await page.route('https://team-ui.supabase.co/**',r=>r.fulfill({json:{id:user,aud:'authenticated',email:'fixture@example.test'}}));
 await page.route('**/api/auth/context',r=>r.fulfill({json:{data:{user:{id:user},contexts:[{office_id:office,user_id:user,role_code:role,permissions:['foundation.access','settings.access'],office_name:'Local',display_name:'Operador'}]}}}));
 await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
}
for(const width of [360,1440])test(`superadministrador publica identificação editável sem apresentar exemplos como fatos ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await setup(page);
 let state:unknown={configured:false,revision:0};let saved:Record<string,unknown>|undefined;
 await page.route('**/api/privacy/state',r=>r.fulfill({json:{data:state}}));
 await page.route('**/api/privacy/public',r=>r.fulfill({json:{data:state}}));
 await page.route('**/api/privacy/save',r=>{saved=r.request().postDataJSON();state={configured:true,revision:1,controller:saved?.controller};return r.fulfill({json:{data:state}});});
 await page.goto('/privacidade');await expect(page.getByRole('note')).toContainText('Dados fictícios de exemplo');
 await page.goto('/configuracoes/privacidade');
 await page.getByRole('textbox',{name:'Nome ou razão social',exact:true}).fill('Responsável configurado');
 await page.getByRole('textbox',{name:'E-mail de privacidade',exact:true}).fill('privacy@example.test');
 await page.getByRole('button',{name:'Salvar aviso de privacidade'}).click();
 await expect(page.getByRole('status')).toContainText('publicados');
 expect(saved).toMatchObject({office_id:office,expected_revision:0,controller:{controller_name:'Responsável configurado',contact_email:'privacy@example.test',cnpj:''}});
 await page.goto('/privacidade');await expect(page.getByText('Responsável configurado',{exact:true})).toBeVisible();
 await expect(page.getByRole('note')).toHaveCount(0);
 await page.reload();await expect(page.getByRole('link',{name:'privacy@example.test',exact:true})).toHaveAttribute('href','mailto:privacy@example.test');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('administrador não recebe formulário de configuração do controlador por URL direta',async({page})=>{
 await setup(page,'admin');await page.goto('/configuracoes/privacidade');
 await expect(page.getByRole('alert')).toContainText('Seu acesso não permite');
 await expect(page.getByRole('button',{name:'Salvar aviso de privacidade'})).toHaveCount(0);
});
