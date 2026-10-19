import { expect, test, type Page } from '@playwright/test';
import type { Session } from '@supabase/supabase-js';

type AuthMemory = Window & { retiredAuthSession?: Session };
async function login(page: Page, name: string, role: string) {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
  await expect(page.locator('.operation-role')).toHaveText(role);
}
async function rememberOld(page: Page) {
  await page.evaluate(async () => {
    const path = '/src/features/auth/browser.ts';
    const { supabase } = await import(path);
    (window as AuthMemory).retiredAuthSession = (await supabase.auth.getSession()).data.session;
  });
}
async function hasSession(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/features/auth/browser.ts';
    const { supabase } = await import(path);
    return Boolean((await supabase.auth.getSession()).data.session);
  });
}

test('duas abas encerram a sessão expirada, bloqueiam refresh antigo e aceitam novo session_id', async ({ page, context }) => {
  const role = 'Super administrador (Proprietário)';
  await login(page, 'manager', role);
  const other = await context.newPage();
  await other.goto('/painel');
  await expect(other.locator('.operation-role')).toHaveText(role);
  await rememberOld(page);
  await rememberOld(other);
  // Provider revocation is deliberately unavailable: the local denial marker
  // must stop an otherwise valid refresh in either tab, including after reload.
  await page.route('**/auth/v1/logout?scope=local', route => route.fulfill({ status: 503, json: { code: 'unexpected_failure' } }));
  let once = true;
  await page.route('**/api/auth/context', route => {
    if (once) { once = false; return route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } }); }
    return route.continue();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  for (const tab of [page, other]) {
    await expect(tab).toHaveURL('/login');
    await expect.poll(() => hasSession(tab)).toBe(false);
    expect(await tab.evaluate(async () => {
      const path = '/src/features/auth/browser.ts';
      const { supabase } = await import(path);
      try { await supabase.auth.refreshSession((window as AuthMemory).retiredAuthSession); } catch { /* Local marker rejects the ended scope. */ }
      window.dispatchEvent(new Event('focus'));
      return !(await supabase.auth.getSession()).data.session;
    })).toBe(true);
  }
  await page.getByRole('link', { name: 'Escritório JN — início', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
  await other.reload();
  expect(await hasSession(other)).toBe(false);
  // A fresh real login for the same UID has a new provider session_id. SDK
  // broadcasting must adopt it in both tabs while the old scope stays denied.
  await login(other, 'manager', role);
  await expect(page).toHaveURL('/painel');
  await expect(page.locator('.operation-role')).toHaveText(role);
  await page.reload();
  await expect(page.locator('.operation-role')).toHaveText(role);
});

test('evento expirado antigo não cancela login legítimo iniciado sem sessão anterior', async ({ page }) => {
  await login(page, 'manager', 'Super administrador (Proprietário)');
  await rememberOld(page);
  await page.route('**/auth/v1/logout?scope=local', route => route.fulfill({ status: 503, json: { code: 'unexpected_failure' } }));
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/login');
  expect(await hasSession(page)).toBe(false);
  let release!: () => void, held!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const holding = new Promise<void>(resolve => { held = resolve; });
  await page.route('**/auth/v1/token?grant_type=password', async route => { held(); await pending; await route.continue(); });
  await page.getByLabel('E-mail', { exact: true }).fill('worker@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
  await holding;
  try {
    await page.evaluate(async () => {
      const path = '/src/features/auth/browser.ts';
      const { endBrowserSession } = await import(path);
      await endBrowserSession((window as AuthMemory).retiredAuthSession!);
    });
  } finally { release(); }
  await expect(page.locator('.operation-role')).toHaveText('Funcionário');
});
