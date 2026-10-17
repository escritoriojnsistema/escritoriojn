import { test, expect } from '@playwright/test';

test('entrada segue a referência e navega sem recarregar a SPA', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { navigationMarker: number }).navigationMarker = 42; });
  await page.getByRole('link', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/login-cliente$/);
  await expect(page.getByRole('heading', { name: 'Área do Cliente' })).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { navigationMarker: number }).navigationMarker)).toBe(42);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
  await page.goForward();
  await expect(page.getByRole('heading', { name: 'Área do Cliente' })).toBeVisible();
});

for (const [path, heading] of [
  ['/login', 'Área da Equipe'], ['/login-cliente', 'Área do Cliente'], ['/recuperar-senha?area=client', 'Esqueceu sua senha?'],
]) {
  test(`recarga direta e acesso não simulado: ${path}`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => { if (request.method() !== 'GET') requests.push(request.url()); });
    await page.goto(path);
    await page.reload();
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page.getByText('Acesso em preparação', { exact: true })).toBeVisible();
    await expect(page.getByLabel('E-mail', { exact: true })).toBeDisabled();
    expect(requests).toEqual([]);
  });
}

for (const width of [320, 360, 768, 1440]) {
  test(`telas públicas responsivas em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 500 ? 640 : 900 });
    for (const path of ['/', '/login', '/login-cliente', '/recuperar-senha?area=client', '/status', '/nao-existe']) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), path).toBe(true);
    }
  });
}

test('POST de validação chega à mesma API e erros continuam JSON', async ({ request }) => {
  const response = await request.post('/api/validate', { data: { message: 'transporte sem persistência' } });
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ data: { valid: true } });
  const invalid = await request.post('/api/validate', { data: { message: '' } });
  expect(invalid.status()).toBe(422);
  expect((await invalid.json()).error.code).toBe('VALIDATION_ERROR');
  const missing = await request.get('/api/nao-existe');
  expect(missing.status()).toBe(404);
  expect((await missing.json()).error.code).toBe('NOT_FOUND');
});

test('asset inexistente retorna 404 sem receber a página HTML', async ({ request }) => {
  const response = await request.get('/assets/arquivo-inexistente.js');
  expect(response.status()).toBe(404);
  expect(response.headers()['content-type'] ?? '').not.toContain('text/html');
});

for (const [path, heading] of [['/login/', 'Área da Equipe'], ['/LOGIN', 'Área da Equipe'], ['/recuperar-senha/', 'Esqueceu sua senha?']]) {
  test(`alias de rota mantém tela e título: ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    await expect(page).not.toHaveTitle(/Página não encontrada/);
  });
}
