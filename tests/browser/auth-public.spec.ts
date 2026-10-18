import { test,expect } from '@playwright/test';
test('cadastro publico tem apenas campos de cliente e senha pode ser conferida',async({page})=>{
  await page.goto('/cadastro');
  await expect(page.getByRole('heading',{name:'Crie sua conta'})).toBeVisible();
  await expect(page.getByLabel('Nome', {exact:true})).toBeVisible();
  await expect(page.getByLabel('E-mail',{exact:true})).toHaveAttribute('autocomplete','email');
  await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('autocomplete','new-password');
  await expect(page.locator('[name="role"], [name="office_id"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Mostrar senha',exact:true}).click();
  await expect(page.getByLabel('Senha',{exact:true})).toHaveAttribute('type','text');
});
test('painel direto exige sessao e callback sem codigo nao segue redirect externo',async({page})=>{
  await page.goto('/painel');
  await expect(page).toHaveURL(/\/login(?:\?|$)/);
  await page.goto('/auth/callback?next=https://example.org');
  await expect(page.getByRole('alert')).toContainText('Link inválido ou expirado');
  expect(new URL(page.url()).hostname).not.toBe('example.org');
});

test('rota aninhada de autenticacao chega a API e exige sessao',async({request})=>{
  const response=await request.get('/api/auth/context',{headers:{Accept:'application/json'}});
  expect(response.status()).toBe(401);
  expect((await response.json()).error.code).toBe('AUTH_REQUIRED');
  expect(response.headers()['cache-control']).toContain('no-store');
  expect(response.headers()['x-request-id']).toMatch(/^[a-f0-9-]{36}$/);
  const invalid=await request.get('/api/auth/context?area=team',{headers:{Authorization:'Bearer invalid.stage4.transport'}});
  const result={status:invalid.status(),code:(await invalid.json()).error.code};
  if(process.env.E2E_BASE_URL) expect(result).toEqual({status:401,code:'AUTH_REQUIRED'});
  else expect([{status:401,code:'AUTH_REQUIRED'},{status:503,code:'AUTH_NOT_CONFIGURED'}]).toContainEqual(result);
});
test('rota aninhada desconhecida retorna erro da API com rastreio',async({request})=>{
  const response=await request.get('/api/modulo/nao-existe',{headers:{Accept:'application/json'}});
  expect(response.status()).toBe(404);
  const body=await response.json();
  expect(body.error.code).toBe('NOT_FOUND');
  expect(body.error.request_id).toBe(response.headers()['x-request-id']);
  expect(body.error.request_id).toMatch(/^[a-f0-9-]{36}$/);
});
