import { test, expect } from '@playwright/test';

for(const width of [360,1440])test(`catálogo09 público: rota direta exige login em ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});
 await page.goto('/servicos');await expect(page).toHaveURL(/\/login(?:\?|$)/);await expect(page.getByLabel('E-mail',{exact:true})).toBeVisible();
 await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
 await page.reload();await expect(page).toHaveURL(/\/login(?:\?|$)/);await expect(page.getByLabel('Senha',{exact:true})).toBeVisible();
});
test('catálogo09 público: API existe e recusa busca anônima sem ler banco',async({request})=>{
 const response=await request.post('/api/services/search',{data:{office_id:'11111111-1111-4111-8111-111111111111',query:'',page:1,size:3}});
 expect(response.status()).toBe(401);expect((await response.json()).error.code).toBe('AUTH_REQUIRED');expect(response.headers()['cache-control']).toContain('no-store');
});
