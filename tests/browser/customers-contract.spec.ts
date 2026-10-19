import { test, expect, type Page } from '@playwright/test';
import type { CustomerDetail, CustomerInput } from '../../shared/customers';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Fictitious UI contract, not proof of hosted Auth or database.');
const office = '11111111-1111-4111-8111-111111111111';
const otherOffice = '99999999-9999-4999-8999-999999999999';
const user = '22222222-2222-4222-8222-222222222222';
const customerId = '33333333-3333-4333-8333-333333333333';
const capabilities = ['foundation.access', 'customers.read', 'customers.create', 'customers.update', 'customers.read_all', 'users.manage', 'audit.read', 'archives.manage'];
const customer: CustomerDetail = { id: customerId, kind: 'person', name: 'Pessoa Fictícia', identifier: '52998224725', identifier_masked: '***.***.***-25', contacts: [{ kind: 'email', value: 'cliente@example.test' }], created_at: '2026-10-19T10:00:00Z', version: 1, can_update: true };
async function setup(page: Page, permissions = capabilities, role = 'owner', multiple = false) {
  const token = `e30.${Buffer.from(JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: office })).toString('base64url')}.fixture`;
  await page.addInitScript(({ token, user }) => localStorage.setItem('sb-team-ui-auth-token', JSON.stringify({ access_token: token, refresh_token: 'fixture', token_type: 'bearer', expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } })), { token, user });
  await page.route('https://team-ui.supabase.co/**', r => r.fulfill({ json: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} } }));
  await page.route('**/api/auth/context', r => r.fulfill({ json: { data: { user: { id: user }, contexts: [office, ...(multiple ? [otherOffice] : [])].map((id, i) => ({ office_id: id, user_id: user, role_code: role, permissions, office_name: i ? 'Outro Escritório' : 'Escritório Fictício', display_name: 'Pessoa Fictícia' })) } } }));
  await page.route('**/api/customers**', route => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const url = new URL(route.request().url());
    expect(url.search).toBe('');
    const body = route.request().postDataJSON();
    if (url.pathname.endsWith('/search')) {
      expect(route.request().method()).toBe('POST');
      const items = Array.from({ length: body.page === 1 ? body.size : 1 }, (_, i) => ({ id: i ? `44444444-4444-4444-8444-44444444444${i}` : customerId, kind: 'person', name: body.office_id === otherOffice ? `Outro Cliente ${i + 1}` : `Pessoa Fictícia ${i + 1}`, identifier_masked: '***.***.***-25', created_at: customer.created_at }));
      return route.fulfill({ json: { data: { items, total: 6, page: body.page, page_size: body.size } } });
    }
    if (url.pathname.endsWith('/detail')) return route.fulfill({ json: { data: customer } });
    const input = body.customer as CustomerInput;
    return route.fulfill({ json: { data: { ...customer, ...input, version: route.request().method() === 'PATCH' ? 2 : 1 } } });
  });
}
async function noOverflow(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true); }
test('painel com Clientes mantém atalhos principais em uma tela desde 320px', async ({ page }) => {
  await setup(page); await page.goto('/painel');
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
  for (const [width,height] of [[320,568],[360,640],[768,1024],[1440,900]]) {
    await page.setViewportSize({width,height});
    const metrics=await page.evaluate(() => ({width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight}));
    expect(metrics.scrollHeight,JSON.stringify(metrics)).toBeLessThanOrEqual(height+1);
    expect(metrics.scrollWidth).toBeLessThanOrEqual(width);
  }
  await expect(page.getByRole('link', {name:'Clientes Cadastro e busca de fichas do escritório'})).toBeVisible();
});
async function capture(page: Page, label: string, width: number) {
  await noOverflow(page);
  const dimensions = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight }));
  expect(dimensions.width).toBe(width);
  expect(await page.locator('.customers-main button:visible, .customers-main input:visible, .customers-main select:visible').evaluateAll(elements => elements.every(element => { const rect = element.getBoundingClientRect(); return rect.width >= 44 && rect.height >= 44; }))).toBe(true);
  if (process.env.TEAM_UI_CAPTURE) {
    await page.screenshot({ path: `/workspace/shared/etapa-07-${label}-${width}.png`, fullPage: true });
    await test.info().attach(`dimensions-${label}-${width}`, { body: JSON.stringify(dimensions), contentType: 'application/json' });
  }
}
for (const width of [360, 1440]) test(`clientes: lista, busca privada, paginação e ficha em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 360 ? 640 : 900 }); await setup(page); await page.goto('/clientes');
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  const list = page.getByRole('list', { name: 'Clientes do escritório' });
  await expect(list.locator('li')).toHaveCount(width === 360 ? 3 : 5);
  await expect(list).toContainText('***.***.***-25'); await expect(list).not.toContainText('52998224725');
  await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
  if (width === 360) {
    const nav = page.getByRole('navigation', { name: 'Atalhos do aplicativo' });
    const createIcon = await page.getByRole('button', { name: 'Novo cliente', exact: true }).locator('svg').boundingBox();
    expect(createIcon?.width).toBeGreaterThanOrEqual(18);
    expect(createIcon?.height).toBeGreaterThanOrEqual(18);
    await expect(nav.getByRole('link')).toHaveCount(4);
    await expect(nav.getByRole('link').nth(1)).toHaveText('Clientes');
    await expect(nav.getByRole('link', { name: 'Conta', exact: true })).toBeVisible();
  }
  await capture(page, 'lista', width);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  await page.getByLabel('Buscar por nome, CPF ou CNPJ').fill('52998224725');
  const searched = page.waitForRequest(r => r.url().endsWith('/api/customers/search') && r.postDataJSON().query === '52998224725');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click(); await searched;
  expect(page.url()).not.toContain('52998224725');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click(); await expect(page.getByText(/Página 2/)).toBeVisible();
  await page.getByRole('button', { name: /Ver ficha de/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Ficha do cliente', exact: true })).toBeVisible();
  await expect(page.getByText('529.982.247-25', { exact: true })).toBeVisible();
  await expect(list).toHaveCount(0); await capture(page, 'ficha', width);
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click(); await expect(list).toBeVisible();
});
for (const width of [360, 1440]) test(`clientes: criar, validar CPF/contato, duplicidade e editar em ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 360 ? 640 : 900 }); await setup(page); await page.goto('/clientes');
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Novo cliente', exact: true })).toBeVisible();
  await page.getByLabel('Nome completo').fill('Cliente de Teste');
  const cpf = page.getByLabel('CPF (opcional)'); await cpf.fill('52998224724'); await expect(cpf).toHaveValue('529.982.247-24');
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('CPF inválido');
  await cpf.fill('52998224725');
  await page.getByRole('button', { name: 'Adicionar contato', exact: true }).click();
  await page.getByLabel('Contato 1', { exact: true }).fill('invalido');
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('e-mail válido');
  await page.getByLabel('Contato 1', { exact: true }).fill('cliente@example.test');
  if (width === 360) { await cpf.focus(); await expect(cpf).toHaveCSS('font-size', '16px'); await expect(cpf).toHaveCSS('box-shadow', 'none'); }
  await capture(page, 'formulario', width);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1)).toBe(true);
  let duplicate = true;
  await page.route('**/api/customers', route => {
    const data = route.request().postDataJSON(); expect(data.office_id).toBe(office); expect(data.customer.identifier).toBe('52998224725');
    return route.fulfill(duplicate ? { status: 409, json: { error: { code: 'CUSTOMER_DUPLICATE' } } } : { json: { data: { ...customer, ...data.customer } } });
  });
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('já está cadastrado');
  await expect(cpf).toHaveValue('529.982.247-25'); duplicate = false;
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Ficha do cliente', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await page.getByLabel('Nome completo').fill('Nome atualizado');
  const updated = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith(`/api/customers/${customerId}`));
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click(); expect((await updated).postDataJSON().version).toBe(1);
  await expect(page.getByText('Nome atualizado', { exact: true })).toBeVisible(); await noOverflow(page);
});
test('leitura sem criar ou alterar mantém a ficha somente para consulta', async ({ page }) => {
  await setup(page, ['foundation.access', 'customers.read'], 'employee'); await page.goto('/clientes');
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo cliente', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: /Ver ficha de/ }).first().click();
  await expect(page.getByRole('heading', { name: 'Ficha do cliente', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Editar cliente', exact: true })).toHaveCount(0);
});
for (const permission of ['customers.create', 'customers.update', 'customers.read_all']) test(`${permission} exige leitura para entrar no módulo`, async ({ page }) => {
  await setup(page, ['foundation.access', permission], 'employee'); await page.goto('/painel');
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0);
  await page.goto('/clientes'); await expect(page.getByRole('heading', { name: 'Acesso não autorizado', exact: true })).toBeVisible();
});
for (const role of ['employee', 'client']) test(`sem autorização ${role} não entra em clientes`, async ({ page }) => {
  await setup(page, role === 'client' ? capabilities : ['foundation.access'], role); await page.goto(role === 'client' ? '/area-cliente' : '/painel');
  await expect(page.getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0);
  await page.goto('/clientes'); await expect(page.getByRole('heading', { name: 'Acesso não autorizado', exact: true })).toBeVisible();
});
test('consulta tardia não reaparece após mudar escritório ou voltar da ficha', async ({ page }) => {
  await setup(page, capabilities, 'owner', true); await page.goto('/clientes');
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  let release!: () => void; const held = new Promise<void>(r => { release = r; });
  await page.route(`**/api/customers/${customerId}/detail`, async route => { await held; try { await route.fulfill({ json: { data: customer } }); } catch { /* Expected cancellation. */ } });
  const requested = page.waitForRequest(`**/api/customers/${customerId}/detail`);
  await page.getByRole('button', { name: /Ver ficha de/ }).first().click(); await requested;
  await page.getByRole('combobox', { name: 'Escritório', exact: true }).selectOption(otherOffice);
  await expect(page.getByText('Outro Cliente 1', { exact: true })).toBeVisible(); release();
  await expect(page.getByRole('heading', { name: 'Ficha do cliente', exact: true })).toHaveCount(0);
  await expect(page.getByText('529.982.247-25', { exact: true })).toHaveCount(0);
  await noOverflow(page);
});

test('pessoa jurídica opcional valida CNPJ e limita a quatro contatos sem repetição', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 }); await setup(page); await page.goto('/clientes');
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Tipo de pessoa').selectOption('company'); await page.getByLabel('Razão social').fill('Empresa Fictícia');
  await page.getByLabel('CNPJ (opcional)').fill('11222333000180'); await expect(page.getByLabel('CNPJ (opcional)')).toHaveValue('11.222.333/0001-80');
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('CNPJ inválido');
  await page.getByLabel('CNPJ (opcional)').fill('11222333000181');
  for (let index = 1; index <= 4; index++) {
    await page.getByRole('button', { name: 'Adicionar contato', exact: true }).click();
    await page.getByLabel(`Contato ${index}`, { exact: true }).fill(index < 3 ? 'Mesmo@Example.test' : `pessoa${index}@example.test`);
  }
  await expect(page.getByRole('button', { name: 'Adicionar contato', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('contatos repetidos');
  await page.getByRole('combobox', { name: 'Tipo do contato 2', exact: true }).selectOption('phone'); await page.getByLabel('Contato 2', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('telefone válido');
  await page.getByLabel('Contato 2', { exact: true }).fill('5511999991234');
  const request = page.waitForRequest(r => r.url().endsWith('/api/customers'));
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click();
  expect((await request).postDataJSON().customer).toEqual({ kind: 'company', name: 'Empresa Fictícia', identifier: '11222333000181', contacts: [{ kind: 'email', value: 'mesmo@example.test' }, { kind: 'phone', value: '5511999991234' }, { kind: 'email', value: 'pessoa3@example.test' }, { kind: 'email', value: 'pessoa4@example.test' }] });
  await expect(page.getByRole('heading', { name: 'Ficha do cliente', exact: true })).toBeVisible(); await noOverflow(page);
});
test('sem identificador cria ficha sem preencher documento artificial', async ({ page }) => {
  await setup(page); await page.goto('/clientes'); await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome completo').fill('Pessoa sem documento');
  const request = page.waitForRequest(r => r.url().endsWith('/api/customers'));
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click();
  expect((await request).postDataJSON().customer.identifier).toBe(''); await expect(page.getByText('Não informado', { exact: true })).toBeVisible();
});
for (const destination of ['lista', 'outro escritório']) test(`resultado de cadastro cancelado não troca a tela ao voltar para ${destination}`, async ({ page }) => {
  await setup(page, capabilities, 'owner', true); await page.goto('/clientes'); await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome completo').fill('Cadastro cancelado');
  let release!: () => void, done!: () => void;
  const hold = new Promise<void>(r => { release = r; }), complete = new Promise<void>(r => { done = r; });
  await page.route('**/api/customers', async route => { await hold; try { await route.fulfill({ json: { data: { ...customer, name: 'Cadastro cancelado' } } }); } catch { /* Expected cancellation. */ } finally { done(); } });
  const request = page.waitForRequest(r => r.url().endsWith('/api/customers'));
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click(); await request;
  await expect(page.getByRole('button', { name: 'Criar cliente', exact: true })).toBeDisabled();
  await expect(page.getByText(/Carregando|Salvando|Aguarde/)).toHaveCount(0);
  if (destination === 'lista') await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  else await page.getByRole('combobox', { name: 'Escritório', exact: true }).selectOption(otherOffice);
  release(); await complete;
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Ficha do cliente', exact: true })).toHaveCount(0);
  await expect(page.getByText('Cadastro cancelado', { exact: true })).toHaveCount(0);
});
test('resposta de busca do escritório anterior é descartada', async ({ page }) => {
  await setup(page, capabilities, 'owner', true); await page.goto('/clientes'); await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  let release!: () => void, done!: () => void;
  const hold = new Promise<void>(r => { release = r; }), complete = new Promise<void>(r => { done = r; });
  await page.route('**/api/customers/search', async route => {
    if (route.request().postDataJSON().office_id !== office) return route.fallback();
    await hold; try { await route.fulfill({ json: { data: { items: [{ ...customer, name: 'Resultado anterior' }], total: 1, page: 1, page_size: 5 } } }); } catch { /* Expected cancellation. */ } finally { done(); }
  });
  const request = page.waitForRequest(r => r.url().endsWith('/api/customers/search'));
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click(); await request;
  await page.getByRole('combobox', { name: 'Escritório', exact: true }).selectOption(otherOffice);
  await expect(page.getByText('Outro Cliente 1', { exact: true })).toBeVisible(); release(); await complete;
  await expect(page.getByText('Resultado anterior', { exact: true })).toHaveCount(0);
});
async function rotateSession(page: Page, nextSession = false) {
  return page.evaluate(async nextSession => {
    const modulePath = '/src/features/auth/browser.ts'; const { supabase } = await import(modulePath);
    const { data } = await supabase.auth.getSession(); const parts = data.session.access_token.split('.');
    const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    parts[1] = btoa(JSON.stringify({ ...claims, ...(nextSession ? { session_id: '88888888-8888-4888-8888-888888888888' } : { jti: crypto.randomUUID() }) })).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    return !(await supabase.auth.setSession({ access_token: parts.join('.'), refresh_token: 'rotated-fixture' })).error;
  }, nextSession);
}
test('token renovado na mesma sessão preserva rascunho e aceita consulta pendente', async ({ page }) => {
  await setup(page); await page.goto('/clientes'); await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome completo').fill('Rascunho preservado'); expect(await rotateSession(page)).toBe(true);
  await expect(page.getByLabel('Nome completo')).toHaveValue('Rascunho preservado');
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click(); await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  let release!: () => void; const hold = new Promise<void>(r => { release = r; });
  await page.route('**/api/customers/search', async route => { await hold; await route.fallback(); });
  const requested = page.waitForRequest('**/api/customers/search');
  await page.getByRole('button', { name: 'Próxima', exact: true }).click(); await requested;
  expect(await rotateSession(page)).toBe(true); release();
  await expect(page.getByText(/Página 2/)).toBeVisible(); await expect(page.getByRole('alert')).toHaveCount(0);
});
for (const change of ['logout', 'nova sessão']) test(`API do navegador cancela resposta de clientes após ${change}`, async ({ page }) => {
  await setup(page); await page.goto('/clientes'); await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  let release!: () => void; const hold = new Promise<void>(r => { release = r; });
  await page.route('**/api/customers/search', async route => { await hold; try { await route.fallback(); } catch { /* Expected cancellation. */ } });
  const requested = page.waitForRequest('**/api/customers/search');
  const result = page.evaluate(async office => {
    const modulePath = '/src/features/customers/api.ts'; const { customersApi } = await import(modulePath);
    try { await customersApi.search({ office_id: office, query: '', page: 1, size: 5 }); return 200; } catch (error) { return (error as { status: number }).status; }
  }, office);
  await requested;
  if (change === 'logout') await page.evaluate(async () => { const modulePath = '/src/features/auth/browser.ts'; const { supabase } = await import(modulePath); await supabase.auth.signOut({ scope: 'local' }); });
  else expect(await rotateSession(page, true)).toBe(true);
  release(); expect(await result).toBe(401);
});

test('ficha consultada libera edição e trata conflito sem perder o rascunho', async ({ page }) => {
  await setup(page); await page.goto('/clientes'); await page.getByRole('button', { name: /Ver ficha de/ }).first().click();
  await expect(page.getByText('529.982.247-25', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await expect(page.getByLabel('Nome completo')).toBeEnabled();
  await page.getByLabel('Nome completo').fill('Alteração concorrente');
  await page.route(`**/api/customers/${customerId}`, r => r.fulfill({ status: 409, json: { error: { code: 'CUSTOMER_CONFLICT' } } }));
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('A ficha mudou');
  await expect(page.getByLabel('Nome completo')).toHaveValue('Alteração concorrente');
  await page.getByRole('button', { name: 'Reabrir ficha', exact: true }).click();
  await expect(page.getByText('Pessoa Fictícia', { exact: true })).toBeVisible();
});
test('falha e negação de leitura escondem a lista; detalhe ausente permite voltar', async ({ page }) => {
  await setup(page); await page.goto('/clientes'); await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toBeVisible();
  await page.route(`**/api/customers/${customerId}/detail`, r => r.fulfill({ status: 404, json: { error: { code: 'CUSTOMER_NOT_FOUND' } } }));
  await page.getByRole('button', { name: /Ver ficha de/ }).first().click(); await expect(page.getByRole('alert')).toContainText('Esta ficha não está disponível');
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  await page.route('**/api/customers/search', r => r.fulfill({ status: 503, json: { error: { code: 'CUSTOMERS_UNAVAILABLE' } } }));
  await page.getByRole('button', { name: 'Atualizar lista', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Serviço indisponível');
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toHaveCount(0);
  await page.route('**/api/customers/search', r => r.fulfill({ status: 403, json: { error: { code: 'CUSTOMERS_FORBIDDEN' } } }));
  await page.getByRole('button', { name: 'Tentar novamente', exact: true }).click(); await expect(page.getByRole('alert')).toContainText('Seu acesso não permite');
  await expect(page.getByRole('button', { name: 'Novo cliente', exact: true })).toHaveCount(0);
});
