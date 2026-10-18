import { test, expect, type Page } from '@playwright/test';
import type { TeamDashboard, TeamScope } from '../../shared/team';

// Dedicated UI contract proof: run with the fake SDK connection on port 3015.
// These stubs verify presentation and transport, not Supabase/SMTP integration.
test.skip(!process.env.TEAM_UI_CONTRACT, 'Requires the dedicated fake public SDK connection (TEAM_UI_CONTRACT=1).');
const office = '11111111-1111-4111-8111-111111111111';
const user = '22222222-2222-4222-8222-222222222222';
const invitation = '33333333-3333-4333-8333-333333333333';
const scope: TeamScope = { role_code: 'owner', allowed_roles: ['employee', 'admin', 'owner'], allowed_permissions: ['foundation.access', 'audit.read'], can_create_owner: true, can_delegate: true };
function roster(page = 1): TeamDashboard {
  return { kind: 'members', scope, total: 6, page, page_size: 5, counts: { members: 6, invitations: 0 }, items: Array.from({ length: page === 1 ? 5 : 1 }, (_, index) => ({ id: `44444444-4444-4444-8444-44444444444${index}`, user_id: user, name: page === 1 ? `Pessoa da Equipe ${index + 1}` : 'Pessoa da Segunda Página', email: `pessoa${index}@example.test`, role_code: index === 0 ? 'owner' as const : index === 1 ? 'admin' as const : 'employee' as const, active: true, access_active: true, permissions: ['foundation.access'], cpf_masked: '***.***.***-25', can_edit: true, protected_owner: index === 0, delegation: null })) };
}
async function session(page: Page, permissions = ['foundation.access', 'users.manage'], role = 'owner') {
  const token = `e30.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: office })).toString('base64url')}.fixture`;
  await page.addInitScript(({ token, user }) => {
    localStorage.setItem('sb-team-ui-auth-token', JSON.stringify({ access_token: token, refresh_token: 'test-only-refresh-token', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {}, created_at: '2026-10-18T00:00:00Z' } }));
  }, { token, user });
  await page.route('https://team-ui.supabase.co/**', route => route.fulfill({ json: { id: user, email: 'fixture@example.test', aud: 'authenticated', app_metadata: {}, user_metadata: {} } }));
  await page.route('**/api/auth/context', route => route.fulfill({ json: { data: { user: { id: user }, contexts: [{ office_id: office, user_id: user, role_code: role, permissions, office_name: 'Escritório de Teste', display_name: 'Pessoa de Teste' }] } } }));
}
async function dashboard(page: Page, data = roster()) {
  await page.route('**/api/team?**', route => {
    const query = new URL(route.request().url()).searchParams;
    expect(query.get('office_id')).toBe(office);
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    return route.fulfill({ json: { data: query.get('kind') === 'invitations' ? { ...data, kind: 'invitations', items: [], total: 0 } : { ...data, ...(query.get('page') === '2' ? roster(2) : {}) } } });
  });
}

test('capacidade controla entrada do painel e rota de gestão recusa funcionário', async ({ page }) => {
  await session(page, ['foundation.access'], 'employee');
  await page.goto('/painel');
  await expect(page.getByRole('heading', { name: 'Painel da equipe' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Gerenciar equipe e convites' })).toHaveCount(0);
  await page.goto('/equipe');
  await expect(page.getByRole('heading', { name: 'Acesso não autorizado' })).toBeVisible();
});

test('lista pagina por cinco registros e trata 503, repetição e sessão revogada', async ({ page }) => {
  await session(page); await dashboard(page);
  await page.goto('/painel');
  await page.getByRole('link', { name: 'Gerenciar equipe e convites' }).click();
  await expect(page.getByRole('list', { name: 'Pessoas da equipe' }).locator('li')).toHaveCount(5);
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByText('Pessoa da Segunda Página')).toBeVisible();
  await page.route('**/api/team?**', route => route.fulfill({ status: 503, json: { error: { code: 'TEAM_UNAVAILABLE' } } }));
  await page.getByRole('button', { name: 'Anterior', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Serviço indisponível');
  await dashboard(page);
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByText('Pessoa da Equipe 1', { exact: true })).toBeVisible();
  await page.route('**/api/team?**', route => route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } }));
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await page.getByRole('button', { name: 'Próxima', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Sua sessão expirou');
  await expect(page.getByRole('list', { name: 'Pessoas da equipe' })).toHaveCount(0);
});

test('convite mobile confere identidade, separa Dados/Acesso e informa envio pendente', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await session(page); await dashboard(page);
  let submitted = false;
  await page.route('**/api/team/invitations', route => {
    expect(route.request().postDataJSON()).toMatchObject({ office_id: office, full_name: 'Ana Maria de Souza', cpf: '52998224725', role_code: 'employee', permissions: ['foundation.access'] });
    submitted = true;
    return route.fulfill({ status: 201, json: { data: { id: invitation, expires_at: new Date(Date.now() + 72 * 3600_000).toISOString(), delivery: 'pending' } } });
  });
  await page.goto('/equipe'); await page.getByRole('button', { name: 'Novo convite', exact: true }).click();
  await expect(page.getByText('Etapa 1 de 2 · Dados')).toBeVisible();
  await page.getByLabel('Nome completo', { exact: true }).fill('Ana Maria de Souza');
  await page.getByLabel('E-mail', { exact: true }).fill('ana@example.test');
  await page.getByLabel('CPF', { exact: true }).fill('11111111111');
  await page.getByRole('button', { name: 'Continuar para acesso' }).click();
  await expect(page.getByRole('alert')).toContainText('CPF válido');
  expect(submitted).toBe(false);
  await page.getByLabel('CPF', { exact: true }).fill('529.982.247-25');
  await page.getByRole('button', { name: 'Continuar para acesso' }).click();
  await expect(page.getByText('Etapa 2 de 2 · Acesso')).toBeVisible();
  await expect(page.getByLabel('Nome completo', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'Criar e enviar convite' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'envio do e-mail ainda não foi confirmado' })).toBeVisible();
  expect(submitted).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await page.evaluate(() => Object.entries(localStorage).some(([key, value]) => !key.endsWith('-auth-token') && /52998224725|Ana Maria/.test(value)))).toBe(false);
});

test('delegação específica e último proprietário têm controles próprios', async ({ page }) => {
  await session(page); await dashboard(page); await page.goto('/equipe');
  await page.getByRole('button', { name: 'Editar acesso de Pessoa da Equipe 1', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Editar acesso', exact: true })).toBeVisible();
  await Promise.all([page.waitForResponse('**/api/auth/context'), page.evaluate(() => window.dispatchEvent(new Event('focus')))]);
  await expect(page.getByRole('heading', { name: 'Editar acesso', exact: true })).toBeVisible();
  await expect(page.getByRole('combobox', { name: 'Função', exact: true })).toBeDisabled();
  await expect(page.getByLabel('Conta ativa neste escritório')).toBeDisabled();
  await page.getByRole('button', { name: 'Fechar', exact: true }).click();
  await page.getByRole('button', { name: 'Delegar gestão', exact: true }).click();
  await expect(page.getByLabel('Criar novos proprietários')).toBeVisible();
  await expect(page.getByLabel('Validade em dias')).toHaveValue('30');
  await expect(page.getByLabel('Validade em dias')).toHaveAttribute('max', '90');
});

for (const [width, height] of [[320, 568], [360, 640], [768, 1024], [1440, 900]]) test(`gestão e convite sem vazamento horizontal em ${width}px; foco e controles acessíveis`, async ({ page, context }) => {
  await page.setViewportSize({ width, height }); await session(page); await dashboard(page); await page.goto('/equipe');
  await expect(page.getByRole('list', { name: 'Pessoas da equipe' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (width === 1440) expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  if (process.env.TEAM_UI_CAPTURE && [360, 1440].includes(width)) await page.screenshot({ path: `/workspace/shared/etapa-05-equipe-${width}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Novo convite', exact: true }).click();
  const name = page.getByLabel('Nome completo', { exact: true }); await expect(name).toBeVisible();
  if (process.env.TEAM_UI_CAPTURE && [360, 1440].includes(width)) await page.screenshot({ path: `/workspace/shared/etapa-05-convite-${width}.png`, fullPage: true });
  await name.focus();
  await expect(name).toHaveCSS('box-shadow', 'none'); await expect(name).toHaveCSS('outline-style', 'none');
  await expect(name).toHaveCSS('border-top-color', 'rgb(16, 50, 72)');
  if (width <= 600) { await expect(name).toHaveCSS('font-size', '16px'); await expect(page.locator('.team-mobile-brand')).toBeVisible(); }
  const cdp = await context.newCDPSession(page); await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
  const { root } = await cdp.send('DOM.getDocument'); const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '#invite-name' });
  await cdp.send('CSS.forcePseudoState', { nodeId: nodeIds[0], forcedPseudoClasses: ['autofill'] });
  await expect(name).toHaveCSS('background-clip', 'text'); await expect(name).toHaveCSS('box-shadow', 'none'); await cdp.detach();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  for (const control of await page.locator('button:visible,input:not([type=checkbox]):not([type=radio]):visible,select:visible,label.team-check:visible').all()) expect((await control.boundingBox())?.height).toBeGreaterThanOrEqual(44);
});

test('aceite só revela senha após verificação do servidor e restaura conferência no reload', async ({ page }) => {
  await session(page, ['foundation.access']);
  let verified = false;
  let passwordChanged = false;
  await page.route(`**/api/team/invitations/${invitation}/state`, route => route.fulfill({ json: { data: { id: invitation, office_name: 'Escritório de Teste', verified, has_password: false, verified_until: verified ? new Date(Date.now() + 900_000).toISOString() : null } } }));
  await page.route(`**/api/team/invitations/${invitation}/verify`, route => {
    expect(route.request().postDataJSON()).toEqual({ full_name: 'Ana Maria de Souza', cpf: '52998224725', role_code: 'employee' });
    verified = true; return route.fulfill({ json: { data: { verified: true, has_password: false } } });
  });
  await page.route('https://team-ui.supabase.co/auth/v1/user', route => { passwordChanged = true; return route.fulfill({ json: { id: user, aud: 'authenticated', app_metadata: {}, user_metadata: {} } }); });
  await page.route(`**/api/team/invitations/${invitation}/accept`, route => {
    expect(route.request().postDataJSON()).toEqual({}); expect(passwordChanged).toBe(true);
    return route.fulfill({ json: { data: { office_id: office, role_code: 'employee' } } });
  });
  await page.goto(`/convite?id=${invitation}`);
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveCount(0);
  await page.getByLabel('Nome completo', { exact: true }).fill('Ana Maria de Souza'); await page.getByLabel('CPF', { exact: true }).fill('52998224725');
  await page.getByRole('button', { name: 'Conferir dados' }).click();
  await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();
  await page.reload(); await expect(page.getByLabel('Nova senha', { exact: true })).toBeVisible();
  await page.getByLabel('Nova senha', { exact: true }).fill('Senha-local-123!'); await page.getByLabel('Confirmar nova senha').fill('Senha-local-123!');
  await page.getByRole('button', { name: 'Aceitar convite e entrar' }).click();
  await expect(page).toHaveURL(/\/painel$/);
});

test('convite com sessão revogada oferece login com UUID e recusa convite indisponível genericamente', async ({ page }) => {
  await session(page);
  await page.route(`**/api/team/invitations/${invitation}/state`, route => route.fulfill({ status: 401, json: { error: { code: 'AUTH_REQUIRED' } } }));
  await page.goto(`/convite?id=${invitation}`);
  await expect(page.getByRole('alert')).toContainText('sessão está ausente, expirou ou foi encerrada');
  await expect(page.getByRole('link', { name: 'Entrar para continuar' })).toHaveAttribute('href', `/login?invite=${invitation}`);
  await page.route(`**/api/team/invitations/${invitation}/state`, route => route.fulfill({ status: 410, json: { error: { code: 'INVITE_UNAVAILABLE' } } }));
  await page.reload(); await expect(page.getByRole('alert')).toContainText('Este convite não está disponível');
  await expect(page.getByLabel('Nova senha', { exact: true })).toHaveCount(0);
});

test('alterar acesso não promove funcionário para proprietário; criação exige convite', async ({ page }) => {
  await session(page); await dashboard(page); await page.goto('/equipe');
  await page.getByRole('button', { name: 'Editar acesso de Pessoa da Equipe 3', exact: true }).click();
  const role = page.getByRole('combobox', { name: 'Função', exact: true });
  await expect(role.locator('option[value=owner]')).toHaveCount(0);
  await expect(role.locator('option[value=admin]')).toHaveCount(1);
});

test('reativar conta com permissões efetivas vazias envia o acesso básico obrigatório', async ({ page }) => {
  await session(page);
  const data = roster();
  if (data.kind !== 'members') throw new Error('Expected member roster fixture');
  const member = data.items[2];
  member.active = false;
  member.access_active = false;
  member.permissions = [];
  await dashboard(page, data);
  await page.route(`**/api/team/members/${member.id}`, route => route.fulfill({ json: { data: { ok: true } } }));
  await page.goto('/equipe');
  await page.getByRole('button', { name: `Editar acesso de ${member.name}`, exact: true }).click();
  await expect(page.getByRole('checkbox', { name: 'Acesso básico Obrigatório', exact: true })).toBeChecked();
  await page.getByLabel('Conta ativa neste escritório').check();
  const [request] = await Promise.all([
    page.waitForRequest(request => request.method() === 'PATCH' && new URL(request.url()).pathname === `/api/team/members/${member.id}`),
    page.getByRole('button', { name: 'Salvar acesso', exact: true }).click(),
  ]);
  expect(request.postDataJSON()).toEqual({ office_id: office, role_code: 'employee', active: true, permissions: ['foundation.access'] });
});
