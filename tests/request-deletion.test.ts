import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { app } from '../server/app.js';
import {
  clientDeletedNoticeTitle,
  evaluateRequestDeletionEligibility,
  formatClientDeletedNoticeBody,
  isValidDeleteRequestInput,
  type EligibilityEvaluationInput,
} from '../shared/requestDeletion.js';

const OFFICE_ID = '11111111-1111-4111-8111-111111111111';
const REQUEST_ID = '22222222-2222-4222-8222-222222222222';
const OP_ID = '33333333-3333-4333-8333-333333333333';

const baseInput: EligibilityEvaluationInput = {
  actor_kind: 'client',
  is_request_owner_client: true,
  is_authenticated_portal_client: true,
  channel: 'portal',
  status: 'aguardando_cliente',
  has_attendant: false,
  is_client_preparation: true,
  has_confirmed_payment: false,
  has_linked_refund: false,
  has_issued_receipt: false,
  has_formalized_document: false,
  has_registered_delivery: false,
  has_legal_retention: false,
};

test('Etapa 1 (Cenários 1, 2, 3, 4, 11): regras de domínio de exclusão cliente vs equipe e bloqueios absolutos', () => {
  // Cenário 1 + 11: cliente exclui antes da triagem -> elegível, sem notificação de equipe, sem auditoria empresarial
  const clientBeforeTriage = evaluateRequestDeletionEligibility(baseInput);
  assert.equal(clientBeforeTriage.eligible, true);
  assert.equal(clientBeforeTriage.requires_audit, false);
  assert.equal(clientBeforeTriage.notify_client_on_delete, false);

  // Cliente também pode excluir em aberto sem atendente atribuído
  const clientOpenNoAttendant = evaluateRequestDeletionEligibility({
    ...baseInput,
    status: 'aberto',
    is_client_preparation: false,
    has_attendant: false,
  });
  assert.equal(clientOpenNoAttendant.eligible, true);
  assert.equal(clientOpenNoAttendant.requires_audit, false);

  // Cenário 2: cliente tenta excluir em atendimento / com atendente -> bloqueado CONTROL_WITH_TEAM
  const clientBlocked = evaluateRequestDeletionEligibility({
    ...baseInput,
    status: 'em_atendimento',
    is_client_preparation: false,
    has_attendant: true,
  });
  assert.equal(clientBlocked.eligible, false);
  assert.equal(clientBlocked.block_reason, 'CONTROL_WITH_TEAM');

  // Canal presencial/WhatsApp sem conta autenticada e sem verificação de identidade -> bloqueado
  const unverifiedChannel = evaluateRequestDeletionEligibility({
    ...baseInput,
    channel: 'whatsapp',
    is_authenticated_portal_client: false,
    client_identity_verified_for_channel: false,
  });
  assert.equal(unverifiedChannel.eligible, false);
  assert.equal(unverifiedChannel.block_reason, 'CLIENT_UNVERIFIED_CHANNEL');

  // Cenário 3: equipe tenta excluir enquanto solicitação está sob controle do cliente -> bloqueado CONTROL_WITH_CLIENT
  const teamBlockedPreparation = evaluateRequestDeletionEligibility({
    ...baseInput,
    actor_kind: 'team',
    team_role: 'owner',
    team_has_delete_permission: true,
    status: 'aguardando_cliente',
    has_attendant: false,
    is_client_preparation: true,
  });
  assert.equal(teamBlockedPreparation.eligible, false);
  assert.equal(teamBlockedPreparation.block_reason, 'CONTROL_WITH_CLIENT');

  // Cenário 4: equipe autorizada exclui em atendimento -> elegível, notifica cliente, exige auditoria
  const teamEligible = evaluateRequestDeletionEligibility({
    ...baseInput,
    actor_kind: 'team',
    team_role: 'admin',
    team_has_delete_permission: true,
    status: 'em_atendimento',
    has_attendant: true,
    is_client_preparation: false,
  });
  assert.equal(teamEligible.eligible, true);
  assert.equal(teamEligible.notify_client_on_delete, true);
  assert.equal(teamEligible.requires_audit, true);

  // Equipe sem permissão requests.delete -> bloqueado e sem exibir ação
  const teamForbidden = evaluateRequestDeletionEligibility({
    ...baseInput,
    actor_kind: 'team',
    team_role: 'employee',
    team_has_delete_permission: false,
    status: 'em_atendimento',
    has_attendant: true,
    is_client_preparation: false,
  });
  assert.equal(teamForbidden.eligible, false);
  assert.equal(teamForbidden.can_show_action, false);
  assert.equal(teamForbidden.block_reason, 'INSUFFICIENT_PERMISSION');

  // Situação E: bloqueios absolutos (pagamento, reembolso, recibo, documento formalizado, entrega, retenção)
  const absoluteCases: Array<[Partial<EligibilityEvaluationInput>, string]> = [
    [{ has_confirmed_payment: true }, 'PAYMENT_CONFIRMED'],
    [{ has_linked_refund: true }, 'REFUND_LINKED'],
    [{ has_issued_receipt: true }, 'RECEIPT_ISSUED'],
    [{ has_formalized_document: true }, 'FORMALIZED_DOCUMENT'],
    [{ has_registered_delivery: true }, 'DELIVERY_REGISTERED'],
    [{ has_legal_retention: true }, 'LEGAL_RETENTION'],
    [{ concurrent_deletion_in_progress: true }, 'CONCURRENT_OPERATION'],
  ];
  for (const [override, expectedReason] of absoluteCases) {
    const res = evaluateRequestDeletionEligibility({
      ...baseInput,
      actor_kind: 'team',
      team_role: 'owner',
      team_has_delete_permission: true,
      status: 'em_atendimento',
      is_client_preparation: false,
      ...override,
    });
    assert.equal(res.eligible, false);
    assert.equal(res.block_reason, expectedReason);
  }
});

test('Etapa 1 (Cenário 10): copy exato da notificação de exclusão pela equipe e validação estrita de payload', () => {
  assert.equal(clientDeletedNoticeTitle, 'Sua solicitação foi excluída');
  const body = formatClientDeletedNoticeBody('JN-2026-000123');
  assert.match(body, /JN-2026-000123/);
  assert.match(body, /excluída pela equipe do Escritório JN/);
  assert.match(body, /iniciar uma nova solicitação/);

  assert.equal(
    isValidDeleteRequestInput({
      office_id: OFFICE_ID,
      expected_version: 2,
      expected_status: 'em_atendimento',
      idempotency_key: 'del-op-12345678',
      confirmation_ack: true,
    }),
    true,
  );
  assert.equal(
    isValidDeleteRequestInput({
      office_id: OFFICE_ID,
      expected_version: 2,
      expected_status: 'em_atendimento',
      idempotency_key: 'del-op-12345678',
      confirmation_ack: false,
    }),
    false,
  );
  assert.equal(
    isValidDeleteRequestInput({
      office_id: OFFICE_ID,
      expected_version: 2,
      expected_status: 'em_atendimento',
      idempotency_key: 'del-op-12345678',
      confirmation_ack: true,
      extra_field: 'blocked',
    }),
    false,
  );
});

test('Etapa 1 (Cenários 5, 6, 7, 8, 9, 11): API /api/request-deletion auth, 403/409/422, fail-closed e proteção contra falso sucesso no Storage', async () => {
  let mode:
    | 'missing_rpc'
    | 'eligible_shared'
    | 'forbidden'
    | 'conflict_concurrent'
    | 'conflict_status_changed'
    | 'storage_failed'
    | 'false_completed_without_storage'
    | 'client_self_deleted' = 'missing_rpc';

  const provider = createServer((req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/auth/v1/user') {
      res.end(JSON.stringify({ id: OFFICE_ID, aud: 'authenticated' }));
      return;
    }
    if (mode === 'missing_rpc') {
      res.statusCode = 404;
      res.end(JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }));
      return;
    }
    if (mode === 'forbidden') {
      res.statusCode = 403;
      res.end(JSON.stringify({ code: 'PT403', message: 'DELETION_FORBIDDEN' }));
      return;
    }
    if (mode === 'conflict_concurrent') {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'PT409', message: 'CONCURRENT_OPERATION' }));
      return;
    }
    if (mode === 'conflict_status_changed') {
      res.statusCode = 409;
      res.end(JSON.stringify({ code: 'PT409', message: 'DELETION_CONFLICT' }));
      return;
    }
    if (req.url?.endsWith('request_deletion_eligibility') && mode === 'eligible_shared') {
      res.end(
        JSON.stringify({
          request_id: REQUEST_ID,
          office_id: OFFICE_ID,
          protocol: 'JN-2026-000999',
          title: 'Declaração ITR',
          status: 'em_atendimento',
          version: 3,
          actor_kind: 'team',
          eligible: true,
          can_show_action: true,
          block_reason: null,
          block_message: null,
          recommended_alternatives: [],
          notify_client_on_delete: true,
          requires_audit: true,
          attachments: {
            total_count: 3,
            exclusive_count: 1,
            shared_preserved_count: 2,
            retained_preserved_count: 0,
          },
          backend_ready: true,
        }),
      );
      return;
    }
    if (mode === 'storage_failed') {
      res.end(
        JSON.stringify({
          operation_id: OP_ID,
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000999',
          status: 'storage_cleanup_failed',
          db_deleted: true,
          storage_cleanup_completed: false,
          attachments_removed: 0,
          attachments_preserved: 2,
          client_notified: true,
          audit_recorded: true,
          message: 'Falha ao remover anexo exclusivo no Storage.',
        }),
      );
      return;
    }
    if (mode === 'false_completed_without_storage') {
      // Simula bug upstream tentando reportar completed sem storage_cleanup_completed
      res.end(
        JSON.stringify({
          operation_id: OP_ID,
          request_id: REQUEST_ID,
          protocol: 'JN-2026-000999',
          status: 'completed',
          db_deleted: true,
          storage_cleanup_completed: false,
          attachments_removed: 0,
          attachments_preserved: 2,
          client_notified: true,
          audit_recorded: true,
        }),
      );
      return;
    }
    res.end(
      JSON.stringify({
        operation_id: OP_ID,
        request_id: REQUEST_ID,
        protocol: 'JN-2026-000999',
        status: 'completed',
        db_deleted: true,
        storage_cleanup_completed: true,
        attachments_removed: 1,
        attachments_preserved: 2,
        client_notified: false,
        audit_recorded: false,
        message: 'Solicitação excluída definitivamente.',
      }),
    );
  });

  await new Promise<void>((r) => provider.listen(0, '127.0.0.1', r));
  const old = [process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_PUBLISHABLE_KEY];
  process.env.VITE_SUPABASE_URL = `http://127.0.0.1:${(provider.address() as { port: number }).port}`;
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fixture';
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/request-deletion`;

  const send = (path: string, body: unknown, auth = true) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: 'Bearer fixture' } : {}) },
      body: JSON.stringify(body),
    });

  const execPayload = {
    office_id: OFFICE_ID,
    expected_version: 3,
    expected_status: 'em_atendimento',
    idempotency_key: 'del-key-00000001',
    confirmation_ack: true,
  };

  try {
    // Cenário 5: chamada sem autenticação -> 401
    assert.equal((await send(`/${REQUEST_ID}/execute`, execPayload, false)).status, 401);

    // Payload inválido / sem confirmation_ack -> 422
    assert.equal((await send(`/${REQUEST_ID}/execute`, { ...execPayload, confirmation_ack: false })).status, 422);

    // Gate fail-closed antes da IA 2 provisionar RPC
    mode = 'missing_rpc';
    const eligMissing = await send(`/${REQUEST_ID}/eligibility`, { office_id: OFFICE_ID });
    assert.equal(eligMissing.status, 200);
    const eligMissingJson = await eligMissing.json();
    assert.equal(eligMissingJson.data.backend_ready, false);
    assert.equal(eligMissingJson.data.eligible, false);
    assert.equal((await send(`/${REQUEST_ID}/execute`, execPayload)).status, 503);

    // Cenário 8: elegibilidade diferencia anexos exclusivos e compartilhados preservados
    mode = 'eligible_shared';
    const eligShared = await (await send(`/${REQUEST_ID}/eligibility`, { office_id: OFFICE_ID })).json();
    assert.equal(eligShared.data.eligible, true);
    assert.equal(eligShared.data.attachments.exclusive_count, 1);
    assert.equal(eligShared.data.attachments.shared_preserved_count, 2);

    // Cenário 5: usuário sem permissão -> 403
    mode = 'forbidden';
    assert.equal((await send(`/${REQUEST_ID}/execute`, execPayload)).status, 403);

    // Cenário 6: exclusão concorrente -> 409
    mode = 'conflict_concurrent';
    assert.equal((await send(`/${REQUEST_ID}/execute`, execPayload)).status, 409);

    // Cenário 7: status/versão mudou antes da confirmação -> 409
    mode = 'conflict_status_changed';
    assert.equal((await send(`/${REQUEST_ID}/execute`, execPayload)).status, 409);

    // Cenário 9: falha no Storage -> NÃO conclui como sucesso completo
    mode = 'storage_failed';
    const failedStorage = await (await send(`/${REQUEST_ID}/execute`, execPayload)).json();
    assert.equal(failedStorage.data.status, 'storage_cleanup_failed');
    assert.equal(failedStorage.data.storage_cleanup_completed, false);

    // Proteção extra no gateway: se upstream tentar reportar completed com storage_cleanup_completed=false, rebaixa para processing (202)
    mode = 'false_completed_without_storage';
    const downgraded = await send(`/${REQUEST_ID}/execute`, execPayload);
    assert.equal(downgraded.status, 202);
    const downgradedJson = await downgraded.json();
    assert.equal(downgradedJson.data.status, 'processing');

    // Cenário 11: autoexclusão do cliente concluída com audit_recorded=false e consulta de status
    mode = 'client_self_deleted';
    const done = await (await send(`/${REQUEST_ID}/execute`, execPayload)).json();
    assert.equal(done.data.status, 'completed');
    assert.equal(done.data.audit_recorded, false);
    assert.equal(done.data.attachments_preserved, 2);
    const statusRes = await send(`/${REQUEST_ID}/status`, {
      office_id: OFFICE_ID,
      idempotency_key: execPayload.idempotency_key,
    });
    assert.equal(statusRes.status, 200);
  } finally {
    for (const [i, k] of ['VITE_SUPABASE_URL', 'VITE_SUPABASE_PUBLISHABLE_KEY'].entries()) {
      if (old[i] === undefined) delete process.env[k];
      else process.env[k] = old[i];
    }
    server.closeAllConnections();
    server.close();
    provider.closeAllConnections();
    provider.close();
  }
});
