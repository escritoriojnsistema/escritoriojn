import {test,expect} from '@playwright/test';
for(const width of [360,1440])for(const [path,target]of [['/anexos','/login'],['/meus-anexos','/login-cliente']])test(`anexos11 público: ${path} protegido em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});await page.goto(path);await expect.poll(()=>new URL(page.url()).pathname).toBe(target);await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();await expect(page.getByText(/Carregando|Enviando|Aguarde/)).toHaveCount(0);await page.reload();await expect(page.getByLabel('Senha',{exact:true})).toBeVisible();
});
test('anexos11 público: metadados e processamento negam anônimo sem cache',async({request})=>{
 for(const path of ['/search','/requests','/intents','/11111111-1111-4111-8111-111111111111/download','/policy','/policy/update','/cleanup-plan','/process']){const response=await request.post(`/api/attachments${path}`,{data:{}});expect(response.status()).toBe(401);expect((await response.json()).error.code).toBe('AUTH_REQUIRED');expect(response.headers()['cache-control']).toContain('no-store');}
});
