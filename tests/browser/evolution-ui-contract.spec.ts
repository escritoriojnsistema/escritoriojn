import { test, expect, type Page } from '@playwright/test';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Local fictitious contracts.');

const ART = '.aistudio/artifacts/brain/8f1da76b-bc17-4df7-98c6-a74e231bd390/.tempmediaStorage';
const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const REQUEST_ID = '33333333-3333-4333-8333-333333333333';
const CHARGE_ID = '44444444-4444-4444-8444-444444444444';
const APPROVAL_ID = '55555555-5555-4555-8555-555555555555';
const APPROVAL_ID_2 = '66666666-6666-4666-8666-666666666666';
const SESSION_ID = '77777777-7777-4777-8777-777777777777';
const UNIT_ID = '88888888-8888-4888-8888-888888888888';
const ACCOUNT_ID = '99999999-9999-4999-8999-999999999999';
const METHOD_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const APPROVER_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

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

async function mockAuth(page: Page, role: 'owner' | 'employee' | 'client', permissions = allPermissions) {
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
              display_name: role === 'client' ? 'Cliente Teste' : role === 'employee' ? 'Operador Caixa' : 'Gestor Teste',
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
  test(`Cenário 21 (${viewport.name}): Bancos e Pagamentos renderiza 5 abas, contas/unidades, sem overflow e <= 4 atalhos mobile`, async ({
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
            units: [{ id: UNIT_ID, name: 'Unidade Sede', active: true, version: 1 }],
            accounts: [
              { id: ACCOUNT_ID, unit_id: UNIT_ID, name: 'Conta Bancária PJ', type: 'bank', active: true, version: 1 },
            ],
            payment_methods: [],
            units_total: 1,
            accounts_total: 1,
            payment_methods_total: 0,
            page: 1,
            page_size: 50,
            unit_id: null,
          },
        },
      }),
    );
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
    await expect(page.getByLabel(/Conta recebedora vinculada/i)).toBeVisible();
    await expect(page.getByLabel(/Unidade \/ destino financeiro/i)).toBeVisible();

    if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
      await page.screenshot({ path: `${ART}/verify-providers-${viewport.name}.png`, fullPage: true });
    }

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
    expect(await page.locator('.operation-mobile-nav a').count()).toBeLessThanOrEqual(4);
    expect(await page.locator('[role="progressbar"],.spinner,.loading-overlay').count()).toBe(0);
    expect(errors).toEqual([]);
  });

  test(`Cenário 21 (${viewport.name}): Caixa -> aba Autorizações exibe pagamento manual completo e desconto sem overflow`, async ({
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
                kind: 'manual_payment',
                status: 'pending',
                charge_id: CHARGE_ID,
                charge_version_snapshot: 2,
                request_id: REQUEST_ID,
                protocol: 'JN-2026-000110',
                customer_name: 'José Produtor Rural',
                service_summary: 'Georreferenciamento',
                requester_user_id: USER_ID,
                requester_name: 'Operador Caixa',
                approver_user_id: USER_ID,
                approver_name: 'Gestor Teste',
                original_cents: 35000,
                requested_amount_cents: 35000,
                discount_cents: null,
                discount_percent: null,
                final_cents: 35000,
                card_fee_cents: 0,
                payment_method_id: METHOD_ID,
                payment_method_name: 'Pix Manual Conferido',
                session_id: SESSION_ID,
                unit_id: UNIT_ID,
                unit_name: 'Unidade Sede',
                destination_account_id: ACCOUNT_ID,
                destination_account_name: 'Conta Bancária PJ',
                operation_date: '2026-11-21',
                external_reference: 'E2E-9988776655',
                justification: 'Crédito conferido no extrato bancário oficial',
                decision_note: null,
                created_at: '2026-11-21T10:00:00Z',
                expires_at: '2026-11-22T10:00:00Z',
                decided_at: null,
                executed_at: null,
                can_decide: true,
                can_execute: false,
                invalidation_reason: null,
              },
              {
                id: APPROVAL_ID_2,
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
                unit_name: null,
                destination_account_id: null,
                destination_account_name: null,
                operation_date: null,
                external_reference: null,
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
            total: 2,
            page: 1,
            page_size: 5,
            backend_ready: true,
          },
        },
      }),
    );

    await page.goto('/caixa');
    await page.getByRole('tab', { name: /Autorizações/i }).click();
    await expect(page.getByText('JN-2026-000110')).toBeVisible();
    await expect(page.getByText('21/11/2026', { exact: true })).toBeVisible();
    await expect(page.getByText('E2E-9988776655')).toBeVisible();
    await expect(page.getByText('Conta Bancária PJ · Unidade Sede')).toBeVisible();
    await expect(page.getByText('JN-2026-000111')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Aprovar', exact: true }).first()).toBeVisible();

    if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
      await page.screenshot({ path: `${ART}/verify-approvals-${viewport.name}.png`, fullPage: true });
    }

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
    expect(errors).toEqual([]);
  });

  test(`Cenário 21 (${viewport.name}): Portal do Cliente -> Meus Pagamentos exibe parcelas, detalhamento e checkout sem overflow`, async ({
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
              installments: [{ number: 1, due_date: '2026-12-01', amount_cents: 45000 }],
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
    await expect(page.getByText(/Parcelas e vencimentos/i)).toBeVisible();
    await expect(page.getByText('Parcela 1 · Vencimento 01/12/2026')).toBeVisible();

    if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
      await page.screenshot({ path: `${ART}/verify-client-payments-${viewport.name}.png`, fullPage: true });
    }

    const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    expect(noOverflow).toBe(true);
    expect(errors).toEqual([]);
  });
}

test('Etapa 1 UI (Cenários 1, 2, 5, 6): Modal de exclusão definitiva usa copy exato, separa anexos preservados, trata storage_cleanup_failed sem falso sucesso e notificação do cliente oferece Nova Solicitação sem link quebrado', async ({
  page,
  browser,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'owner');
  await page.route('**/api/requests/search', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              id: REQUEST_ID,
              protocol: 'JN-2026-000888',
              title: 'Atualização de CCIR',
              status: 'aberto',
              public_status: 'em_andamento',
              priority: 'normal',
              origin: 'portal',
              customer_name: 'Maria Produtora',
              assignee_name: 'Gestor Teste',
              category_name: 'Imóvel Rural',
              updated_at: '2026-11-21T10:00:00Z',
              created_at: '2026-11-21T09:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 5,
          portal: false,
          can_create: true,
        },
      },
    }),
  );
  await page.route(`**/api/requests/${REQUEST_ID}/detail`, (r) =>
    r.fulfill({
      json: {
        data: {
          id: REQUEST_ID,
          office_id: OFFICE_ID,
          protocol: 'JN-2026-000888',
          title: 'Atualização de CCIR',
          status: 'aberto',
          public_status: 'em_andamento',
          version: 1,
          origin: 'portal',
          priority: 'normal',
          priority_reason: null,
          portal: false,
          category_name: 'Imóvel Rural',
          customer_id: ACCOUNT_ID,
          customer_name: 'Maria Produtora',
          assignee_id: USER_ID,
          assignee_name: 'Gestor Teste',
          created_by_name: 'Maria Produtora',
          following_only: false,
          message: 'Solicito atualização de CCIR.',
          items: [],
          history: [],
          history_page: 1,
          history_total: 0,
          can_update: true,
          can_cancel: true,
          can_transfer: false,
          can_reclaim: false,
          created_at: '2026-11-21T09:00:00Z',
          updated_at: '2026-11-21T10:00:00Z',
        },
      },
    }),
  );
  await page.route(`**/api/request-deletion/${REQUEST_ID}/eligibility`, (r) =>
    r.fulfill({
      json: {
        data: {
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000888',
          title: 'Atualização de CCIR',
          version: 1,
          status: 'aberto',
          actor_kind: 'team',
          can_show_action: true,
          eligible: true,
          backend_ready: true,
          block_code: null,
          block_message: null,
          recommended_alternatives: [],
          attachments: {
            exclusive_count: 2,
            shared_preserved_count: 1,
            retained_preserved_count: 1,
            total_count: 4,
          },
          notify_client_on_delete: true,
        },
      },
    }),
  );
  await page.route(`**/api/request-deletion/${REQUEST_ID}/execute`, (r) =>
    r.fulfill({
      status: 202,
      json: {
        data: {
          operation_id: APPROVAL_ID,
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000888',
          status: 'storage_cleanup_failed',
          db_deleted: true,
          storage_cleanup_completed: false,
          attachments_removed: 1,
          attachments_preserved: 2,
          client_notified: false,
          audit_recorded: true,
          message: 'A limpeza física dos anexos exclusivos ainda não foi concluída. Revalide ou tente novamente.',
        },
      },
    }),
  );

  await page.goto('/solicitacoes');
  await page.getByRole('button', { name: /Ver solicitação JN-2026-000888/i }).click();
  await expect(page.getByRole('button', { name: 'Excluir solicitação', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Excluir solicitação', exact: true }).click();

  await expect(page.getByText(/Você está prestes a excluir esta solicitação/i)).toBeVisible();
  await expect(page.getByText(/O cliente será notificado sobre a exclusão da solicitação/i)).toBeVisible();
  await expect(page.getByText(/1 compartilhados com outros atendimentos/i)).toBeVisible();
  await expect(page.getByText(/1 sob retenção obrigatória/i)).toBeVisible();

  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/verify-delete-modal-desktop.png`, fullPage: true });
  }

  // Confirm -> storage_cleanup_failed must NOT close dialog or show false success
  await page.getByRole('button', { name: 'Excluir permanentemente', exact: true }).click();
  await expect(page.getByText(/não foi marcada como concluída porque ainda há limpeza de arquivos pendente/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Verificar situação da exclusão', exact: true })).toBeVisible();

  await page.route(`**/api/request-deletion/${REQUEST_ID}/status`, r=>r.fulfill({json:{data:{
    operation_id:APPROVAL_ID,request_id:REQUEST_ID,status:'completed',db_deleted:true,storage_cleanup_completed:true,
    message:'Solicitação excluída definitivamente.',
  }}}));
  await page.getByRole('button', { name: 'Verificar situação da exclusão', exact: true }).click();
  await expect(page.getByText('Solicitação excluída definitivamente.', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeHidden();

  // Now verify client notification rendering for request_deleted (no broken link, offers Iniciar nova solicitação)
  const clientContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const clientPage = await clientContext.newPage();
  clientPage.on('pageerror', (err) => errors.push(err.message));
  await mockAuth(clientPage, 'client', []);
  let marked = false;
  await clientPage.route('**/api/notifications/read', (r) => {
    expect(r.request().postDataJSON()).toEqual({ office_id: OFFICE_ID, id: APPROVAL_ID });
    marked = true;
    return r.fulfill({ json: { data: { ok: true } } });
  });
  await clientPage.route('**/api/notifications/search', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              id: APPROVAL_ID,
              kind: 'request_deleted',
              created_at: '2026-11-21T11:00:00Z',
              read_at: marked ? '2026-11-21T11:01:00Z' : null,
              request_id: null,
              protocol: 'JN-2026-000888',
              deleted_protocol: 'JN-2026-000888',
              approval_id: null,
              approval_summary: null,
              status: null,
              reason: null,
              office_id: OFFICE_ID,
              office_name: 'Escritório JN',
              can_open: false,
            },
          ],
          total: 1,
          page: 1,
          page_size: 5,
          unread: marked ? 0 : 1,
        },
      },
    }),
  );

  await clientPage.goto('/minhas-notificacoes');
  await expect(
    clientPage.getByText(/A solicitação JN-2026-000888 foi excluída pela equipe do Escritório JN/i),
  ).toBeVisible();
  await expect(clientPage.getByRole('link', { name: /Iniciar nova solicitação/i })).toBeVisible();
  await clientPage.getByRole('button', { name: 'Marcar como lida', exact: true }).click();
  await expect(clientPage.getByText('Notificação lida.', { exact: true })).toBeVisible();
  await expect(clientPage.getByRole('button', { name: 'Marcar como lida', exact: true })).toHaveCount(0);
  await clientContext.close();
  expect(errors).toEqual([]);
});

test('Etapas 3 e 5 UI (Cenários 12, 13, 16): Tela de Cobranças gera Pix dinâmico com WhatsApp manual e exibe formulário de autorização de desconto', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (err) => errors.push(err.message));

  await page.setViewportSize({ width: 1440, height: 900 });
  await mockAuth(page, 'employee', ['foundation.access', 'requests.read', 'charges.read', 'cash.read']);

  await page.route('**/api/requests/search', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              id: REQUEST_ID,
              protocol: 'JN-2026-000912',
              title: 'Certidão Rural',
              status: 'em_atendimento',
              public_status: 'em_andamento',
              priority: 'normal',
              origin: 'presencial',
              customer_name: 'José Produtor',
              assignee_name: 'Operador Caixa',
              category_name: 'Imóvel Rural',
              updated_at: '2026-11-21T10:00:00Z',
              created_at: '2026-11-21T09:00:00Z',
            },
          ],
          total: 1,
          page: 1,
          page_size: 5,
          portal: false,
          can_create: false,
        },
      },
    }),
  );
  await page.route('**/api/charges/view', (r) =>
    r.fulfill({
      json: {
        data: {
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000912',
          following_only: false,
          can_create: false,
          items: [
            {
              request_item_id: METHOD_ID,
              name: 'Certidão Rural',
              quantity: 1,
              unit_price_cents: 25000,
              total_cents: 25000,
              adjustment: { kind: 'none', reason: '' },
            },
          ],
          charge: {
            id: CHARGE_ID,
            version: 1,
            status: 'aberta',
            due_cents: 25000,
            allocated_cents: 0,
            balance_cents: 25000,
            can_adjust: false,
            can_discount: false,
            can_cancel: false,
            installments: [{ number: 1, due_date: '2026-12-10', amount_cents: 25000 }],
            history: [],
            history_total: 0,
          },
        },
      },
    }),
  );
  await page.route('**/api/payment-providers/state', (r) =>
    r.fulfill({ status: 403, json: { error: { code: 'FORBIDDEN', message: 'Sem permissão' } } }),
  );
  await page.route('**/api/payment-checkout/staff/pix', (r) =>
    r.fulfill({
      status: 201,
      json: {
        data: {
          id: APPROVAL_ID,
          office_id: OFFICE_ID,
          charge_id: CHARGE_ID,
          method: 'pix_qr',
          channel: 'presencial',
          state: 'awaiting_payment',
          terminal_state: null,
          settlement_stage: 'none',
          amount_cents: 25000,
          installments_count: 1,
          installment_amount_cents: null,
          pix_qr_payload: '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913ESCRITORIO JN6008BRASILIA62070503***6304ABCD',
          pix_copy_paste: '00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913ESCRITORIO JN6008BRASILIA62070503***6304ABCD',
          checkout_url: null,
          provider_label: 'Banco Cooperativo',
          provider_reference: 'TX-PIX-912',
          authorization_code: null,
          expires_at: '2026-11-22T12:00:00Z',
          created_at: '2026-11-21T11:30:00Z',
          updated_at: '2026-11-21T11:30:00Z',
          safe_message: null,
        },
      },
    }),
  );
  await page.route('**/api/financial-approvals/approvers', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [
            {
              membership_id: UNIT_ID,
              user_id: APPROVER_ID,
              name: 'Gestor Financeiro',
              role_code: 'owner',
              role_label: 'Super administrador',
            },
          ],
          backend_ready: true,
        },
      },
    }),
  );

  await page.goto('/cobrancas');
  await page.getByRole('button', { name: /JN-2026-000912|Selecionar/i }).first().click();
  await expect(page.getByText(/Cobrar presencialmente ou via WhatsApp/i)).toBeVisible();

  // Open Team Collection (Etapa 3) and generate Pix
  await page.getByText(/Cobrar presencialmente ou via WhatsApp/i).click();
  await page.getByRole('button', { name: /Gerar cobrança Pix dinâmica/i }).click();
  await expect(page.getByText(/Cobrança Pix dinâmica ativa/i)).toBeVisible();
  await expect(page.getByRole('button', { name: /Copiar mensagem para WhatsApp/i })).toBeVisible();
  await expect(page.getByRole('link', { name: /Abrir WhatsApp \(envio manual\)/i })).toBeVisible();

  // Open Discount Approval Form (Etapa 5)
  await page.locator('summary', { hasText: /Solicitar autorização de desconto/i }).click();
  await expect(page.getByText(/Serviços: Certidão Rural/i)).toBeVisible();
  await expect(page.getByLabel(/Aprovador autorizado do escritório/i)).toBeVisible();

  if (process.env.CAPTURE_VERIFY_SCREENSHOTS) {
    await page.screenshot({ path: `${ART}/verify-charges-collection-desktop.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

test('portal volta à lista quando uma solicitação aberta deixou de existir', async ({page})=>{
  await mockAuth(page, 'client', []);
  let exists=true;
  const summary={id:REQUEST_ID,protocol:'AT-000901',title:'Atendimento de teste',public_status:'em_andamento',
    created_at:'2026-11-21T09:00:00Z',updated_at:'2026-11-21T10:00:00Z'};
  await page.route('**/api/requests/search', r=>r.fulfill({json:{data:{
    portal:true,items:exists?[summary]:[],total:exists?1:0,page:1,page_size:5,
  }}}));
  await page.route(`**/api/requests/${REQUEST_ID}/detail`, r=>exists
    ? r.fulfill({json:{data:{...summary,portal:true,message:'Dados da solicitação',services:[],linked_view:true}}})
    : r.fulfill({status:404,json:{error:{code:'REQUEST_NOT_FOUND'}}}));
  await page.route(`**/api/request-deletion/${REQUEST_ID}/eligibility`,r=>r.fulfill({json:{data:{can_show_action:false}}}));
  await page.goto('/minhas-solicitacoes');
  await page.getByRole('button',{name:'Ver solicitação AT-000901'}).click();
  await expect(page.getByText('Dados da solicitação')).toBeVisible();
  exists=false;
  await page.evaluate(()=>window.dispatchEvent(new Event('jn:inbox-update')));
  await expect(page.getByText('Esta solicitação não está mais disponível.')).toBeVisible();
  await expect(page.getByText('Registro não encontrado.')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'Minhas solicitações'})).toBeVisible();
});

test('cobrança cancelada permite arquivar a solicitação encerrada pelo detalhe', async ({page})=>{
  await mockAuth(page,'owner',[...allPermissions,'requests.archives.manage']);
  let archived=false;
  const request={id:REQUEST_ID,title:'Manifestação de teste',protocol:'AT-121212',
    public_status:'cancelado',status:'cancelado',version:3,origin:'presencial',priority:'normal',
    created_at:'2026-11-21T09:00:00Z',updated_at:'2026-11-21T10:00:00Z'};
  await page.route('**/api/requests/search',r=>r.fulfill({json:{data:{
    portal:false,items:archived?[]:[request],total:archived?0:1,page:1,page_size:5,
  }}}));
  await page.route(`**/api/requests/${REQUEST_ID}/detail`,r=>r.fulfill({json:{data:{
    ...request,portal:false,message:'',priority_reason:'',history:[],items:[],history_page:1,history_total:1,
  }}}));
  await page.route(`**/api/request-deletion/${REQUEST_ID}/eligibility`,r=>r.fulfill({json:{data:{
    can_show_action:true,eligible:false,actor_kind:'team',can_archive:true,version:3,block_reason:'CHARGE_CANCELLED',
    block_message:'A cobrança já está cancelada.',recommended_alternatives:[],
    attachments:{total_count:0,exclusive_count:0,shared_preserved_count:0,retained_preserved_count:0},backend_ready:true,
  }}}));
  await page.route(`**/api/request-archives/${REQUEST_ID}/archive`,r=>{
    expect(r.request().postDataJSON()).toMatchObject({office_id:OFFICE_ID,expected_version:3,reason:'Encerramento conferido'});
    archived=true;
    return r.fulfill({json:{data:{request_id:REQUEST_ID,archived:true}}});
  });
  await page.goto('/solicitacoes');
  await page.getByRole('button',{name:'Ver solicitação AT-121212'}).click();
  await expect(page.getByRole('link',{name:'Abrir cobrança'})).toBeVisible();
  await page.getByText('Arquivar solicitação',{exact:true}).click();
  await page.getByLabel('Motivo do arquivamento').fill('Encerramento conferido');
  await page.getByRole('button',{name:'Confirmar arquivamento'}).click();
  await expect(page.getByText('Solicitação arquivada. O histórico financeiro foi preservado.')).toBeVisible();
  await expect(page.getByRole('button',{name:'Ver solicitação AT-121212'})).toHaveCount(0);
});
