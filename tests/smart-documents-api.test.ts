import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import { office21 as office, user21 as user, doc21, request21, item21, version21, document21 as detail } from './fixtures/documents21.js';

const templateId = '00000000-0000-4000-8000-000000000010';
const correctionId = '00000000-0000-4000-8000-000000000020';
const idempKey = '00000000-0000-4000-8000-000000000030';

test('smart-documents API: autentica, configura sem alterar texto jurídico, salva sessão, opera conferência, cortesia, leitura manual e correção gratuita', async () => {
  let mode: 'ok' | '403' | '409' | '500' = 'ok';
  const rpcCalls: Array<{ path: string; body: Record<string, unknown> }> = [];

  const provider = createServer(async (req, res) => {
    req.setEncoding('utf8');
    let raw = '';
    for await (const chunk of req) raw += chunk;
    const body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    rpcCalls.push({ path: req.url ?? '', body });
    res.setHeader('Content-Type', 'application/json');

    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({ id: user, aud: 'authenticated' }));
      return;
    }

    if (mode !== 'ok') {
      const status = Number(mode);
      res.statusCode = status;
      res.end(
        JSON.stringify({
          code: `PT${status}`,
          message:
            status === 403
              ? 'DOCUMENTS_FORBIDDEN'
              : status === 409
                ? 'DOCUMENT_CONFLICT'
                : 'SQL secret',
        }),
      );
      return;
    }

    if (req.url?.endsWith('smart_template_config_get')) {
      res.end(JSON.stringify({ template_id: templateId, revision: 1, config: null, updated_at: null }));
      return;
    }
    if (req.url?.endsWith('smart_template_config_save')) {
      res.end(JSON.stringify({ template_id: templateId, revision: 2, config: body.p_config, updated_at: '2026-11-18T12:00:00Z' }));
      return;
    }
    if (req.url?.endsWith('smart_session_get') || req.url?.endsWith('smart_session_upsert')) {
      res.end(
        JSON.stringify({
          id: doc21,
          office_id: office,
          request_id: request21,
          document_id: doc21,
          template_id: templateId,
          template_version_id: version21,
          origin: 'portal',
          channel: 'web',
          current_step: 'revisao',
          initial_answers: { 'smart.property_type': 'rural' },
          answers: { 'documento.ccir_numero': '12345' },
          parties: [],
          pending_fields: [],
          conference_status: 'em_conferencia',
          conference_notes: '',
          revision: 1,
        }),
      );
      return;
    }
    if (req.url?.endsWith('smart_request_context')) {
      res.end(
        JSON.stringify({
          request_id: request21,
          request_item_id: item21,
          request_protocol: 'AT-2026-0001',
          request_status: 'in_progress',
          origin: 'portal',
          has_intake: true,
          intake: {
            model_name: 'Compra e Venda',
            template_id: templateId,
            template_version_id: version21,
            answers: { 'documento.matricula': '123' },
          },
          document_id: doc21,
          document_status: 'draft',
          document_revision: 1,
          document_protocol: 'AT-2026-0001',
          smart_session: null,
          smart_config: null,
          financial: { charge_id: doc21, due_cents: 50000, allocated_cents: 50000, balance_cents: 0, cancelled: false },
          courtesies: [],
        }),
      );
      return;
    }
    if (req.url?.endsWith('document_detail')) {
      res.end(JSON.stringify(detail));
      return;
    }
    if (req.url?.endsWith('smart_conference_operate')) {
      res.end(JSON.stringify({ request_id: request21, conference_status: 'conferencia_concluida', updated_at: '2026-11-18T12:00:00Z' }));
      return;
    }
    if (req.url?.endsWith('smart_courtesy_authorize')) {
      res.end(JSON.stringify({ id: correctionId, waived_cents: 50000, reason: 'Cortesia autorizada pela gerência', authorized_by_name: 'Super Admin' }));
      return;
    }
    if (req.url?.endsWith('smart_manual_reading_record')) {
      res.end(JSON.stringify({ id: correctionId, created_at: '2026-11-18T12:00:00Z' }));
      return;
    }
    if (req.url?.endsWith('smart_correction_list')) {
      res.end(JSON.stringify({ items: [] }));
      return;
    }
    if (req.url?.endsWith('smart_correction_request') || req.url?.endsWith('smart_correction_decide')) {
      res.end(
        JSON.stringify({
          id: correctionId,
          office_id: office,
          request_id: request21,
          document_id: doc21,
          publication_id: null,
          section_key: 'Qualificação das partes',
          incorrect_value: 'CPF antigo',
          corrected_value: 'CPF 529.982.247-25',
          description: 'Correção de dígito no CPF do comprador.',
          attachment_ids: [],
          status: req.url?.endsWith('decide') ? 'nova_versao_liberada' : 'aguardando_conferencia',
          was_signed_before: true,
          requires_resignature: true,
          zero_charge_linked_payment_id: doc21,
          zero_charge_label: 'Correção de documento — sem nova cobrança',
          requested_by_name: 'Cliente Teste',
          reviewed_by_name: req.url?.endsWith('decide') ? 'Equipe' : null,
          review_reason: req.url?.endsWith('decide') ? 'Retificação liberada gratuitamente' : null,
          new_revision: 2,
          created_at: '2026-11-18T12:00:00Z',
          updated_at: '2026-11-18T12:00:00Z',
        }),
      );
      return;
    }
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const previous = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';

  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/smart-documents`;

  const post = (path: string, body: unknown, withAuth = true) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        ...(withAuth ? { Authorization: 'Bearer fixture' } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  try {
    // 1. Sem autenticação retorna 401 sem atingir RPC
    assert.equal((await post('/config/get', { office_id: office, template_id: templateId }, false)).status, 401);
    assert.equal(rpcCalls.length, 0);

    // 2. Sugestão automática para modelo rascunho/aprovado sem modificar texto
    const suggestRes = await post('/config/suggest', {
      definition: {
        code: 'CONTRATO_RURAL_01',
        name: 'Contrato Rural',
        kind: 'contract',
        content: 'Imóvel rural CCIR {{documento.ccir_numero}}',
        variables: [{ key: 'documento.ccir_numero', label: 'CCIR', type: 'text', required: false }],
        signature_policy: 'physical',
        review_required: true,
        demonstration: true,
        effective_from: null,
        effective_until: null,
      },
    });
    assert.equal(suggestRes.status, 200);
    const suggestedJson = (await suggestRes.json()) as { data: { version: number; domain: string } };
    assert.equal(suggestedJson.data.version, 1);

    // 3. Salva sessão inteligente e consulta contexto de conferência
    const saveRes = await post('/session/save', {
      office_id: office,
      request_id: request21,
      template_id: templateId,
      template_version_id: version21,
      origin: 'whatsapp',
      channel: 'web',
      current_step: 'revisao',
      initial_answers: { 'smart.property_type': 'rural' },
      answers: { 'documento.ccir_numero': '12345' },
      parties: [],
      pending_fields: [{ key: 'documento.car_numero', label: 'CAR', step_id: 'objeto', criticality: 'recommended', reason: 'Pendente' }],
      expected_revision: 0,
      submit: true,
    });
    assert.equal(saveRes.status, 200);

    const ctxRes = await post('/request-context', {
      office_id: office,
      request_id: request21,
      request_item_id: item21,
    });
    assert.equal(ctxRes.status, 200);

    // 4. Inicia e conclui conferência contratada
    const confStartRes = await post('/conference/start', {
      office_id: office,
      request_id: request21,
      request_item_id: item21,
      participants: [],
      idempotency_key: idempKey,
    });
    assert.equal(confStartRes.status, 200);

    const confOpRes = await post('/conference/operate', {
      office_id: office,
      request_id: request21,
      document_id: doc21,
      conference_status: 'conferencia_concluida',
      conference_notes: 'Conferido integralmente',
      notify_client: true,
      release_charge: true,
    });
    assert.equal(confOpRes.status, 200);

    // 5. Cortesia autorizada sem receita fictícia + validação de motivo curto
    assert.equal(
      (await post('/courtesy', { office_id: office, courtesy: { request_id: request21, reason: 'ok', idempotency_key: idempKey } })).status,
      422,
    );
    const courtesyRes = await post('/courtesy', {
      office_id: office,
      courtesy: {
        request_id: request21,
        reason: 'Cortesia autorizada pela gerência',
        idempotency_key: idempKey,
      },
    });
    assert.equal(courtesyRes.status, 200);

    // 6. Registro de leitura manual presencial
    const readRes = await post('/manual-reading', {
      office_id: office,
      reading: {
        document_id: doc21,
        revision: 1,
        clauses_reviewed: ['sec-1', 'sec-2'],
        customer_confirmed: true,
        notes: 'Leitura acompanhada em balcão',
      },
    });
    assert.equal(readRes.status, 200);

    // 7. Correção pós-conclusão gratuita ("Correção de documento — sem nova cobrança") e decisão com retificação
    const corrReqRes = await post('/corrections/request', {
      office_id: office,
      correction: {
        document_id: doc21,
        section_key: 'Qualificação das partes',
        incorrect_value: 'CPF antigo',
        corrected_value: 'CPF 529.982.247-25',
        description: 'Correção de dígito no CPF do comprador.',
        attachment_ids: [],
      },
    });
    assert.equal(corrReqRes.status, 200);
    const corrJson = (await corrReqRes.json()) as { data: { zero_charge_label: string; requires_resignature: boolean } };
    assert.equal(corrJson.data.zero_charge_label, 'Correção de documento — sem nova cobrança');
    assert.equal(corrJson.data.requires_resignature, true);

    const decideRes = await post('/corrections/decide', {
      office_id: office,
      correction_id: correctionId,
      status: 'nova_versao_liberada',
      reason: 'Nova revisão emitida sem cobrança',
      new_revision: 2,
    });
    assert.equal(decideRes.status, 200);

    // 8. Erros 403, 409 e sanitização de erro 500 -> 503 sem vazar segredo SQL
    for (const st of ['403', '409', '500'] as const) {
      mode = st;
      const errRes = await post('/conference/operate', {
        office_id: office,
        request_id: request21,
        conference_status: 'em_conferencia',
      });
      assert.equal(errRes.status, st === '500' ? 503 : Number(st));
      assert.doesNotMatch(await errRes.text(), /SQL|secret/);
    }
  } finally {
    server.closeAllConnections();
    provider.closeAllConnections();
    await Promise.all([
      new Promise<void>((r) => server.close(() => r())),
      new Promise<void>((r) => provider.close(() => r())),
    ]);
    for (const [i, k] of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].entries()) {
      if (previous[i] === undefined) delete process.env[k];
      else process.env[k] = previous[i];
    }
  }
});
