import {test,expect} from '@playwright/test';
for(const width of [360,1440])test(`despesas17 público: rota exige login em ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});await page.goto('/despesas');await expect(page).toHaveURL(/\/login$/);await expect(page.getByRole('heading',{name:'Área da Equipe',exact:true})).toBeVisible();await expect(page.getByText(/Carregando|Aguarde|Salvando/)).toHaveCount(0);
});
test('despesas17 público: consulta, decisões, movimentos e recibos negam anônimo',async({request})=>{
 for(const action of ['finance17','expense','transfer','receipt']){const response=await request.post(`/api/cash/${action}`,{data:{},headers:{Cookie:'session=unverified'}});expect(response.status()).toBe(401);expect(response.headers()['cache-control']).toContain('no-store');expect(await response.text()).not.toMatch(/service_role|postgres|STACK|private\./);}
});
