import {test,expect} from '@playwright/test';
for(const width of [360,1440])test(`DITR28 anônimo retorna ao login sem loader em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});await page.goto('/imoveis-rurais');
 await expect.poll(()=>new URL(page.url()).pathname).toBe('/login');
 await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
 await expect(page.locator('.spinner,[role="progressbar"]')).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('DITR28 API pública recusa leitura e comando sem sessão e sem cache',async({request})=>{
 for(const path of ['/ditr-state','/ditr-command']){
  const response=await request.post('/api/rural'+path,{data:{}});
  expect(response.status()).toBe(401);expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  expect(response.headers()['cache-control']).toContain('no-store');
 }
});
