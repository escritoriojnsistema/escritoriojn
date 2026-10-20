import {test,expect} from '@playwright/test';
for(const width of [360,1440])for(const [path,target] of [['/solicitacoes','/login'],['/minhas-solicitacoes','/login-cliente']])test(`pedidos10 público: ${path} protegido em${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});await page.goto(path);
 await expect(page).toHaveURL(new RegExp(`${target}(?:\\?|$)`));await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
 await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);await page.reload();await expect(page.getByLabel('Senha',{exact:true})).toBeVisible();
});
test('pedidos10 público: endpoints existem, negam anônimo e não armazenam resposta',async({request})=>{
 for(const path of ['/api/requests','/api/requests/search','/api/requests/options','/api/requests/11111111-1111-4111-8111-111111111111/detail','/api/requests/11111111-1111-4111-8111-111111111111/actions']){
  const r=await request.post(path,{data:{}});expect(r.status()).toBe(401);expect((await r.json()).error.code).toBe('AUTH_REQUIRED');expect(r.headers()['cache-control']).toContain('no-store');
 }
});
