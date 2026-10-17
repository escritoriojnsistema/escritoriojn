import { test, expect } from '@playwright/test';

const screens = ['/', '/login', '/login-cliente', '/recuperar-senha?area=client', '/status'];
for (const [width, height] of [[320, 568], [360, 640], [768, 1024], [1440, 900]]) {
  test(`conteúdo padrão cabe em uma tela de ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      if (path === '/status') await expect(page.getByRole('status')).toContainText('API disponível');
      const size = await page.evaluate(() => ({
        vertical: document.documentElement.scrollHeight - innerHeight,
        horizontal: document.documentElement.scrollWidth - innerWidth,
      }));
      expect(size.vertical, path).toBeLessThanOrEqual(1);
      expect(size.horizontal, path).toBeLessThanOrEqual(1);
    }
  });
}

test('conteúdo ampliado pode rolar sem cortar a ação de recuperação', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 400 });
  await page.route('**/api/health', route => route.fulfill({ status: 503, json: { error: { code: 'UNAVAILABLE' } } }));
  await page.goto('/status');
  await expect(page.getByRole('alert')).toBeVisible();
  await page.locator('.health-result p').evaluate(element => {
    element.textContent = 'Não foi possível concluir a consulta. Confira a conexão e tente novamente. '.repeat(12);
  });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  const retry = page.getByRole('button', { name: 'Tentar novamente' });
  await retry.scrollIntoViewIfNeeded();
  await expect(retry).toBeInViewport();
  await retry.focus();
  await page.unroute('**/api/health');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('status')).toContainText('API disponível');
});
