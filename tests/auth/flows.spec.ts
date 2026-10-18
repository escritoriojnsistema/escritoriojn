import { test, expect, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
const url = process.env.AUTH_LAB_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const password = process.env.AUTH_LAB_PASSWORD!;
async function login(page: Page, name: string, value = password) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(value);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
}
async function emailLink(email: string): Promise<string> {
  const mail = process.env.AUTH_LAB_MAIL_URL!;
  for (let i = 0; i < 40; i++) {
    const list = await (await fetch(`${mail}/api/v1/messages`)).json();
    const message = list.messages?.find((m: { To: { Address: string }[] }) => m.To.some(t => t.Address === email));
    if (message) {
      const detail = await (await fetch(`${mail}/api/v1/message/${message.ID}`)).json();
      const match = String(detail.HTML).match(/href="([^"]+)"/);
      if (match) return match[1].replaceAll('&amp;', '&');
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Local SMTP did not deliver the expected test message.');
}
test('senha errada, login, layout do painel e logout com JWT antigo bloqueado', async ({ page, request }) => {
  await login(page, 'owner', 'Senha-incorreta!');
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await login(page, 'owner');
  await expect(page.getByRole('heading', { name: 'Área de operação' })).toBeVisible();
  await page.evaluate(async () => {
    const modulePath = '/src/features/auth/browser.ts';
    const { supabase } = await import(modulePath);
    const { error } = await supabase.auth.updateUser({ data: { role: 'owner' } });
    if (error) throw new Error('Local SDK metadata update failed.');
  });
  await expect(page.getByRole('heading', { name: 'Área de operação' })).toBeVisible();
  const session = await page.evaluate(() => {
    const stored = Object.entries(localStorage).find(([k]) => k.endsWith('-auth-token'));
    return stored ? JSON.parse(stored[1]).access_token as string : '';
  });
  expect(Boolean(session)).toBe(true);
  for (const [width,height] of [[320,568],[360,640],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  }
  if (process.env.AUTH_LAB_CAPTURE) await page.screenshot({path:'/workspace/shared/etapa-04-painel-1440.png'});
  const before = await request.get('/api/auth/context', { headers: { Authorization: `Bearer ${session}` } });
  expect(before.status()).toBe(200);
  expect(before.headers()['cache-control']).toContain('no-store');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/login$/);
  const revoked = await request.get('/api/auth/context', { headers: { Authorization: `Bearer ${session}` } });
  expect([401,403]).toContain(revoked.status());
  const rpc = await request.post(`${url}/rest/v1/rpc/my_access_context`, { headers: { apikey:key, Authorization:`Bearer ${session}` }, data:{} });
  expect(await rpc.json()).toEqual([]);
});
for (const name of ['unlinked','inactive']) test(`conta ${name} autentica mas nao recebe acesso`, async ({page}) => {
  await login(page,name);
  await expect(page.getByRole('alert')).toContainText('Este portal não está disponível para esta conta');
  await expect(page).toHaveURL('/login');
  await expect(page.locator('.operation-layout')).toHaveCount(0);
});
test('sessao recusada e indisponibilidade da API possuem recuperacao clara', async ({page}) => {
  await login(page,'owner');
  await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();
  await page.route('**/api/auth/context', route => route.fulfill({status:503,json:{error:{code:'AUTH_UNAVAILABLE'}}}));
  await page.reload();
  await expect(page.getByRole('heading',{name:'Acesso indisponível'})).toBeVisible();
  await page.unroute('**/api/auth/context');
  await page.getByRole('button',{name:'Verificar novamente'}).click();
  await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();
  await page.route('**/api/auth/context', route => route.fulfill({status:401,json:{error:{code:'AUTH_REQUIRED'}}}));
  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('alert')).toContainText('Sua sessão expirou');
});
test('JWTs reais isolam escritorios A/B e metadata nao concede papel', async ({request}) => {
  for (const [name, own, other] of [['owner',process.env.AUTH_LAB_OFFICE,process.env.AUTH_LAB_OTHER_OFFICE],['other',process.env.AUTH_LAB_OTHER_OFFICE,process.env.AUTH_LAB_OFFICE]]) {
    const sdk=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
    const {data,error}=await sdk.auth.signInWithPassword({email:`${name}@example.test`,password});
    expect(error).toBeNull();
    const token=data.session!.access_token;
    await sdk.auth.updateUser({data:{role:'owner',office_id:other}});
    const headers={apikey:key,Authorization:`Bearer ${token}`};
    const offices=await request.get(`${url}/rest/v1/offices?select=id`,{headers});
    expect(await offices.json()).toEqual([{id:own}]);
    expect((await request.get(`/api/auth/context?office_id=${other}`,{headers})).status()).toBe(403);
    expect((await request.get(`/api/auth/context?office_id=${own}`,{headers})).status()).toBe(200);
    await sdk.auth.signOut({scope:'local'});
  }
});
test('cadastro confirma pelo SMTP local e continua somente cliente', async ({page}) => {
  await page.route('**/auth/v1/signup', route => {
    const payload = route.request().postDataJSON();
    payload.data = { ...payload.data, role: 'owner', office_id: process.env.AUTH_LAB_OTHER_OFFICE };
    return route.continue({ postData: JSON.stringify(payload) });
  });
  await page.goto('/cadastro');
  await page.getByLabel('Nome',{exact:true}).fill('Cliente de teste');
  await page.getByLabel('E-mail',{exact:true}).fill('signup@example.test');
  await page.getByLabel('Senha',{exact:true}).fill(password);
  await page.getByRole('button',{name:'Criar conta de cliente'}).click();
  await expect(page.getByRole('status')).toContainText('Confira seu e-mail');
  const link=await emailLink('signup@example.test');
  await page.goto(link);
  await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();
  await expect(page.getByText('Cliente',{exact:true})).toBeVisible();
  await page.goto('/painel');
  await expect(page.getByRole('heading',{name:'Acesso não autorizado'})).toBeVisible();
});
test('recuperacao PKCE altera senha; link reutilizado e codigo invalido recusados', async ({page}) => {
  await page.goto('/recuperar-senha?area=team');
  await page.getByLabel('E-mail',{exact:true}).fill('owner@example.test');
  await page.getByRole('button',{name:'Enviar instruções'}).click();
  await expect(page.getByRole('status')).toContainText('Se houver uma conta');
  const link=await emailLink('owner@example.test');
  await page.goto(link);
  await expect(page).toHaveURL(/\/redefinir-senha\?area=team$/);
  await page.reload();
  await expect(page.getByLabel('Nova senha',{exact:true})).toBeVisible();
  await page.getByLabel('Nova senha',{exact:true}).fill(`${password}-new`);
  await page.getByRole('button',{name:'Salvar nova senha'}).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('status')).toContainText('Senha atualizada');
  await login(page,'owner');
  await expect(page.getByRole('alert')).toContainText('E-mail ou senha incorretos');
  await login(page,'owner',`${password}-new`);
  await expect(page.getByRole('heading',{name:'Área de operação'})).toBeVisible();
  await page.goto(link);
  await expect(page.getByRole('alert')).toContainText('expirou ou já foi utilizado');
  await page.goto('/auth/callback?code=invalid&next=https://example.org');
  await expect(page.getByRole('alert')).toContainText('Não foi possível reconhecer a solicitação');
  expect(new URL(page.url()).pathname).toBe('/auth/callback');
  expect(new URL(page.url()).search).toBe('');
});

test('outro navegador nao e confundido com expiracao nem libera nova senha', async ({page,browser}) => {
  await page.goto('/recuperar-senha?area=team');
  await page.getByLabel('E-mail',{exact:true}).fill('other@example.test');
  await page.getByRole('button',{name:'Enviar instruções'}).click();
  await expect(page.getByRole('status')).toContainText('Se houver uma conta');
  const link=await emailLink('other@example.test');
  const isolated=await browser.newContext();
  try {
    const otherPage=await isolated.newPage();
    await otherPage.goto(link);
    await expect(otherPage.getByRole('alert')).toContainText('Não foi possível reconhecer a solicitação');
    await expect(otherPage.getByLabel('Nova senha',{exact:true})).toHaveCount(0);
    await expect(otherPage.getByRole('link',{name:'Solicitar novo link'})).toHaveAttribute('href','/recuperar-senha?area=team');
    expect(new URL(otherPage.url()).search).toBe('');
    expect(new URL(otherPage.url()).hash).toBe('');
  } finally { await isolated.close(); }
});

test('indisponibilidade na troca nao aparece como link expirado', async ({page}) => {
  await page.goto('/recuperar-senha');
  await page.getByLabel('E-mail',{exact:true}).fill('signup@example.test');
  await page.getByRole('button',{name:'Enviar instruções'}).click();
  await expect(page.getByRole('status')).toContainText('Se houver uma conta');
  const link=await emailLink('signup@example.test');
  // Contract failure at the token exchange; real local SMTP/PKCE request before it.
  await page.route('**/auth/v1/token?grant_type=pkce',route=>route.fulfill({status:503,json:{code:'unexpected_failure',msg:'Unavailable'}}));
  await page.goto(link);
  await expect(page.getByRole('alert')).toContainText('falha de conexão ou do serviço');
  await expect(page.getByLabel('Nova senha',{exact:true})).toHaveCount(0);
  expect(new URL(page.url()).search).toBe('');
});

test('duas recuperacoes pendentes no mesmo navegador preservam cada solicitacao', async ({page}) => {
  for(const name of ['unlinked','inactive']) {
    await page.goto('/recuperar-senha?area=team');
    await page.getByLabel('E-mail',{exact:true}).fill(`${name}@example.test`);
    await page.getByRole('button',{name:'Enviar instruções'}).click();
    await expect(page.getByRole('status')).toContainText('Se houver uma conta');
  }
  for(const name of ['unlinked','inactive']) {
    const link=await emailLink(`${name}@example.test`);
    await page.goto(link);
    await expect(page).toHaveURL(/\/redefinir-senha\?area=team$/);
    await expect(page.getByLabel('Nova senha',{exact:true})).toBeVisible();
    expect(new URL(page.url()).search).toBe('?area=team');
  }
});

test('link realmente expirado pelo provedor e recusado', async ({page, request}) => {
  const expired = await request.get(process.env.AUTH_LAB_EXPIRED_LINK!, { maxRedirects: 0 });
  expect(expired.status()).toBe(303);
  const callback = new URL(expired.headers().location);
  expect(callback.searchParams.get('error_code')).toBe('otp_expired');
  await page.goto(callback.toString());
  await expect(page.getByRole('alert')).toContainText('expirou ou já foi utilizado');
  expect(new URL(page.url()).pathname).toBe('/auth/callback');
  expect(new URL(page.url()).search).toBe('');
});
test('falha de envio nao declara email entregue', async ({page}) => {
  await page.route('**/auth/v1/recover*', route => route.fulfill({status:500,json:{code:'unexpected_failure',msg:'Error sending recovery email'}}));
  await page.goto('/recuperar-senha');
  await page.getByLabel('E-mail',{exact:true}).fill('owner@example.test');
  await page.getByRole('button',{name:'Enviar instruções'}).click();
  await expect(page.getByRole('alert')).toContainText('verificar o serviço de envio');
  await expect(page.getByRole('button',{name:'Enviar instruções'})).toBeEnabled();
});
