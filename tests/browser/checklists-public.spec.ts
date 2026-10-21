import {test,expect} from '@playwright/test';
for(const width of [360,1440])test(`checklists públicos12: rotas internas voltam ao login em ${width}`,async({page})=>{
 await page.setViewportSize({width,height:width===360?640:900});for(const path of ['/pendencias','/notificacoes']){await page.goto(path);await expect(page).toHaveURL(/\/login$/);await expect(page.getByRole('heading',{name:'Área da Equipe',exact:true})).toBeVisible();await expect(page.getByText(/Carregando|Aguarde/)).toHaveCount(0);}
});
test('checklists públicos12: API exige identidade em todos os endpoints',async({request})=>{
 for(const path of ['/model','/model/publish','/view','/apply','/entries/update','/notify','/notifications','/notifications/read']){const r=await request.post(`/api/checklists${path}`,{data:{}});expect(r.status()).toBe(401);expect(r.headers()['cache-control']).toContain('no-store');expect(await r.text()).not.toMatch(/service_role|postgres|STACK|schema/);}
});
