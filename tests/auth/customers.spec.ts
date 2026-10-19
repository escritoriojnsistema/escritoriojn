import { expect, test, type Page } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import type { CustomerDetail, CustomerInput, CustomerPage } from '../../shared/customers';

// Real GoTrue, PostgREST and SQL in the disposable loopback-only laboratory.
const url = process.env.AUTH_LAB_URL!;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const office = process.env.AUTH_LAB_OFFICE!;
const otherOffice = process.env.AUTH_LAB_OTHER_OFFICE!;
const password = process.env.AUTH_LAB_PASSWORD!;

async function login(page: Page, name = 'manager', client = false) {
  await page.goto(client ? '/login-cliente' : '/login');
  await page.getByLabel('E-mail', { exact: true }).fill(`${name}@example.test`);
  await page.getByLabel('Senha', { exact: true }).fill(password);
  await page.getByRole('button', { name: client ? 'Entrar na área do cliente' : 'Entrar na área da equipe' }).click();
  await expect(page.getByRole('heading', { name: 'Área de operação', exact: true })).toBeVisible();
}
async function sdkFor(name: string) {
  const sdk = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await sdk.auth.signInWithPassword({ email: `${name}@example.test`, password });
  expect(error).toBeNull();
  return sdk;
}
async function headersFor(sdk: Awaited<ReturnType<typeof sdkFor>>) {
  const { data } = await sdk.auth.getSession();
  expect(data.session).not.toBeNull();
  return { Authorization: `Bearer ${data.session!.access_token}` };
}

test('Auth real 360px: cria Maria sem CPF, pesquisa, confere, edita e recusa duplicado', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 360, height: 640 });
  await login(page);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await page.getByRole('dialog', { name: 'Menu de navegação' }).getByRole('link', { name: 'Clientes', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Clientes', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Tipo de pessoa', exact: true })).toHaveValue('person');
  await expect(page.getByLabel('CPF (opcional)', { exact: true })).toHaveValue('');
  await page.getByLabel('Nome completo', { exact: true }).fill('Maria de Teste');
  await page.getByRole('button', { name: 'Adicionar contato', exact: true }).click();
  await page.getByLabel('Contato 1', { exact: true }).fill('MARIA.LOCAL@EXAMPLE.TEST');
  await page.getByRole('button', { name: 'Adicionar contato', exact: true }).click();
  await page.getByRole('combobox', { name: 'Tipo do contato 2', exact: true }).selectOption('phone');
  await page.getByLabel('Contato 2', { exact: true }).fill('(11) 99999-1234');
  const createdResponse = page.waitForResponse(response => response.url().endsWith('/api/customers') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click();
  const created = await createdResponse;
  expect(created.status()).toBe(201);
  expect(created.headers()['cache-control']).toContain('no-store');
  const initial = (await created.json()).data as CustomerDetail;
  expect(initial).toMatchObject({ name: 'Maria de Teste', identifier: null, version: 1, contacts: [{ kind: 'email', value: 'maria.local@example.test' }, { kind: 'phone', value: '11999991234' }] });
  await expect(page.getByRole('status')).toContainText('Cliente cadastrado.');
  await expect(page.getByRole('region', { name: 'Dados da ficha' })).toContainText('Não informado');
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  await page.getByLabel('Buscar por nome, CPF ou CNPJ', { exact: true }).fill('Maria de Teste');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toContainText('Sem identificador');
  const detailResponse = page.waitForResponse(response => response.url().endsWith(`/api/customers/${initial.id}/detail`));
  await page.getByRole('button', { name: 'Ver ficha de Maria de Teste', exact: true }).click();
  expect((await detailResponse).status()).toBe(200);
  await expect(page.getByRole('region', { name: 'Dados da ficha' })).toContainText('maria.local@example.test');
  await page.getByRole('button', { name: 'Editar cliente', exact: true }).click();
  await page.getByLabel('CPF (opcional)', { exact: true }).pressSequentially('52998224725');
  await expect(page.getByLabel('CPF (opcional)', { exact: true })).toHaveValue('529.982.247-25');
  await page.getByLabel('Contato 2', { exact: true }).fill('1133334444');
  const updatedResponse = page.waitForResponse(response => response.url().endsWith(`/api/customers/${initial.id}`) && response.request().method() === 'PATCH');
  await page.getByRole('button', { name: 'Salvar alterações', exact: true }).click();
  const updated = await updatedResponse;
  expect(updated.status()).toBe(200);
  expect((await updated.json()).data).toMatchObject({ id: initial.id, identifier: '52998224725', version: 2, contacts: [{ kind: 'email', value: 'maria.local@example.test' }, { kind: 'phone', value: '1133334444' }] });
  await expect(page.getByRole('status')).toContainText('Ficha atualizada.');
  await page.getByRole('button', { name: 'Voltar à lista', exact: true }).click();
  await page.getByLabel('Buscar por nome, CPF ou CNPJ', { exact: true }).fill('529.982.247-25');
  const searchedResponse = page.waitForResponse(response => response.url().endsWith('/api/customers/search') && response.request().postDataJSON().query === '529.982.247-25');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  const searched = await searchedResponse;
  expect(searched.request().method()).toBe('POST');
  expect(searched.request().postDataJSON()).toMatchObject({ office_id: office, query: '529.982.247-25', page: 1, size: 3 });
  const candidates = (await searched.json()).data as CustomerPage;
  expect(candidates.total).toBe(1);
  expect(candidates.items[0]).toMatchObject({ id: initial.id, identifier_masked: '***.***.***-25' });
  expect(Object.keys(candidates.items[0]).sort()).toEqual(['created_at', 'id', 'identifier_masked', 'kind', 'name']);
  expect(JSON.stringify(candidates)).not.toMatch(/52998224725|529\.982\.247-25|maria\.local@example\.test|1133334444/);
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toContainText('***.***.***-25');
  expect(new URL(page.url()).search).toBe('');
  await page.getByRole('button', { name: 'Novo cliente', exact: true }).click();
  await page.getByLabel('Nome completo', { exact: true }).fill('Maria Duplicada de Teste');
  await page.getByLabel('CPF (opcional)', { exact: true }).fill('52998224725');
  const duplicatedResponse = page.waitForResponse(response => response.url().endsWith('/api/customers') && response.request().method() === 'POST');
  await page.getByRole('button', { name: 'Criar cliente', exact: true }).click();
  expect((await duplicatedResponse).status()).toBe(409);
  await expect(page.getByRole('alert')).toContainText('Este CPF ou CNPJ já está cadastrado neste escritório.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('JWTs reais: API e RPC isolam escritórios, cliente e fichas de outro criador', async ({ request }) => {
  test.setTimeout(60_000);
  const sdks = [] as Awaited<ReturnType<typeof sdkFor>>[];
  try {
    for (const name of ['manager', 'customerworker', 'portalclient', 'other', 'worker']) sdks.push(await sdkFor(name));
    const [owner, worker, client, other, ungranted] = sdks;
    const ownerHeaders = await headersFor(owner), workerHeaders = await headersFor(worker), clientHeaders = await headersFor(client), otherHeaders = await headersFor(other);
    const search = { office_id: office, query: '', page: 1, size: 5 };
    const ownerInput: CustomerInput = { kind: 'person', name: 'Escopo Owner Local', identifier: '11144477735', contacts: [{ kind: 'email', value: 'owner.customer@example.test' }] };
    expect((await request.post('/api/customers/search', { data: search })).status()).toBe(401);
    const context = await request.get('/api/auth/context', { headers: workerHeaders });
    const workerContext = (await context.json()).data.contexts.find((item: { office_id: string }) => item.office_id === office);
    expect(workerContext.permissions).toEqual(expect.arrayContaining(['customers.read', 'customers.create', 'customers.update']));
    expect(workerContext.permissions).not.toContain('customers.read_all');
    const created = await request.post('/api/customers', { headers: ownerHeaders, data: { office_id: office, customer: ownerInput } });
    expect(created.status()).toBe(201);
    const ownerRecord = (await created.json()).data as CustomerDetail;
    const { data: otherRecord, error: otherCreate } = await other.rpc('customer_create', { p_office_id: otherOffice, p_customer: { ...ownerInput, name: 'Escopo Escritório B' }, p_request_id: crypto.randomUUID() });
    expect(otherCreate).toBeNull();
    expect(otherRecord.id).not.toBe(ownerRecord.id);
    for (const [sdk, target] of [[owner, otherOffice], [other, office], [worker, otherOffice]] as const) {
      expect((await request.post('/api/customers/search', { headers: await headersFor(sdk), data: { ...search, office_id: target } })).status()).toBe(403);
      expect((await sdk.rpc('customers_page', { p_office_id: target, p_query: '', p_page: 1, p_size: 5 })).error?.code).toBe('PT403');
    }
    expect((await request.post(`/api/customers/${ownerRecord.id}/detail`, { headers: otherHeaders, data: { office_id: otherOffice } })).status()).toBe(404);
    expect((await other.rpc('customer_detail', { p_office_id: otherOffice, p_customer_id: ownerRecord.id })).error?.code).toBe('PT404');
    for (const sdk of [client, ungranted]) {
      expect((await request.post('/api/customers/search', { headers: await headersFor(sdk), data: search })).status()).toBe(403);
      expect((await sdk.rpc('customers_page', { p_office_id: office, p_query: '', p_page: 1, p_size: 5 })).error?.code).toBe('PT403');
    }
    expect((await request.post('/api/customers', { headers: clientHeaders, data: { office_id: office, customer: ownerInput } })).status()).toBe(403);
    expect((await client.rpc('customer_create', { p_office_id: office, p_customer: ownerInput, p_request_id: crypto.randomUUID() })).error?.code).toBe('PT403');
    for (const table of ['customers', 'customer_contacts']) expect((await owner.from(table).select('*')).error?.code).toBe('42501');
    const invisible = await request.post('/api/customers/search', { headers: workerHeaders, data: { ...search, query: ownerInput.name } });
    expect(invisible.status()).toBe(200);
    expect((await invisible.json()).data).toMatchObject({ items: [], total: 0 });
    const { data: rpcInvisible, error: rpcRead } = await worker.rpc('customers_page', { p_office_id: office, p_query: ownerInput.name, p_page: 1, p_size: 5 });
    expect(rpcRead).toBeNull();
    expect(rpcInvisible).toMatchObject({ items: [], total: 0 });
    expect((await request.post(`/api/customers/${ownerRecord.id}/detail`, { headers: workerHeaders, data: { office_id: office } })).status()).toBe(404);
    expect((await worker.rpc('customer_detail', { p_office_id: office, p_customer_id: ownerRecord.id })).error?.code).toBe('PT404');
    expect((await request.patch(`/api/customers/${ownerRecord.id}`, { headers: workerHeaders, data: { office_id: office, customer: ownerInput, version: 1 } })).status()).toBe(404);
    expect((await worker.rpc('customer_update', { p_office_id: office, p_customer_id: ownerRecord.id, p_customer: ownerInput, p_version: 1, p_request_id: crypto.randomUUID() })).error?.code).toBe('PT404');
    const workerInput: CustomerInput = { kind: 'person', name: 'Ficha do Funcionário Local', identifier: '', contacts: [] };
    const ownCreated = await request.post('/api/customers', { headers: workerHeaders, data: { office_id: office, customer: workerInput } });
    expect(ownCreated.status()).toBe(201);
    const ownRecord = (await ownCreated.json()).data as CustomerDetail;
    const { data: ownDetail, error: ownRead } = await worker.rpc('customer_detail', { p_office_id: office, p_customer_id: ownRecord.id });
    expect(ownRead).toBeNull();
    expect(ownDetail).toMatchObject({ id: ownRecord.id, version: 1, can_update: true, identifier: null });
    const ownUpdated = { ...workerInput, name: 'Ficha do Funcionário Editada', contacts: [{ kind: 'phone', value: '1133334444' }] };
    const { data: updated, error: updateError } = await worker.rpc('customer_update', { p_office_id: office, p_customer_id: ownRecord.id, p_customer: ownUpdated, p_version: 1, p_request_id: crypto.randomUUID() });
    expect(updateError).toBeNull();
    expect(updated).toMatchObject({ name: ownUpdated.name, version: 2, contacts: ownUpdated.contacts });
    const persisted = await request.post(`/api/customers/${ownRecord.id}/detail`, { headers: workerHeaders, data: { office_id: office } });
    expect(persisted.status()).toBe(200);
    expect((await persisted.json()).data).toMatchObject({ id: ownRecord.id, name: ownUpdated.name, version: 2 });
    const onlyOwn = await request.post('/api/customers/search', { headers: workerHeaders, data: search });
    expect((await onlyOwn.json()).data).toMatchObject({ total: 1, items: [{ id: ownRecord.id, name: ownUpdated.name }] });
    const stale = await request.patch(`/api/customers/${ownRecord.id}`, { headers: workerHeaders, data: { office_id: office, customer: workerInput, version: 1 } });
    expect(stale.status()).toBe(409);
    expect((await stale.json()).error.code).toBe('CUSTOMER_CONFLICT');
    const duplicate = await request.post('/api/customers', { headers: ownerHeaders, data: { office_id: office, customer: ownerInput } });
    expect(duplicate.status()).toBe(409);
    expect((await duplicate.json()).error.code).toBe('CUSTOMER_DUPLICATE');
    expect((await owner.rpc('customer_create', { p_office_id: office, p_customer: { ...ownerInput, identifier: '11111111111' }, p_request_id: crypto.randomUUID() })).error?.code).toBe('PT422');
    const { data: original, error: originalError } = await owner.rpc('customer_detail', { p_office_id: office, p_customer_id: ownerRecord.id });
    expect(originalError).toBeNull();
    expect(original).toMatchObject({ name: ownerInput.name, version: 1, contacts: ownerInput.contacts });
  } finally {
    for (const sdk of sdks) { await sdk.auth.signOut({ scope: 'local' }); await sdk.auth.dispose(); }
  }
});

test('cliente Auth real não recebe menu nem formulário de clientes pelo link direto', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await login(page, 'portalclient', true);
  await page.getByRole('button', { name: 'Abrir menu' }).click();
  await expect(page.getByRole('dialog', { name: 'Menu de navegação' }).getByRole('link', { name: 'Clientes', exact: true })).toHaveCount(0);
  await page.goto('/clientes');
  await expect(page.getByRole('heading', { name: 'Acesso não autorizado', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Novo cliente', exact: true })).toHaveCount(0);
  await expect(page.getByRole('list', { name: 'Clientes do escritório' })).toHaveCount(0);
});
