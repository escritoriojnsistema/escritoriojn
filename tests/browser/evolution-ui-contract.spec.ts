import { test, expect, type Page } from '@playwright/test';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Local fictitious contracts.');

const ART = '.aistudio/artifacts/brain/8f1da76b-bc17-4df7-98c6-a74e231bd390/.tempmediaStorage';
const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const CHARGE_ID = '44444444-4444-4444-8444-444444444444';
const APPROVAL_ID = '55555555-5555-4555-8555-555555555555';

const allPermissions = [
  'foundation.access',
  'settings.access',
  'payments.providers.manage',
  'payments.manual.approve',
  'charges.discount.approve',
  'requests.read',
  'requests.delete',
  'charges.read',
  'cash.read',
  'cash.open',
  'cash.manage',
  'cash.read_all',
];

async function mockAuth(page: Page, role: 'owner' | 'client', permissions = allPermissions) {
  const token = `e30.${Buffer.from(
    JSON.stringify({
      sub: USER_ID,
      exp: Math.floor(Date.now() / 1000) + 3600,
      role: 'authenticated',
      session_id: OFFICE_ID,
    }),
  ).toString('base64url')}.fixture`;

  await page.addInitScript(
    ({ token, user, portal }) => {
      localStorage.setItem(
        'sb-team-ui-auth-token',
        JSON.stringify({
          access_token: token,
          refresh_token: 'fixture',
          token_type: 'bearer',
          expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: user, aud: 'authenticated', email: 'fixture@example.test', app_metadata: {}, user_metadata: {} },
        }),
      );
      localStorage.setItem('jn:portal', JSON.stringify({ portal, revision: 1 }));
    },
    { token, user: USER_ID, portal: role === 'client' ? 'client' : 'team' },
  );

  await page.route('https://team-ui.supabase.co/**', (r) => r.fulfill({ json: { id: USER_ID, aud: 'authenticated' } }));
  await page.route('**/api/auth/context', (r) =>
    r.fulfill({
      json: {
        data: {
          user: { id: USER_ID },
          contexts: [
            {
              office_id: OFFICE_ID,
              user_id: USER_ID,
              office_name: 'Escritório JN',
              display_name: role === 'client' ? 'Cliente Teste' : 'Gestor Teste',
              role_code: role,
              permissions: role === 'client' ? [] : permissions,
            },
          ],
        },
      },
    }),
  );
  await page.route('**/api/notifications/summary', (r) => r.fulfill({ json: { data: { unread: 1 } } }));
  await page.route('**/api/document-commercial/presence', (r) =>
    r.fulfill({ json: { data: { status: 'offline', capacity: 1, last_seen: null, session_current: false } } }),
  );
}

for (const viewport of [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844 },
]) {
  test(`Cenário 21 (${viewport.name}): Bancos e Pagamentos renderiza 5 abas, sem overflow e respeita <= 4 atalhos mobile`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAuth(page, 'owner');
    await page.route('**/api/payment-providers/state', (r) =>
      r.fulfill({
        json: {
          data: {
            office_id: OFFICE_ID,
            backend_ready: false,
            providers: [],
            pix: {
              enabled: false,
              provider_id: null,
              dynamic_qr_enabled: false,
              copy_paste_enabled: false,
              expiration_minutes: 30,
              reconciliation_enabled: false,
              refund_enabled: false,
              pix_key_masked: null,
            },
            online_cards: {
              enabled: false,
              provider_id: null,
              credit_enabled: false,
              debit_enabled: false,
              installments_enabled: false,
              max_installments: 1,
              min_installment_cents: 2000,
              fee_policy_note: null,
              settlement_days_credit: null,
              settlement_days_debit: null,
            },
            terminals: [],
            diagnostics: [
              {
                id: 'backend-readiness',
                scope: 'provider',
                label: 'Persistência e credenciais de provedores',
                status: 'unavailable',
                message: 'Aguardando ativação da persistência no servidor.',
                checked_at: null,
              },
            ],
            pending_reconciliations_count: 0,
            catalog: [
              {
                provider_code: 'generic_pix_bank',
                display_name: 'Instituição Bancária (Somente Pix)',
                category: 'bank_psp',
                auth_model: 'oauth2_mtls',
                supported_capabilities: {
                  pix_dynamic_qr: true,
                  pix_copy_paste: true,
                  pix_query_status: true,
                  pix_reconciliation: true,
                  pix_refund: true,
                  card_credit_cash: false,
                  card_credit_installments: false,
                  card_debit_online: false,
                  card_refund: false,
                  card_dispute_tracking: false,
                  terminal_integrated: false,
                  terminal_local_agent: false,
                  webhook_signed: true,
                },
                notes: 'Banco oficial para cobrança Pix dinâmica e conciliação.',
              },
            ],
          },
        },
      }),
    );

    await page.goto('/configuracoes/bancos-pagamentos');
    await expect(page.getByRole('heading', { name: /Bancos e Pagamentos/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Bancos e provedores/i })).toBeVisible();
    await expect(page.getByRole('tab', { name: /Maquininhas/i })).toBeVisible();

    if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
      await page.screenshot({ path: `${ART}/verify-providers-${viewport.name}.png`, fullPage: true });
    }

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
    expect(await page.locator('.operation-mobile-nav a').count()).toBeLessThanOrEqual(4);
    expect(await page.locator('[role="progressbar"],.spinner,.loading-overlay').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`Cenário 21 (${viewport.name}): Caixa -> aba Autorizações exibe pedidos pendentes sem overflow`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAuth(page, 'owner');
    await page.route('**/api/cash/configuration', (r) =>
      r.fulfill({
        json: {
          data: {
            units: [],
            accounts: [],
            payment_methods: [],
            units_total: 0,
            accounts_total: 0,
            payment_methods_total: 0,
            page: 1,
            page_size: 50,
            unit_id: null,
          },
        },
      }),
    );
    await page.route('**/api/cash/dashboard', (r) =>
      r.fulfill({
        json: {
          data: {
            sessions: [],
            total: 0,
            page: 1,
            page_size: 5,
            scope: 'own',
            can_open: true,
            can_manage: true,
            can_read_all: true,
          },
        },
      }),
    );
    await page.route('**/api/financial-approvals/list', (r) =>
      r.fulfill({
        json: {
          data: {
            items: [
              {
                id: APPROVAL_ID,
                office_id: OFFICE_ID,
                kind: 'discount',
                status: 'pending',
                charge_id: CHARGE_ID,
                charge_version_snapshot: 2,
                request_id: REQUEST_ID,
                protocol: 'JN-2026-000111',
                customer_name: 'Maria Produtora',
                service_summary: 'Regularização Rural',
                requester_user_id: USER_ID,
                requester_name: 'Atendente',
                approver_user_id: USER_ID,
                approver_name: 'Gestor Teste',
                original_cents: 50000,
                requested_amount_cents: 5000,
                discount_cents: 5000,
                discount_percent: 10,
                final_cents: 45000,
                card_fee_cents: 0,
                payment_method_id: null,
                payment_method_name: null,
                session_id: null,
                unit_id: null,
                justification: 'Desconto comercial aprovado pela gerência',
                decision_note: null,
                created_at: '2026-11-21T10:00:00Z',
                expires_at: '2026-11-22T10:00:00Z',
                decided_at: null,
                executed_at: null,
                can_decide: true,
                can_execute: false,
                invalidation_reason: null,
              },
            ],
            total: 1,
            page: 1,
            page_size: 5,
            backend_ready: true,
          },
        },
      }),
    );

    await page.goto('/caixa');
    await page.getByRole('tab', { name: /Autorizações/i }).click();
    await expect(page.getByText('JN-2026-000111')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true })).toBeVisible();

    if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
      await page.screenshot({ path: `${ART}/verify-approvals-${viewport.name}.png`, fullPage: true });
    }

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`Cenário 21 (${viewport.name}): Portal do Cliente -> Meus Pagamentos exibe checkout e estado real sem overflow`, async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await mockAuth(page, 'client', []);
    await page.route('**/api/cash/client-finance', (r) =>
      r.fulfill({
        json: {
          data: {
            items: [
              {
                id: CHARGE_ID,
                request_id: REQUEST_ID,
                protocol: 'JN-2026-000500',
                version: 2,
                status: 'open',
                due_cents: 45000,
                paid_cents: 0,
                balance_cents: 45000,
                services: ['Regularização Fundiária'],
                installments: [{ number: 1, due_date: '2026-12-01', amount_cents: 45000 }],
              },
            ],
            total: 1,
            page: 1,
            history: [],
            history_total: 0,
            history_page: 1,
            summary: { due_cents: 45000, paid_cents: 0, balance_cents: 45000 },
          },
        },
      }),
    );
    await page.route('**/api/payment-checkout/client/summary', (r) =>
      r.fulfill({
        json: {
          data: {
            office_id: OFFICE_ID,
            charge: {
              charge_id: CHARGE_ID,
              request_id: REQUEST_ID,
              protocol: 'JN-2026-000500',
              service_summary: 'Regularização Fundiária',
              channel: 'portal',
              original_cents: 50000,
              approved_discount_cents: 5000,
              authorized_surcharge_cents: 0,
              card_fee_cents: 0,
              final_cents: 45000,
              paid_cents: 0,
              balance_cents: 45000,
              charge_status: 'aberta',
              charge_version: 2,
              installments: [],
              receipt: null,
            },
            payment_state: 'available',
            provider_configured: true,
            provider_message: null,
            available_methods: ['pix_qr', 'credit_card', 'installments'],
            max_installments: 6,
            min_installment_cents: 5000,
            active_intent: null,
            recent_intents: [],
          },
        },
      }),
    );

    await page.goto('/meus-pagamentos');
    await expect(page.getByText('JN-2026-000500').first()).toBeVisible();
    await page.getByRole('button', { name: 'Pagar ou ver detalhamento', exact: true }).click();
    await expect(page.getByText(/Disponível para pagamento/i)).toBeVisible();

    if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
      await page.screenshot({ path: `${ART}/verify-client-payments-${viewport.name}.png`, fullPage: true });
    }

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
    expect(errors).toEqual([]);
  });
}
