import { test, expect, type Page } from '@playwright/test';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Local UI contract.');

const user = '22222222-2222-4222-8222-222222222222';
const office = '11111111-1111-4111-8111-111111111111';

async function prepare(page: Page, role: string, permissions: string[]) {
  const token = `e30.${Buffer.from(
    JSON.stringify({
      sub: user,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      session_id: office,
    }),
  ).toString('base64url')}.fixture`;
  await page.addInitScript(
    ({ token, user }) =>
      localStorage.setItem(
        'sb-team-ui-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} },
        }),
      ),
    { token, user },
  );
  await page.route('https://team-ui.supabase.co/**', route =>
    route.fulfill({ json: { id: user, aud: 'authenticated' } }),
  );
  await page.route('**/api/auth/context', route =>
    route.fulfill({
      json: {
        data: {
          user: { id: user },
          contexts: [
            {
              office_id: office,
              user_id: user,
              role_code: role,
              permissions: role === 'client' ? [] : ['foundation.access', ...permissions],
              office_name: 'Escritório JN',
              display_name: 'Usuário Teste',
            },
          ],
        },
      },
    }),
  );
  await page.route('**/api/auth/activity', route =>
    route.fulfill({
      json: {
        data: {
          user_id: user,
          session_id: office,
          idle_minutes: 30,
          server_time: new Date().toISOString(),
          expires_at: new Date(Date.now() + 1800000).toISOString(),
        },
      },
    }),
  );
  await page.route('**/api/notifications/summary', route =>
    route.fulfill({ json: { data: { unread: 2 } } }),
  );
  await page.route('**/api/document-commercial/presence', route =>
    route.fulfill({
      json: {
        data: {
          status: 'available',
          capacity: 2,
          last_seen: new Date().toISOString(),
          session_current: true,
        },
      },
    }),
  );
}

test('Super administrador vê Caixa geral consolidado no Desktop e Mobile sem overflow', async ({ page }) => {
  await prepare(page, 'owner', [
    'cash.read',
    'cash.read_all',
    'requests.read',
    'requests.read_all',
    'files.read',
    'customers.read',
    'users.manage',
  ]);
  const scopes: string[] = [];
  await page.route('**/api/cash/dashboard-filtered', route => {
    const body = route.request().postDataJSON() as { scope: string };
    scopes.push(body.scope);
    return route.fulfill({
      json: {
        data: {
          sessions: [],
          total: 4,
          page: 1,
          page_size: 3,
          scope: body.scope,
          can_open: true,
          can_manage: true,
          can_read_all: true,
          summary: {
            open: 2,
            closed: 2,
            numerario_cents: 150_000,
            received_cents: 425_050,
          },
        },
      },
    });
  });
  await page.route('**/api/requests/home-counts', route =>
    route.fulfill({
      json: {
        data: {
          aberto: 0,
          em_atendimento: 1,
          aguardando_cliente: 0,
          aguardando_responsavel: 2,
          concluido: 1,
          cancelado: 0,
        },
      },
    }),
  );
  await page.route('**/api/customers/search', route =>
    route.fulfill({ json: { data: { items: [], total: 2, page: 1, page_size: 3 } } }),
  );

  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/painel');
    await expect(page.getByRole('link', { name: /Caixa geral/ })).toBeVisible();
    await expect(page.getByText('2 caixas abertos')).toBeVisible();
    await expect(page.getByText(/R\$\s*1\.500,00/)).toBeVisible();
    await expect(page.getByText(/R\$\s*4\.250,50/)).toBeVisible();
    await expect(page.getByRole('link', { name: /Solicitações/ }).first()).toBeVisible();
    await expect(page.getByText('2 clientes disponíveis')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  expect(scopes.every(s => s === 'all')).toBe(true);
});

test('Funcionário com caixa individual vê Meu caixa (scope own) e sem caixa não consulta API de caixa', async ({ page }) => {
  await prepare(page, 'employee', ['cash.read', 'requests.read', 'files.read']);
  const scopes: string[] = [];
  await page.route('**/api/cash/dashboard-filtered', route => {
    const body = route.request().postDataJSON() as { scope: string };
    scopes.push(body.scope);
    return route.fulfill({
      json: {
        data: {
          sessions: [
            {
              id: '33333333-3333-4333-8333-333333333333',
              unit_id: '44444444-4444-4444-8444-444444444444',
              unit_name: 'Unidade Sede',
              cash_account_id: '55555555-5555-4555-8555-555555555555',
              account_name: 'Caixa Balcão',
              operator_name: 'Usuário Teste',
              is_self: true,
              status: 'open',
              opened_at: new Date().toISOString(),
              opening_cents: 10_000,
              numerario_cents: 35_000,
              received_cents: 80_000,
            },
          ],
          total: 1,
          page: 1,
          page_size: 3,
          scope: 'own',
          can_open: true,
          can_manage: false,
          can_read_all: false,
          summary: { open: 1, closed: 0, numerario_cents: 35_000, received_cents: 80_000 },
        },
      },
    });
  });
  await page.route('**/api/requests/home-counts', route =>
    route.fulfill({ json: { data: { em_atendimento: 2 } } }),
  );

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/painel');
  await expect(page.getByRole('link', { name: /Meu caixa/ })).toBeVisible();
  await expect(page.getByText('Caixa aberto')).toBeVisible();
  await expect(page.getByText('Unidade Sede')).toBeVisible();
  expect(scopes).toEqual(['own']);
});

test('Funcionário somente com cobranças vê Cobranças e caixa sem disparar dashboard de caixa', async ({ page }) => {
  await prepare(page, 'employee', ['requests.read', 'charges.read']);
  let cashDashboardCalls = 0;
  await page.route('**/api/cash/dashboard-filtered', route => {
    cashDashboardCalls++;
    return route.fulfill({ status: 403, json: { error: { code: 'CASH_FORBIDDEN' } } });
  });
  await page.route('**/api/requests/home-counts', route =>
    route.fulfill({ json: { data: { aberto: 1 } } }),
  );

  await page.goto('/painel');
  await expect(page.getByRole('link', { name: /Cobranças e caixa/ })).toBeVisible();
  expect(cashDashboardCalls).toBe(0);
});

test('Cliente vê Meus pagamentos adaptado no Desktop e Mobile sem overflow', async ({ page }) => {
  await prepare(page, 'client', []);
  await page.route('**/api/cash/client-finance', route =>
    route.fulfill({
      json: {
        data: {
          items: [],
          total: 2,
          page: 1,
          page_size: 5,
          summary: {
            due_cents: 90_000,
            paid_cents: 40_000,
            balance_cents: 50_000,
          },
          history: [],
          history_total: 1,
          history_page: 1,
        },
      },
    }),
  );
  await page.route('**/api/requests/home-counts', route =>
    route.fulfill({ json: { data: { recebido: 1, concluido: 1 } } }),
  );

  for (const width of [1440, 360]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/area-cliente');
    await expect(page.getByRole('link', { name: /Meus pagamentos/ }).first()).toBeVisible();
    await expect(page.getByText('Saldo em aberto')).toBeVisible();
    await expect(page.getByText(/R\$\s*500,00/)).toBeVisible();
    await expect(page.getByText(/R\$\s*400,00/)).toBeVisible();
    await expect(page.getByText('2 cobranças')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
