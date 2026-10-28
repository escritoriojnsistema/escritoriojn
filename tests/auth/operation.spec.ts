import { expect, test } from '@playwright/test';

// Real SDK + GoTrue + PostgREST + SMTP in the disposable lab, never hosted accounts.
const profiles = [
  { name: 'manager', role: 'Super administrador (Proprietário)', client: false, manage: true },
  { name: 'delegate', role: 'Administrador', client: false, manage: false },
  { name: 'worker', role: 'Funcionário', client: false, manage: false },
  { name: 'portalclient', role: 'Cliente', client: true, manage: false },
];
for (const profile of profiles) test(`login real abre operação, Conta e menu para ${profile.name}`, async ({ page, request }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  // The selected portal and the server-verified membership must both match.
  await page.goto(profile.client ? '/login-cliente' : '/login');
  await page.getByLabel('E-mail', { exact: true }).fill(`${profile.name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: profile.client ? 'Entrar na área do cliente' : 'Entrar na área da equipe' }).click();
  await expect(page).toHaveURL(profile.client ? '/area-cliente' : '/painel');
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
  await expect(page.locator('.operation-role')).toHaveText(profile.role);
  await expect(page.locator('.access-visual')).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  const drawer = page.getByRole('dialog', { name: 'Menu de navegação' });
  await expect(drawer.getByRole('link', { name: 'Equipe e convites', exact: true })).toHaveCount(profile.manage ? 1 : 0);
  await drawer.getByRole('link', { name: 'Conta', exact: true }).click();
  await expect(page).toHaveURL(profile.client ? '/minha-conta' : '/conta');
  await expect(page.getByRole('heading', { name: 'Conta', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Recuperar senha', exact: true })).toHaveAttribute('href', `/recuperar-senha?area=${profile.client ? 'client' : 'team'}`);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Conta', exact: true })).toBeVisible();
  const home = profile.client ? '/area-cliente' : '/painel';
  await page.goto('/');
  await expect(page).toHaveURL(home);
  await page.getByRole('link', { name: 'Abrir conta', exact: true }).click();
  await page.getByRole('link', { name: 'Recuperar senha', exact: true }).click();
  await page.locator('.mobile-brand').getByRole('link', { name: 'Escritório JN — início', exact: true }).click();
  await expect(page).toHaveURL(home);
  await page.setViewportSize({ width: 1440, height: 900 });
  const sidebar = page.getByRole('complementary', { name: 'Navegação principal' });
  await sidebar.getByRole('link', { name: 'Conta', exact: true }).click();
  await sidebar.getByRole('link', { name: 'Escritório JN — início', exact: true }).click();
  await expect(page).toHaveURL(home);
  await sidebar.getByRole('link', { name: 'Início', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
  // Token rotation for the same real provider session must keep the shell.
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/auth/context', async route => { await pending; await route.continue(); });
  const refreshing = page.evaluate(async () => {
    const modulePath = '/src/features/auth/browser.ts';
    const { supabase } = await import(modulePath);
    const { error } = await supabase.auth.refreshSession();
    return !error;
  });
  try {
    await page.waitForRequest('**/api/auth/context');
    await expect(sidebar).toBeVisible();
    await sidebar.getByRole('link', { name: 'Conta', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Conta', exact: true })).toBeVisible();
    await expect(page.getByText(/Carregando|Verificando seu acesso/)).toHaveCount(0);
  } finally { release(); }
  expect(await refreshing).toBe(true);
  await page.unroute('**/api/auth/context');
  if (!profile.manage) {
    const result = await page.evaluate(async office => {
      const modulePath = '/src/features/auth/browser.ts';
      const { supabase } = await import(modulePath);
      const { data } = await supabase.auth.getSession();
      return (await fetch(`/api/team?office_id=${office}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })).status;
    }, process.env.AUTH_LAB_OFFICE!);
    expect(result).toBe(403);
  }
  await page.setViewportSize({ width: 360, height: 640 });
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await drawer.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(profile.client ? '/login-cliente' : '/login');
  await page.goto(profile.client ? '/minha-conta' : '/conta');
  await expect(page).toHaveURL(profile.client ? '/login-cliente' : '/login');
  expect((await request.get('/api/auth/context')).status()).toBe(401);
});

for (const profile of profiles) test(`portal incorreto recusa ${profile.name} e encerra a sessão local`, async ({ page }) => {
  const wrongPortal = profile.client ? '/login' : '/login-cliente';
  await page.goto(wrongPortal);
  await page.getByLabel('E-mail', { exact: true }).fill(`${profile.name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: profile.client ? 'Entrar na área da equipe' : 'Entrar na área do cliente' }).click();
  await expect(page.getByRole('alert')).toContainText('Este portal não está disponível para esta conta');
  await expect(page).toHaveURL(wrongPortal);
  await expect(page.locator('.operation-layout')).toHaveCount(0);
  expect(await page.evaluate(async () => {
    const modulePath = '/src/features/auth/browser.ts';
    const { supabase } = await import(modulePath);
    return Boolean((await supabase.auth.getSession()).data.session);
  })).toBe(false);
});

test('tentativa recusada não encerra outra sessão válida já aberta', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('worker@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
  await page.goto('/login-cliente');
  await page.getByLabel('E-mail', { exact: true }).fill('manager@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área do cliente' }).click();
  await expect(page.getByRole('alert')).toContainText('Este portal não está disponível para esta conta');
  expect(await page.evaluate(async () => {
    const modulePath = '/src/features/auth/browser.ts';
    const { supabase } = await import(modulePath);
    return (await supabase.auth.getUser()).data.user?.email === 'worker@example.test';
  })).toBe(true);
});

test('adoção abandonada não sobrescreve a identidade de um login posterior', async ({ page }) => {
  const endpoint = `${process.env.AUTH_LAB_URL}/auth/v1/user`;
  let release!: () => void;
  let holding!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  const held = new Promise<void>(resolve => { holding = resolve; });
  let first = true;
  let heldRequest: import('@playwright/test').Request;
  await page.route(endpoint, async route => {
    if (first) { first = false; heldRequest = route.request(); holding(); await pending; }
    await route.continue();
  });
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('manager@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
  await held;
  await page.getByRole('link', { name: 'Voltar ao início', exact: true }).click();
  await page.getByRole('link', { name: 'Acesso da equipe', exact: true }).click();
  await page.getByLabel('E-mail', { exact: true }).fill('worker@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
  await expect(page.locator('.operation-role')).toHaveText('Funcionário');
  const oldResponse = page.waitForResponse(response => response.request() === heldRequest);
  release();
  await (await oldResponse).finished();
  expect(await page.evaluate(async () => {
    const modulePath = '/src/features/auth/browser.ts';
    const { supabase } = await import(modulePath);
    return (await supabase.auth.getUser()).data.user?.email === 'worker@example.test';
  })).toBe(true);
});

test('cliente ignora convite na URL e permanece exclusivamente na própria área', async ({ page }) => {
  await page.goto('/login-cliente?invite=11111111-1111-4111-8111-111111111111');
  await page.getByLabel('E-mail', { exact: true }).fill('portalclient@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área do cliente' }).click();
  await expect(page).toHaveURL('/area-cliente');
  await expect(page.locator('.operation-role')).toHaveText('Cliente');
});

test('falha na verificação do portal não persiste a sessão da tentativa', async ({ page }) => {
  await page.route(`${process.env.AUTH_LAB_URL}/rest/v1/rpc/my_access_context`, route => route.abort('failed'));
  await page.goto('/login');
  await page.getByLabel('E-mail', { exact: true }).fill('manager@example.test');
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: 'Entrar na área da equipe' }).click();
  await expect(page.getByRole('alert')).toContainText('Não foi possível verificar seu acesso');
  expect(await page.evaluate(async () => {
    const modulePath = '/src/features/auth/browser.ts';
    const { supabase } = await import(modulePath);
    return Boolean((await supabase.auth.getSession()).data.session);
  })).toBe(false);
});
