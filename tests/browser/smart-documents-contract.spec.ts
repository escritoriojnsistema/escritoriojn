import { test, expect, type Page } from '@playwright/test';
import { office21 as office, user21 as user, doc21, document21 as detail, request21, item21, template21, version21 } from '../fixtures/documents21';

test.skip(!process.env.TEAM_UI_CONTRACT, 'Contratos locais de apresentação.');

const publication = '00000000-0000-4000-8000-000000000099';
const at = '2026-11-18T12:00:00Z';

async function setupAuth(page: Page, role: 'owner' | 'client') {
  const token = `e30.${Buffer.from(
    JSON.stringify({ sub: user, exp: Math.floor(Date.now() / 1000) + 3600, role: 'authenticated', session_id: office }),
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
  await page.route('https://team-ui.supabase.co/**', (r) => r.fulfill({ json: { id: user, aud: 'authenticated' } }));
  await page.route('**/api/auth/context', (r) =>
    r.fulfill({
      json: {
        data: {
          user: { id: user },
          contexts: [
            {
              office_id: office,
              user_id: user,
              office_name: 'Escritório JN',
              display_name: role === 'client' ? 'Cliente Teste' : 'Equipe Teste',
              role_code: role,
              permissions:
                role === 'client'
                  ? []
                  : ['foundation.access', 'documents.read', 'documents.create', 'documents.update', 'requests.read', 'customers.read', 'templates.read', 'templates.manage', 'charges.read', 'charges.adjust'],
            },
          ],
        },
      },
    }),
  );
  await page.route('**/api/notifications/summary', (r) => r.fulfill({ json: { data: { unread: 0 } } }));
  await page.route('**/api/auth/activity', (r) => r.fulfill({ json: { data: { active: true } } }));
  await page.route('**/api/document-commercial/presence', (r) =>
    r.fulfill({ json: { data: { status: 'offline', capacity: 1, last_seen: null, session_current: false } } }),
  );
}

test('smart: catálogo com wizard inteligente de 6 etapas, rural condicional, partes com cônjuge e pendência não bloqueante', async ({ page }) => {
  await setupAuth(page, 'client');
  const folder = '00000000-0000-4000-8000-000000000001';
  const offer = {
    template_id: template21,
    template_version_id: version21,
    service_version_id: version21,
    offer_revision: 1,
    name: 'Contrato Rural ou Urbano',
    template_code: 'COMPRA-VENDA',
    folder_id: folder,
    folder_name: 'Contratos',
    folder_category: 'Imobiliário',
    instructions: 'Preencha as etapas conforme o imóvel.',
    price_cents: 15000,
    service_id: folder,
    service_code: 'SRV-IMOVEL',
    service_category: 'Documentos',
    service_checklist: ['Matrícula atualizada'],
    variables: [
      { key: 'documento.matricula', label: 'Matrícula', type: 'text', required: true },
      { key: 'documento.imovel_ccir', label: 'CCIR', type: 'text', required: true },
    ],
  };

  let savedSession: any = null;
  await page.route('**/api/document-commercial/**', (r) => {
    const path = new URL(r.request().url()).pathname.split('/').at(-1);
    if (path === 'offers') {
      return r.fulfill({
        json: {
          data: {
            categories: [{ id: folder, name: 'Documentos', count: 1, is_documents: true }],
            items: [offer],
            folders: [{ id: folder, name: 'Contratos', category: 'Imobiliário' }],
            total: 1,
            page: 1,
            page_size: 5,
          },
        },
      });
    }
    if (path === 'offer-form') return r.fulfill({ json: { data: offer } });
    if (path === 'booking') return r.fulfill({ json: { data: { request_id: request21, protocol: 'AT-SMART-1', status: 'recebido', waiting: true } } });
    return r.fulfill({ status: 404, json: { error: { code: 'NOT_FOUND' } } });
  });

  await page.route('**/api/smart-documents/**', (r) => {
    const path = new URL(r.request().url()).pathname.split('/').slice(-2).join('/');
    if (path === 'config/get') {
      return r.fulfill({ json: { data: { template_id: template21, revision: 0, config: null, updated_at: null } } });
    }
    if (path === 'session/save') {
      savedSession = r.request().postDataJSON();
      return r.fulfill({ json: { data: { id: doc21, revision: 1, ...savedSession } } });
    }
    return r.fulfill({ json: { data: null } });
  });

  await page.goto('/modelos-disponiveis');
  await page.getByRole('button', { name: 'Solicitar', exact: true }).click();
  await page.getByRole('button', { name: 'Usar preenchimento inteligente guiado', exact: true }).click();
  await expect(page.getByText('Preenchimento inteligente')).toBeVisible();

  // Select rural nature in step 1 (Contexto)
  await page.getByLabel('Imóvel Rural (fazenda, sítio, chácara, gleba)').check();
  await page.getByRole('button', { name: 'Avançar etapa', exact: true }).click();

  // Step 2: Partes - add buyer, select married, verify spouse fields + grammatical agreement preview
  await page.getByRole('button', { name: /Adicionar comprador/ }).click();
  await page.getByLabel('Nome completo *', { exact: true }).fill('Maria Silva');
  await page.getByLabel('Concordância declarada (gênero gramatical)').selectOption('feminine');
  await page.getByLabel('Estado civil *').selectOption('casado');
  await expect(page.getByLabel('Regime de bens *')).toBeVisible();
  await expect(page.getByLabel('Prévia de qualificação gramatical')).toContainText('casada');

  // Advance with secondary pendency -> opens PendingConfirmModal
  await page.getByRole('button', { name: 'Avançar etapa', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar com pendências', exact: true }).click();

  // Step 3: Objeto -> rural conditional CCIR field appears
  await expect(page.getByText('3. Dados específicos do documento')).toBeVisible();
  await expect(page.getByLabel(/Número do CCIR/)).toBeVisible();
});

test('smart: editor de documento integra conferência, leitura manual presencial e painel de correções', async ({ page }) => {
  await setupAuth(page, 'owner');
  let confPayload: any = null;
  let manualPayload: any = null;
  let decidePayload: any = null;

  await page.route('**/api/document-commercial/intake', (r) => r.fulfill({ json: { data: null } }));
  await page.route('**/api/document-workflow/state', (r) =>
    r.fulfill({ json: { data: { document_id: doc21, current_revision: 1, can_work: false, can_review: false, publications: [] } } }),
  );
  await page.route('**/api/documents/search', (r) =>
    r.fulfill({
      json: {
        data: {
          items: [{ id: doc21, title: detail.title, request_protocol: detail.request_protocol, status: 'draft', revision: 1, demonstration: false, updated_at: at, protocol: detail.protocol }],
          page: 1,
          page_size: 5,
          total: 1,
        },
      },
    }),
  );
  await page.route('**/api/documents/detail', (r) => r.fulfill({ json: { data: detail } }));

  await page.route('**/api/smart-documents/**', (r) => {
    const sub = new URL(r.request().url()).pathname.replace('/api/smart-documents/', '');
    if (sub === 'session/get') {
      return r.fulfill({
        json: {
          data: {
            id: doc21,
            office_id: office,
            request_id: request21,
            request_item_id: item21,
            document_id: doc21,
            template_id: template21,
            template_version_id: version21,
            origin: 'portal',
            channel: 'web',
            current_step: 'revisao',
            initial_answers: {},
            answers: {},
            parties: [],
            pending_fields: [],
            conference_status: 'em_conferencia',
            conference_notes: '',
            revision: 1,
            autosaved_at: at,
            submitted_at: at,
          },
        },
      });
    }
    if (sub === 'config/get') return r.fulfill({ json: { data: { template_id: template21, revision: 0, config: null, updated_at: null } } });
    if (sub === 'conference/operate') {
      confPayload = r.request().postDataJSON();
      return r.fulfill({ json: { data: { request_id: request21, conference_status: confPayload.conference_status, updated_at: at } } });
    }
    if (sub === 'manual-reading') {
      manualPayload = r.request().postDataJSON();
      return r.fulfill({ json: { data: { id: doc21, created_at: at } } });
    }
    if (sub === 'corrections/list') {
      return r.fulfill({
        json: {
          data: {
            items: [
              {
                id: publication,
                office_id: office,
                request_id: request21,
                document_id: doc21,
                publication_id: null,
                section_key: 'Qualificação das partes',
                incorrect_value: 'Rua A, 10',
                corrected_value: 'Rua B, 200',
                description: 'Corrigir endereço do comprador',
                attachment_ids: [],
                status: 'aguardando_conferencia',
                review_reason: null,
                new_revision: null,
                was_signed_before: true,
                requires_resignature: true,
                zero_charge_label: 'Correção de documento — sem nova cobrança',
                requested_by_name: 'Bruno Comprador',
                reviewed_by_name: null,
                created_at: at,
                updated_at: at,
              },
            ],
          },
        },
      });
    }
    if (sub === 'corrections/decide') {
      decidePayload = r.request().postDataJSON();
      return r.fulfill({ json: { data: { id: publication, status: decidePayload.status, zero_charge_label: 'Correção de documento — sem nova cobrança', section_key: 'Qualificação das partes', corrected_value: 'Rua B, 200', description: 'Corrigir endereço do comprador', was_signed_before: true, requires_resignature: true, requested_by_name: 'Bruno Comprador', created_at: at, updated_at: at } } });
    }
    return r.fulfill({ json: { data: null } });
  });

  await page.goto('/documentos?aba=issued');
  await page.getByRole('button', { name: 'Abrir documento Contrato de Teste', exact: true }).click();
  await page.getByRole('tab', { name: 'Revisão', exact: true }).click();

  await page.getByText(/Conferência do documento contratado/).click();
  await page.getByLabel('Observações da conferência').fill('Documentação conferida');
  await page.getByRole('button', { name: 'Concluir conferência e notificar cliente', exact: true }).click();
  await expect.poll(() => confPayload?.conference_status).toBe('conferencia_concluida');

  await page.getByRole('button', { name: 'Ler manualmente', exact: true }).click();
  await page.getByRole('button', { name: 'Registrar conclusão da leitura manual', exact: true }).click();
  await expect.poll(() => manualPayload?.reading?.document_id).toBe(doc21);

  await expect(page.getByText(/Solicitações de correção pós-conclusão/)).toBeVisible();
  await page.getByRole('button', { name: 'Liberar nova versão sem nova cobrança', exact: true }).click();
  await expect.poll(() => decidePayload?.status).toBe('nova_versao_liberada');
});

test('smart: portal do cliente permite solicitar correção pós-conclusão sem nova cobrança', async ({ page }) => {
  await setupAuth(page, 'client');
  let requested: any = null;
  const doc = { id: publication, title: 'Contrato Entregue', protocol: 'DOC-SMART-32', revision: 1, created_at: at, scope: 'own', ready: true, blockers: [] };

  await page.route('**/api/portal-documents/**', (r) => {
    const path = r.request().url().split('/').at(-1);
    if (path === 'page') return r.fulfill({ json: { data: { items: [doc], total: 1, page: 1, page_size: 5 } } });
    if (path === 'state') return r.fulfill({ json: { data: { document: doc, financial: null, history: [], history_total: 0, page: 1, page_size: 5 } } });
    return r.fulfill({ status: 404 });
  });

  await page.route('**/api/smart-documents/**', (r) => {
    const sub = new URL(r.request().url()).pathname.replace('/api/smart-documents/', '');
    if (sub === 'corrections/list') return r.fulfill({ json: { data: { items: [] } } });
    if (sub === 'corrections/request') {
      requested = r.request().postDataJSON();
      return r.fulfill({
        json: {
          data: {
            id: doc21,
            office_id: office,
            request_id: request21,
            document_id: doc21,
            publication_id: publication,
            section_key: requested.correction.section_key,
            incorrect_value: requested.correction.incorrect_value,
            corrected_value: requested.correction.corrected_value,
            description: requested.correction.description,
            attachment_ids: [],
            status: 'aguardando_conferencia',
            was_signed_before: true,
            requires_resignature: true,
            zero_charge_label: 'Correção de documento — sem nova cobrança',
            requested_by_name: 'Cliente Teste',
            created_at: at,
            updated_at: at,
          },
        },
      });
    }
    return r.fulfill({ json: { data: null } });
  });

  await page.goto('/meus-documentos?aba=meus');
  await page.getByRole('button', { name: 'Ver documento DOC-SMART-32', exact: true }).click();
  await page.getByRole('button', { name: 'Solicitar correção', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Dado correto para constar no documento *').fill('CPF 529.982.247-25');
  await page.getByLabel('Explicação para a equipe *').fill('Dígito do CPF estava invertido na qualificação');
  await page.getByRole('button', { name: 'Enviar solicitação de correção', exact: true }).click();

  await expect.poll(() => requested?.correction?.corrected_value).toBe('CPF 529.982.247-25');
  await expect(page.getByText(/sem cobrança duplicada/)).toBeVisible();
  await expect(page.getByText(/exige retificação \/ nova assinatura/)).toBeVisible();
});
