import { test, expect } from '@playwright/test';

const screens = ['/', '/login', '/login-cliente', '/recuperar-senha?area=client', '/cadastro', '/redefinir-senha', '/auth/callback'];
for (const [width, height] of [[320, 568], [360, 640], [768, 1024], [1440, 900]]) {
  test(`conteúdo público compacto e cadastro com rolagem natural em ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    for (const path of screens) {
      await page.goto(path);
      await expect(page.locator('h1')).toBeVisible();
      const size = await page.evaluate(() => ({
        vertical: document.documentElement.scrollHeight - innerHeight,
        horizontal: document.documentElement.scrollWidth - innerWidth,
      }));
      if(path==='/cadastro'&&width<=600){
        const submit=page.getByRole('button',{name:'Criar conta de cliente'});
        await submit.scrollIntoViewIfNeeded();await expect(submit).toBeInViewport();
        await page.getByRole('contentinfo').scrollIntoViewIfNeeded();
        await expect(page.getByRole('contentinfo')).toBeInViewport();
      }else expect(size.vertical, path).toBeLessThanOrEqual(1);
      expect(size.horizontal, path).toBeLessThanOrEqual(1);
    }
  });
}

test('conteúdo ampliado pode rolar sem cortar o retorno e as políticas', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 400 });
  await page.goto('/recuperar-senha?area=client');
  await expect(page.getByRole('heading',{name:'Esqueceu sua senha?'})).toBeVisible();
  await page.locator('.access-description').evaluate(element => {
    element.textContent = 'Recupere o acesso à sua conta. Confira as instruções recebidas no seu e-mail. '.repeat(12);
  });
  expect(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight)).toBe(true);
  const back = page.getByRole('region',{name:'Esqueceu sua senha?'}).getByRole('link', { name: 'Voltar',exact:true });
  await back.scrollIntoViewIfNeeded();await expect(back).toBeInViewport();
  const footer=page.getByRole('contentinfo');await footer.scrollIntoViewIfNeeded();await expect(footer).toBeInViewport();
  await expect(footer.getByRole('link',{name:'Cookies e preferências'})).toBeInViewport();
  await back.focus();await page.keyboard.press('Enter');await expect(page).toHaveURL(/\/login-cliente$/);
});
