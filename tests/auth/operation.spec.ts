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
  // Deliberately use the opposite entry: verified membership determines the area.
  await page.goto(profile.client ? '/login' : '/login-cliente');
  await page.getByLabel('E-mail', { exact: true }).fill(`${profile.name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(process.env.AUTH_LAB_PASSWORD!);
  await page.getByRole('button', { name: profile.client ? 'Entrar na área da equipe' : 'Entrar na área do cliente' }).click();
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
  if (!profile.manage) {
    const result = await page.evaluate(async office => {
      const modulePath = '/src/features/auth/browser.ts';
      const { supabase } = await import(modulePath);
      const { data } = await supabase.auth.getSession();
      return (await fetch(`/api/team?office_id=${office}`, { headers: { Authorization: `Bearer ${data.session.access_token}` } })).status;
    }, process.env.AUTH_LAB_OFFICE!);
    expect(result).toBe(403);
  }
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await drawer.getByRole('button', { name: 'Sair da conta' }).click();
  await expect(page).toHaveURL(profile.client ? '/login-cliente' : '/login');
  await page.goto(profile.client ? '/minha-conta' : '/conta');
  await expect(page).toHaveURL(profile.client ? '/login-cliente' : '/login');
  expect((await request.get('/api/auth/context')).status()).toBe(401);
});
