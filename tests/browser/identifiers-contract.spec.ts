import { test, expect, type Page } from '@playwright/test';
import type { TeamRole } from '../../shared/team';

// Presentation and transport contracts with fictitious public SDK settings.
test.skip(!process.env.TEAM_UI_CONTRACT, 'Requires TEAM_UI_CONTRACT=1 and the dedicated public SDK fixture.');
const office = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const invitation = '33333333-3333-4333-8333-333333333333';

async function session(page: Page) {
  const token = `e30.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: office })).toString('base64url')}.fixture`;
  await page.addInitScript(({ token, user }) => localStorage.setItem('sb-team-ui-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-only-refresh', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-18T00:00:00Z' } })), { token, user });
  await page.route('https://team-ui.supabase.co/**', route => route.fulfill({ json: { id: user, email: 'fixture@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  await page.route('**/api/notifications/summary',r=>r.fulfill({json:{data:{unread:0}}}));
 await page.route('**/api/auth/context', route => route.fulfill({ json: { data: { user: { id: user }, contexts: [{ office_id: office, user_id: user, role_code: 'owner', permissions: ['foundation.access', 'users.manage'], office_name: 'Escritório de Teste', display_name: 'Pessoa de Teste' }] } } }));
}

async function cpfEntry(page: Page) {
  const input = page.getByLabel('CPF', { exact: true });
  await input.pressSequentially('5299');
  await expect(input).toHaveValue('529.9');
  await input.pressSequentially('8224725');
  await expect(input).toHaveValue('529.982.247-25');
  await input.press('Backspace');
  await expect(input).toHaveValue('529.982.247-2');
  await input.fill('');
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.evaluate(() => navigator.clipboard.writeText('CPF: 529.982.247-25999'));
  await input.press('Control+V');
  await expect(input).toHaveValue('529.982.247-25');
}

for (const width of [360, 1440]) for (const role of ['owner', 'admin', 'employee'] as TeamRole[]) {
  test(`criação ${role} ${width}px mascara CPF e mantém rótulo enquanto bloqueia repetição`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await session(page);
    await page.route('**/api/team?**', route => route.fulfill({ json: { data: { kind: 'members', items: [], total: 0, page: 1, page_size: 5, counts: { members: 0, invitations: 0 }, scope: { role_code: 'owner', allowed_roles: ['employee', 'admin', 'owner'], allowed_permissions: ['foundation.access'], can_create_owner: true, can_delegate: true } } } }));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    await page.route('**/api/team/invitations', async route => {
      calls++;
      expect(route.request().postDataJSON()).toMatchObject({ cpf: '52998224725', role_code: role });
      await pending;
      await route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE' } } });
    });
    await page.goto('/equipe');
    await page.getByRole('button', { name: 'Novo convite', exact: true }).click();
    await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa Fictícia');
    await page.getByLabel('E-mail', { exact: true }).fill('ficticia@example.test');
    await cpfEntry(page);
    if (width === 360) await page.getByRole('button', { name: 'Continuar para acesso' }).click();
    await page.getByRole('combobox', { name: 'Função', exact: true }).selectOption(role);
    page.on('dialog', dialog => dialog.accept());
    const submit = page.getByRole('button', { name: 'Criar e enviar convite', exact: true });
    try {
      await submit.click();
      await expect.poll(() => calls).toBe(1);
      await expect(submit).toBeDisabled();
      await expect(page.getByText('Criando…', { exact: true })).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    } finally { release(); }
    await expect(page.getByRole('alert')).toContainText('Serviço indisponível');
    await expect(submit).toBeEnabled();
    expect(calls).toBe(1);
  });

  test(`conferência ${role} ${width}px mascara CPF e mantém rótulo durante envio`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await session(page);
    await page.route(`**/api/team/invitations/${invitation}/state`, route => route.fulfill({ json: { data: { id: invitation, office_name: 'Escritório de Teste', verified: false, has_password: false, verified_until: null } } }));
    let release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    let calls = 0;
    await page.route(`**/api/team/invitations/${invitation}/verify`, async route => {
      calls++;
      expect(route.request().postDataJSON()).toEqual({ full_name: 'Pessoa Fictícia', cpf: '52998224725', role_code: role });
      await pending;
      await route.fulfill({ json: { data: { verified: false, code: 'IDENTITY_MISMATCH' } } });
    });
    await page.goto(`/convite?id=${invitation}`);
    await page.getByLabel('Nome completo', { exact: true }).fill('Pessoa Fictícia');
    await cpfEntry(page);
    await page.getByRole('combobox', { name: 'Função', exact: true }).selectOption(role);
    const submit = page.getByRole('button', { name: 'Conferir dados', exact: true });
    try {
      await submit.click();
      await expect.poll(() => calls).toBe(1);
      await expect(submit).toBeDisabled();
      await expect(page.getByText('Conferindo…', { exact: true })).toHaveCount(0);
    } finally { release(); }
    await expect(page.getByRole('alert')).toContainText('Não foi possível conferir os dados');
    await expect(submit).toBeEnabled();
    expect(calls).toBe(1);
  });
}

test('aceite mantém rótulo e bloqueio de repetição enquanto aguarda servidor', async ({ page }) => {
  await session(page);
  await page.route(`**/api/team/invitations/${invitation}/state`, route => route.fulfill({ json: { data: { id: invitation, office_name: 'Escritório de Teste', verified: true, has_password: true, verified_until: new Date(Date.now() + 900_000).toISOString() } } }));
  let release!: () => void;
  const pending = new Promise<void>(resolve => { release = resolve; });
  let calls = 0;
  await page.route(`**/api/team/invitations/${invitation}/accept`, async route => {
    calls++;
    await pending;
    await route.fulfill({ status: 503, json: { error: { code: 'SERVICE_UNAVAILABLE' } } });
  });
  await page.goto(`/convite?id=${invitation}`);
  const submit = page.getByRole('button', { name: 'Aceitar convite e entrar', exact: true });
  try {
    await submit.click();
    await expect.poll(() => calls).toBe(1);
    await expect(submit).toBeDisabled();
    await expect(page.getByText('Finalizando…', { exact: true })).toHaveCount(0);
  } finally { release(); }
  await expect(page.getByRole('alert')).toContainText('Serviço indisponível');
  expect(calls).toBe(1);
});
