import { test, expect } from '@playwright/test';

test('health responde JSON pela mesma origem da tela', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toContain('application/json');
  expect(await response.json()).toEqual({ data: { status: 'ok', service: 'escritorio-jn-api' } });
});

test('tela inicial apresenta o resultado do backend real', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Seu escritório, bem organizado.' })).toBeVisible();
  await expect(page.getByRole('status')).toContainText('API disponível');
  await expect(page.getByRole('button', { name: 'Verificar novamente' })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('falha da API fica visível e permite tentar novamente', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toContainText('Não foi possível verificar a API');
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('status')).toContainText('API disponível');
});

test('HTML no endereço da API não é exibido como sucesso', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ status: 200, contentType: 'text/html', body: '<html>SPA</html>' }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByText('API disponível', { exact: true })).toHaveCount(0);
});

test('JSON sem o contrato esperado é tratado como falha', async ({ page }) => {
  await page.route('**/api/health', route => route.fulfill({ json: { data: { status: 'ok' } } }));
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a consulta tem limite de tempo e permite repetir após timeout', async ({ page }) => {
  await page.route('**/api/health', () => {});
  await page.goto('/');
  await expect(page.getByRole('alert')).toBeVisible({ timeout: 8000 });
  await page.unroute('**/api/health');
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('status')).toContainText('API disponível');
});

test('perda de conexão não declara sucesso e permite recuperação', async ({ page, context }) => {
  await page.goto('/');
  await expect(page.getByRole('status')).toContainText('API disponível');
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Verificar novamente' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('status')).toContainText('API disponível');
});

for (const width of [360, 768, 1440]) {
  test(`tela utilizável sem corte horizontal em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await expect(page.getByRole('status')).toContainText('API disponível');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.getByRole('button', { name: 'Verificar novamente' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('status')).toContainText('API disponível');
  });
}
