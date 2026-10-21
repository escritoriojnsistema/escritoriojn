import {test,expect} from '@playwright/test';
for(const width of [360,1440])for(const [path,target] of [['/notificacoes','/login'],['/minhas-notificacoes','/login-cliente']])test(`avisos público: ${path} protegido em${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});await page.goto(path);await expect(page).toHaveURL(new RegExp(`${target}(?:\\?|$)`));await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
});
test('avisos público: API exige identidade e não armazena resposta',async({request})=>{
 for(const path of ['/api/notifications/summary','/api/notifications/search','/api/notifications/read']){const response=await request.post(path,{data:{}});expect(response.status()).toBe(401);expect((await response.json()).error.code).toBe('AUTH_REQUIRED');expect(response.headers()['cache-control']).toContain('no-store');}
});
