import { test, expect } from '@playwright/test';

test('health técnico continua respondendo JSON pela mesma origem', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(await response.json()).toEqual({ data: { status: 'ok', service: 'escritorio-jn-api' } });
});

for (const width of [320, 768, 1440]) test(`entrada mantém marca e acesso, sem faixa de compromissos nem status em ${width}px`, async ({ page }) => {
  await page.setViewportSize({width,height:900});
  const healthReads:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/health')healthReads.push(request.url());});
  await page.goto('/');
  await expect(page.getByRole('heading',{name:'Bem-vindo ao Escritório JN'})).toBeVisible();
  await expect(page.getByRole('banner').getByRole('link',{name:'Escritório JN — início'})).toBeVisible();
  await expect(page.getByRole('link',{name:'Entrar',exact:true})).toBeVisible();
  await expect(page.getByRole('region',{name:'Nosso compromisso'})).toHaveCount(0);
  await expect(page.locator('.benefits,.benefit')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Status do sistema'})).toHaveCount(0);
  const footer=page.getByRole('contentinfo');
  await expect(footer.locator('.privacy-footer-row')).toContainText('Escritório JN');
  await expect(footer.locator('.privacy-footer-row').getByRole('link')).toHaveCount(3);
  if(width===1440){
    const row=await footer.locator('.privacy-footer-row').evaluate(element=>[...element.children].map(child=>child.getBoundingClientRect().toJSON()));
    expect(Math.abs(row[0].y+row[0].height/2-row[1].y-row[1].height/2)).toBeLessThanOrEqual(1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(healthReads).toEqual([]);
});

for(const path of ['/status','/STATUS/']) test(`rota removida usa página não encontrada: ${path}`,async({page})=>{
  const healthReads:string[]=[];
  page.on('request',request=>{if(new URL(request.url()).pathname==='/api/health')healthReads.push(request.url());});
  await page.goto(path);
  await expect(page.getByRole('heading',{name:'Página não encontrada'})).toBeVisible();
  await expect(page).toHaveTitle('Escritório JN | Página não encontrada');
  await expect(page.locator('.health-panel')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Status do sistema'})).toHaveCount(0);
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  expect(healthReads).toEqual([]);
});
