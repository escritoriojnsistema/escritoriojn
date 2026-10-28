import { test, expect, type Page } from '@playwright/test';

const profiles = [
  { name: 'manager', role: 'Super administrador (Proprietário)', client: false },
  { name: 'delegate', role: 'Administrador', client: false },
  { name: 'worker', role: 'Funcionário', client: false },
  { name: 'portalclient', role: 'Cliente', client: true },
];
async function login(page: Page, profile: typeof profiles[number]) {
  await page.goto(profile.client ? '/login-cliente' : '/login');
  await page.getByLabel('E-mail', { exact: true }).fill(`${profile.name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: profile.client ? 'Entrar na área do cliente' : 'Entrar na área da equipe' }).click();
  await expect(page.locator('.operation-role')).toHaveText(profile.role);
}
async function hasSession(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/features/auth/browser.ts';
    const { supabase } = await import(path);
    return Boolean((await supabase.auth.getSession()).data.session);
  });
}

for (const profile of profiles) {
  test(`401 encerra SDK e não ressuscita por logo, foco, refresh ou reload: ${profile.name}`, async ({ page }) => {
    await login(page, profile);
    let once = true;
    await page.route('**/api/auth/context', route => {
      if (once) { once = false; return route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } }); }
      return route.continue();
    });
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await expect(page).toHaveURL(profile.client ? '/login-cliente' : '/login');
    await expect(page.getByRole('alert')).toContainText('Sua sessão expirou');
    await expect.poll(() => hasSession(page)).toBe(false);
    await page.getByRole('link', { name: 'Escritório JN — início', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
    await page.evaluate(async () => {
      const path = '/src/features/auth/browser.ts';
      const { supabase } = await import(path);
      await supabase.auth.refreshSession();
      window.dispatchEvent(new Event('focus'));
    });
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
    expect(await hasSession(page)).toBe(false);
    // A new provider session for the same identity is a legitimate new login.
    await login(page, profile);
    expect(await hasSession(page)).toBe(true);
  });

  test(`logout não ressuscita por foco, refresh, logo ou reload: ${profile.name}`, async ({ page }) => {
    await login(page, profile);
    await page.getByRole('button', { name: 'Sair da conta' }).click();
    await expect(page).toHaveURL(profile.client ? '/login-cliente' : '/login');
    expect(await hasSession(page)).toBe(false);
    await page.evaluate(async () => {
      const path = '/src/features/auth/browser.ts';
      const { supabase } = await import(path);
      await supabase.auth.refreshSession();
      window.dispatchEvent(new Event('focus'));
    });
    await page.getByRole('link', { name: 'Escritório JN — início', exact: true }).click();
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
    expect(await hasSession(page)).toBe(false);
  });

  test(`login verifica RPC uma vez e API revalida no foco/reload: ${profile.name}`, async ({ page }) => {
    let calls = 0;
    page.on('request', request => { if (new URL(request.url()).pathname === '/api/auth/context') calls++; });
    await login(page, profile);
    expect(calls).toBe(0);
    const focused = page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/context');
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await focused;
    expect(calls).toBe(1);
    await page.reload();
    await expect(page.locator('.operation-role')).toHaveText(profile.role);
    expect(calls).toBe(2);
  });
}

for (const nextProfile of [profiles[2], profiles[0]]) test(`401 anterior não encerra adoção concorrente: ${nextProfile.name}`, async ({ page }) => {
  await login(page, profiles[0]);
  let release!: () => void;
  let held!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const holding = new Promise<void>(resolve => { held = resolve; });
  let completed!: () => void;
  const complete = new Promise<void>(resolve => { completed = resolve; });
  let first = true;
  await page.route('**/api/auth/context', async route => {
    if (!first) { await route.continue(); return; }
    first = false;
    held(); await pending;
    await route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } });
    completed();
  });
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await holding;
  try {
    await page.evaluate(async ({ password, name }) => {
      const path = '/src/features/auth/portalLogin.ts';
      const { portalLogin } = await import(path);
      await portalLogin(`${name}@example.test`, password, true, null, new AbortController().signal);
    }, { password: process.env.AUTH_LAB_PASSWORD!, name: nextProfile.name });
    await expect(page.locator('.operation-role')).toHaveText(nextProfile.role);
  } finally { release(); }
  await complete;
  await page.unroute('**/api/auth/context');
  await expect.poll(() => hasSession(page)).toBe(true);
  await page.reload();
  await expect(page.locator('.operation-role')).toHaveText(nextProfile.role);
});

test('logout lento não apaga adoção concorrente de nova sessão', async ({ page }) => {
  await login(page, profiles[0]);
  let release!: () => void;
  let held!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const holding = new Promise<void>(resolve => { held = resolve; });
  await page.route('**/auth/v1/logout?scope=local', async route => { held(); await pending; await route.continue(); });
  const logoutResponse = page.waitForResponse('**/auth/v1/logout?scope=local');
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await holding;
  try {
    await page.evaluate(async password => {
      const path = '/src/features/auth/portalLogin.ts';
      const { portalLogin } = await import(path);
      await portalLogin('worker@example.test', password, true, null, new AbortController().signal);
    }, process.env.AUTH_LAB_PASSWORD!);
  } finally { release(); }
  await (await logoutResponse).finished();
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  await expect.poll(() => hasSession(page)).toBe(true);
  await page.goto('/painel');
  await expect(page.locator('.operation-role')).toHaveText('Funcionário');
});

test('falha remota no logout mantém encerramento local após reload e novo login funciona', async ({ page }) => {
  await login(page, profiles[0]);
  await page.route('**/auth/v1/logout?scope=local', route => route.fulfill({ status: 503, json: { code: 'unexpected_failure' } }));
  await page.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL('/login');
  expect(await hasSession(page)).toBe(false);
  await page.reload();
  expect(await hasSession(page)).toBe(false);
  await login(page, profiles[0]);
});

for (const path of ['/clientes', '/equipe', '/auditoria']) test(`401 autenticado de ${path} encerra SDK e logo não restaura sessão`, async ({ page }) => {
  await login(page, profiles[0]);
  const endpoint = path === '/clientes' ? '**/api/customers/search' : path === '/equipe' ? '**/api/team?**' : '**/api/governance/audit?**';
  await page.route(endpoint, route => route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } }));
  await page.goto(path);
  await expect(page).toHaveURL('/login');
  await expect.poll(() => hasSession(page)).toBe(false);
  await page.getByRole('link', { name: 'Escritório JN — início', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Bem-vindo ao Escritório JN' })).toBeVisible();
});
