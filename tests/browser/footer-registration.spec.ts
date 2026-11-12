import {test, expect, type Page} from '@playwright/test';

for (const width of [320, 375, 1440]) test(`rodapé de políticas acompanha o fim das telas públicas em ${width}px`, async ({page}) => {
  await page.setViewportSize({width, height:900});
  for (const path of ['/', '/login', '/login-cliente', '/cadastro', '/recuperar-senha?area=client', '/redefinir-senha', '/auth/callback', '/status', '/privacidade', '/termos', '/cookies', '/nao-existe']) {
    await page.goto(path);
    const footer=page.getByRole('contentinfo');
    await expect(footer).toHaveCount(1);
    await expect(footer.getByRole('link', {name:'Cookies e preferências'})).toBeVisible();
    await footer.scrollIntoViewIfNeeded();
    const geometry=await footer.evaluate(element => {
      const box=element.getBoundingClientRect(), main=document.querySelector('main')!.getBoundingClientRect();
      return {top:box.top,bottom:box.bottom,mainBottom:main.bottom,documentBottom:document.documentElement.scrollHeight-scrollY,width:document.documentElement.scrollWidth,viewport:innerWidth};
    });
    expect(geometry.top, path).toBeGreaterThanOrEqual(geometry.mainBottom-1);
    expect(geometry.bottom, path).toBeGreaterThanOrEqual(geometry.documentBottom-30);
    expect(geometry.width, path).toBeLessThanOrEqual(geometry.viewport);
    for (const link of await footer.getByRole('link').all()) expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  }
});

async function fillIdentity(page:Page) {
  await page.getByLabel('Nome',{exact:true}).fill('Cliente de Teste');
  await page.getByLabel('E-mail',{exact:true}).fill('cliente@example.test');
}

test('três aceites separados liberam a senha e o cadastro; retirar um aceite bloqueia novamente', async ({page}) => {
  await page.goto('/cadastro');
  const checks=page.getByRole('checkbox'), password=page.getByLabel('Senha',{exact:true}), submit=page.getByRole('button',{name:'Criar conta de cliente'});
  await expect(checks).toHaveCount(3);
  await expect(checks.nth(0)).toHaveAccessibleName(/Termos de uso/);
  await expect(checks.nth(1)).toHaveAccessibleName(/Cookies e preferências/);
  await expect(checks.nth(2)).toHaveAccessibleName(/Privacidade/);
  for (const checkbox of await checks.all()) {await expect(checkbox).not.toBeChecked();await expect(checkbox).toHaveAttribute('required','');}
  expect(await checks.last().evaluate(element=>Boolean(element.compareDocumentPosition(document.querySelector('#password')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(password).toBeDisabled();await expect(submit).toBeDisabled();
  for(let index=0;index<2;index++){await checks.nth(index).check();await expect(password).toBeDisabled();await expect(submit).toBeDisabled();}
  await checks.nth(2).check();await expect(password).toBeEnabled();await expect(submit).toBeEnabled();
  await password.fill('Local-only-Password1!');
  await checks.nth(1).uncheck();await expect(password).toBeDisabled();await expect(submit).toBeDisabled();
  await checks.nth(1).check();await expect(password).toHaveValue('Local-only-Password1!');
  for(const href of ['/termos','/cookies','/privacidade']) {
    const link=page.locator(`.registration-acceptance a[href="${href}"]`);
    await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noreferrer/);
  }
  await fillIdentity(page);
  const popup=page.waitForEvent('popup');await page.locator('.registration-acceptance a[href="/termos"]').click();
  const policy=await popup;await expect(policy.getByRole('heading',{name:'Termos de uso',exact:true})).toBeVisible();await policy.close();
  await expect(password).toHaveValue('Local-only-Password1!');await expect(page.getByLabel('Nome',{exact:true})).toHaveValue('Cliente de Teste');
  for(const checkbox of await checks.all())await expect(checkbox).toBeChecked();
  await expect(page.locator('.registration-acceptance')).toContainText('Sem cookies opcionais');
});

test('envio programático sem aceites é recusado e somente o aceite completo segue no payload', async ({page}) => {
  const writes:unknown[]=[];
  await page.route('**/auth/v1/signup*', async route => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({json:{user:{id:'22222222-2222-4222-8222-222222222222',aud:'authenticated',email:'cliente@example.test'},session:null}});
  });
  await page.goto('/cadastro');await fillIdentity(page);
  await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect(page.getByRole('alert')).toContainText('Confirme os três aceites');expect(writes).toEqual([]);
  for (const checkbox of await page.getByRole('checkbox').all()) await checkbox.check();
  await page.getByLabel('Senha',{exact:true}).fill('Local-only-Password1!');
  await page.getByRole('checkbox').first().evaluate((element:HTMLInputElement)=>{element.checked=false;});
  await page.locator('form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  await expect(page.getByRole('alert')).toContainText('Confirme os três aceites');expect(writes).toEqual([]);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button',{name:'Criar conta de cliente'}).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');
  expect(writes).toHaveLength(1);
  expect((writes[0] as {data:unknown}).data).toEqual({display_name:'Cliente de Teste',jn_client_acceptance:{version:'2026-11-12.1',terms:true,privacy:true,cookies:true,optional_cookies:false}});
});

for(const width of [200,320,375,1440]) test(`rodapé da operação fica depois do conteúdo e acima dos atalhos em ${width}px`,async({page})=>{
  const user='22222222-2222-4222-8222-222222222222',session='11111111-1111-4111-8111-111111111111';
  const token=`e30.${Buffer.from(JSON.stringify({sub:user,exp:Math.floor(Date.now()/1000)+3600,session_id:session,role:'authenticated'})).toString('base64url')}.fixture`;
  await page.addInitScript(({user,token})=>localStorage.setItem('sb-team-ui-auth-token',JSON.stringify({access_token:token,refresh_token:'test-only-refresh',token_type:'bearer',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,user:{id:user,aud:'authenticated',email:'fixture@example.test',app_metadata:{},user_metadata:{},created_at:'2026-10-18T00:00:00Z'}})),{user,token});
  await page.route('https://team-ui.supabase.co/**',route=>route.fulfill({json:{id:user,email:'fixture@example.test',aud:'authenticated'}}));
  await page.route('**/api/auth/context',route=>route.fulfill({json:{data:{user:{id:user},contexts:[{office_id:session,user_id:user,role_code:'owner',permissions:['foundation.access'],office_name:'Laboratório local',display_name:'Teste'}]}}}));
  await page.route('**/api/notifications/summary',route=>route.fulfill({json:{data:{unread:0}}}));
  await page.setViewportSize({width,height:900});await page.goto('/painel');
  await expect(page.getByRole('heading',{name:'Área de operação',exact:true})).toBeVisible();
  const footer=page.getByRole('contentinfo');await expect(footer).toHaveCount(1);
  await footer.scrollIntoViewIfNeeded();await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  const positions=await page.evaluate(()=>({footer:document.querySelector('footer')!.getBoundingClientRect().toJSON(),main:document.querySelector('main')!.getBoundingClientRect().toJSON(),links:[...document.querySelectorAll('footer a')].map(e=>e.getBoundingClientRect().toJSON()),nav:document.querySelector('.operation-mobile-nav')!.getBoundingClientRect().toJSON(),overflow:document.documentElement.scrollWidth-innerWidth}));
  expect(positions.footer.top).toBeGreaterThanOrEqual(positions.main.bottom-1);expect(positions.overflow).toBeLessThanOrEqual(0);
  if(width<900){for(const link of positions.links)expect(link.bottom).toBeLessThanOrEqual(positions.nav.top);expect(await page.getByRole('navigation',{name:'Atalhos do aplicativo'}).getByRole('link').count()).toBeLessThanOrEqual(4);}
  await page.route('**/api/auth/context',route=>route.fulfill({status:403,json:{error:{code:'ACCESS_DENIED'}}}));
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByRole('heading',{name:'Acesso não autorizado',exact:true})).toBeVisible();
  await expect(page.getByRole('contentinfo')).toHaveCount(1);
  await expect(page.getByRole('contentinfo').getByRole('link',{name:'Privacidade',exact:true})).toBeVisible();
});
