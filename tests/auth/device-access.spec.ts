import { test, expect, type Page } from '@playwright/test';

const password = process.env.AUTH_LAB_PASSWORD!;
async function login(page: Page, client = false) {
  await page.goto(client ? '/login-cliente' : '/login');
  await page.getByLabel('E-mail', { exact: true }).fill(client ? 'portalclient@example.test' : 'manager@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: client ? 'Entrar na área do cliente' : 'Entrar na área da equipe', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
}
async function omitRecentApis(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(AbortSignal, 'timeout', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(AbortSignal.prototype, 'throwIfAborted', { value: undefined, configurable: true, writable: true });
    Object.defineProperty(crypto, 'randomUUID', { value: undefined, configurable: true, writable: true });
  });
}
async function hasSession(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/features/auth/browser.ts';
    const { supabase } = await import(path);
    return Boolean((await supabase.auth.getSession()).data.session);
  });
}

test('acesso em dispositivos: duas sessões novas da mesma conta são independentes', async ({ browser }) => {
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mobile = await browser.newContext({ viewport: { width: 360, height: 740 }, isMobile: true });
  try {
    const a = await desktop.newPage(), b = await mobile.newPage();
    await Promise.all([login(a), login(b)]);
    await a.getByRole('button', { name: 'Sair da conta', exact: true }).click();
    await expect(a).toHaveURL('/login');
    await b.reload();
    await expect(b.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
  } finally {
    await desktop.close();
    await mobile.close();
  }
});

test('acesso em dispositivos: login funciona sem AbortSignal.any nativo', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(AbortSignal, 'any', { value: undefined, configurable: true, writable: true }));
  await login(page);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
});

test('acesso em dispositivos: cliente entra e mantém sessão sem APIs recentes de cancelamento ou UUID', async ({ page }) => {
  await omitRecentApis(page);
  await login(page, true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
});

for (const client of [false, true]) test(`acesso em dispositivos: 401 bloqueia sessão sem APIs recentes: ${client ? 'cliente' : 'equipe'}`, async ({ page }) => {
  await omitRecentApis(page);
  await login(page, client);
  let first = true;
  await page.route('**/api/auth/context', route => {
    if (first) {
      first = false;
      return route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } });
    }
    return route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page).toHaveURL(client ? '/login-cliente' : '/login');
  await expect.poll(() => hasSession(page)).toBe(false);
  await page.evaluate(async () => {
    const path = '/src/features/auth/browser.ts';
    const { supabase } = await import(path);
    await supabase.auth.refreshSession();
    window.dispatchEvent(new Event('focus'));
  });
  await page.reload();
  expect(await hasSession(page)).toBe(false);
  await login(page, client);
});
