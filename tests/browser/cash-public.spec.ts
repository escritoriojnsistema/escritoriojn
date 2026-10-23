import {test,expect} from '@playwright/test';
for(const width of [360,1440])test(`caixa14 público: rota exige login em ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});await page.goto('/caixa');await expect(page).toHaveURL(/\/login$/);await expect(page.getByRole('heading',{name:'Área da Equipe',exact:true})).toBeVisible();await expect(page.getByText(/Carregando|Aguarde|Salvando/)).toHaveCount(0);
});
test('caixa14 público: nenhuma operação aceita anônimo ou cookie como identidade',async({request})=>{
 for(const action of ['dashboard','configuration','configure','open']){
  const r=await request.post(`/api/cash/${action}`,{data:{},headers:{Cookie:'session=unverified'}});expect(r.status()).toBe(401);expect(r.headers()['cache-control']).toContain('no-store');expect(await r.text()).not.toMatch(/service_role|postgres|STACK|private\./);
 }
});

test('portal financeiro redireciona visitante para acesso do cliente',async({page})=>{await page.goto('/meus-pagamentos');await expect(page.getByRole('heading',{name:'Área do Cliente',exact:true})).toBeVisible();await expect(page.getByRole('heading',{name:'Resumo financeiro',exact:true})).toHaveCount(0);});
