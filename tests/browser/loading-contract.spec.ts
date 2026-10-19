import { test, expect } from '@playwright/test';
test.skip(!process.env.TEAM_UI_CONTRACT, 'Configuração pública fictícia; nenhuma solicitação real.');
for (const width of [360,1440]) test(`ação pendente mantém tela e rótulo sem indicador visual em ${width}`,async({page})=>{
  await page.setViewportSize({width,height:width===360?640:900});
  let release!:()=>void;const pending=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/auth/v1/recover**',async route=>{await pending;await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({msg:'fixture unavailable'})});});
  await page.goto('/recuperar-senha?area=team');await page.getByLabel('E-mail',{exact:true}).fill('fixture@example.test');
  const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/auth/v1/recover');
  await page.getByRole('button',{name:'Enviar instruções',exact:true}).click();await request;
  try{
    await expect(page.getByRole('button',{name:'Enviar instruções',exact:true})).toBeDisabled();
    await expect(page.getByText(/Carregando|Aguarde…|Enviando…|Salvando…/)).toHaveCount(0);
    await expect(page.locator('[role="progressbar"],.spinner,.loading-overlay')).toHaveCount(0);
    await expect(page.getByRole('heading',{name:'Esqueceu sua senha?'})).toBeVisible();
  }finally{release();}
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('button',{name:'Enviar instruções',exact:true})).toBeEnabled();
});
