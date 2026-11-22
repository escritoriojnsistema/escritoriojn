import { Router, json, type Response } from 'express';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import {
  deletionBlockMessages,
  isValidDeleteRequestInput,
  isValidIdempotencyKey,
  type DeletionBlockReason,
  type RequestDeletionEligibility,
  type RequestDeletionResult,
} from '../../../shared/requestDeletion.js';

export const requestDeletionRouter = Router();

requestDeletionRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.vary('Authorization');
  next();
});

requestDeletionRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) {
    res.locals.deletionAuth = auth;
    next();
  }
});

requestDeletionRouter.use(
  (req, res, next) => {
    if (!req.is('application/json')) {
      errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
      return;
    }
    next();
  },
  json({ limit: '8kb' }),
);

type DeletionAuth = NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;

const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

const STATUS_MAP: Record<string, number> = {
  AUTH_REQUIRED: 401,
  DELETION_FORBIDDEN: 403,
  REQUESTS_FORBIDDEN: 403,
  REQUEST_NOT_FOUND: 404,
  DELETION_OPERATION_NOT_FOUND: 404,
  DELETION_CONFLICT: 409,
  REQUEST_CONFLICT: 409,
  REQUEST_DELETION_PENDING: 409,
  CONCURRENT_OPERATION: 409,
  DELETION_BLOCKED: 422,
  DELETION_VALIDATION: 422,
  DELETION_RATE_LIMIT: 429,
};

function mapSafeError(res: Response, error: { code?: string; message?: string }) {
  if (error.code && RPC_MISSING_CODES.has(error.code)) {
    errorResponse(
      res,
      503,
      'DELETION_BACKEND_NOT_PROVISIONED',
      deletionBlockMessages.BACKEND_NOT_PROVISIONED,
    );
    return;
  }
  const msg = error.message ?? '';
  const status = STATUS_MAP[msg];
  if (status && error.code === `PT${status}`) {
    const safeMessages: Record<number, string> = {
      401: 'Entre novamente para continuar.',
      403: 'Seu acesso não permite excluir esta solicitação definitivamente.',
      404: 'Solicitação ou operação não disponível no seu escopo.',
      409: 'A solicitação foi alterada ou já possui exclusão em andamento. Atualize a tela antes de tentar novamente.',
      422: 'Esta solicitação não atende às regras de exclusão definitiva.',
      429: 'Muitas tentativas em sequência. Aguarde alguns instantes.',
    };
    errorResponse(res, status, msg, safeMessages[status] ?? 'Não foi possível concluir a exclusão.');
    return;
  }
  if (error.code === 'PT422' && Object.hasOwn(deletionBlockMessages,msg)) {
    const reason = msg as DeletionBlockReason;
    errorResponse(res, 422, reason, deletionBlockMessages[reason]);
    return;
  }
  if (error.code === '23503' || error.code === '23001') {
    errorResponse(res,422,'DELETION_BLOCKED','A solicitação possui um registro vinculado que precisa ser preservado.');
    return;
  }
  errorResponse(res, 503, 'DELETION_UNAVAILABLE', 'O serviço de exclusão está temporariamente indisponível. Confira a situação antes de tentar novamente.');
}

function projectEligibility(raw: unknown): RequestDeletionEligibility {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid eligibility payload');
  }
  const d = raw as Record<string, unknown>;
  if (
    typeof d.request_id !== 'string' ||
    typeof d.office_id !== 'string' ||
    typeof d.protocol !== 'string' ||
    typeof d.title !== 'string' ||
    typeof d.status !== 'string' ||
    typeof d.version !== 'number' ||
    (d.actor_kind !== 'client' && d.actor_kind !== 'team') ||
    typeof d.eligible !== 'boolean' ||
    typeof d.can_show_action !== 'boolean'
  ) {
    throw new Error('Invalid eligibility fields');
  }
  const att = (d.attachments && typeof d.attachments === 'object' ? d.attachments : {}) as Record<string, unknown>;
  const blockReason =
    typeof d.block_reason === 'string' && Object.hasOwn(deletionBlockMessages,d.block_reason)
      ? (d.block_reason as DeletionBlockReason)
      : null;

  return {
    request_id: d.request_id,
    office_id: d.office_id,
    protocol: d.protocol,
    title: d.title,
    status: d.status as RequestDeletionEligibility['status'],
    version: d.version,
    actor_kind: d.actor_kind,
    eligible: d.eligible,
    can_show_action: d.can_show_action,
    block_reason: blockReason,
    block_message:
      typeof d.block_message === 'string' && d.block_message.trim()
        ? d.block_message.trim()
        : blockReason
          ? deletionBlockMessages[blockReason]
          : null,
    recommended_alternatives: Array.isArray(d.recommended_alternatives)
      ? d.recommended_alternatives.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).slice(0, 5)
      : [],
    notify_client_on_delete: Boolean(d.notify_client_on_delete),
    requires_audit: Boolean(d.requires_audit),
    attachments: {
      total_count: Number.isSafeInteger(att.total_count) ? Number(att.total_count) : 0,
      exclusive_count: Number.isSafeInteger(att.exclusive_count) ? Number(att.exclusive_count) : 0,
      shared_preserved_count: Number.isSafeInteger(att.shared_preserved_count) ? Number(att.shared_preserved_count) : 0,
      retained_preserved_count: Number.isSafeInteger(att.retained_preserved_count) ? Number(att.retained_preserved_count) : 0,
    },
    backend_ready: d.backend_ready !== false,
  };
}

function projectDeletionResult(raw: unknown): RequestDeletionResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid deletion result payload');
  }
  const d = raw as Record<string, unknown>;
  const validStatus =
    d.status === 'processing' || d.status === 'storage_cleanup_failed' || d.status === 'completed';
  if (
    typeof d.operation_id !== 'string' ||
    typeof d.request_id !== 'string' ||
    typeof d.protocol !== 'string' ||
    !validStatus ||
    typeof d.db_deleted !== 'boolean' ||
    typeof d.storage_cleanup_completed !== 'boolean'
  ) {
    throw new Error('Invalid deletion result fields');
  }
  // Never report completed unless both DB deletion and storage cleanup are confirmed
  const rawStatus = d.status as RequestDeletionResult['status'];
  const safeStatus: RequestDeletionResult['status'] =
    rawStatus === 'completed' && (!d.db_deleted || !d.storage_cleanup_completed)
      ? 'processing'
      : rawStatus;

  return {
    operation_id: d.operation_id,
    request_id: d.request_id,
    protocol: d.protocol,
    status: safeStatus,
    db_deleted: d.db_deleted,
    storage_cleanup_completed: d.storage_cleanup_completed,
    attachments_removed: Number.isSafeInteger(d.attachments_removed) ? Number(d.attachments_removed) : 0,
    attachments_preserved: Number.isSafeInteger(d.attachments_preserved) ? Number(d.attachments_preserved) : 0,
    client_notified: Boolean(d.client_notified),
    audit_recorded: Boolean(d.audit_recorded),
    message:
      typeof d.message === 'string' && d.message.trim()
        ? d.message.trim()
        : safeStatus === 'completed'
          ? 'Solicitação excluída definitivamente.'
          : safeStatus === 'storage_cleanup_failed'
            ? 'A limpeza dos arquivos anexos encontrou uma falha e permanece em acompanhamento.'
            : 'Exclusão em processamento. Aguarde a confirmação final.',
    idempotent_replay: Boolean(d.idempotent_replay),
  };
}

async function resumeCleanup(auth: DeletionAuth, officeId: string, key: string, result: RequestDeletionResult) {
  if (result.status === 'completed' || !uuid(result.operation_id)) return result;
  try {
    const response = await fetch(new URL('/functions/v1/request-deletion-cleanup', auth.url), {
      method: 'POST',
      headers: { Authorization: `Bearer ${auth.token}`, apikey: auth.key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ office_id: officeId, operation_id: result.operation_id }),
      redirect: 'error',
      signal: AbortSignal.timeout(6000),
    });
    await response.body?.cancel();
    if (!response.ok) return result;
    const {data,error} = await auth.client.rpc('request_deletion_status', {
      p_office_id: officeId,
      p_request_id: result.request_id,
      p_idempotency_key: key,
    });
    if (!error) {
      const current = projectDeletionResult(data);
      if (current.operation_id === result.operation_id && current.request_id === result.request_id) {
        return { ...current, idempotent_replay: result.idempotent_replay };
      }
    }
  } catch {
    // The saved SQL operation can be checked and resumed after an unavailable worker.
  }
  return result;
}

/**
 * POST /api/request-deletion/:id/eligibility
 * Authoritative eligibility & block reason check before rendering/enabling delete action.
 */
requestDeletionRouter.post('/:id/eligibility', async (req, res) => {
  const requestId = req.params.id;
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !uuid(requestId) || !fields(b, ['office_id']) || !uuid(b.office_id)) {
    errorResponse(res, 422, 'DELETION_VALIDATION', 'Informe o escritório e a solicitação corretamente.');
    return;
  }

  try {
    const { client } = res.locals.deletionAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('request_deletion_eligibility', {
      p_office_id: b.office_id,
      p_request_id: requestId,
    });
    if (error) {
      if (error.code && RPC_MISSING_CODES.has(error.code)) {
        res.json({
          data: {
            request_id: requestId,
            office_id: b.office_id,
            protocol: '',
            title: '',
            status: 'aberto',
            version: 0,
            actor_kind: 'team',
            eligible: false,
            can_show_action: false,
            block_reason: 'BACKEND_NOT_PROVISIONED',
            block_message: deletionBlockMessages.BACKEND_NOT_PROVISIONED,
            recommended_alternatives: [],
            notify_client_on_delete: false,
            requires_audit: false,
            attachments: {
              total_count: 0,
              exclusive_count: 0,
              shared_preserved_count: 0,
              retained_preserved_count: 0,
            },
            backend_ready: false,
          } satisfies RequestDeletionEligibility,
        });
        return;
      }
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectEligibility(data) });
  } catch {
    errorResponse(res, 503, 'DELETION_UNAVAILABLE', 'Não foi possível verificar a elegibilidade de exclusão.');
  }
});

/**
 * POST /api/request-deletion/:id/execute
 * Executes permanent request deletion with version/status/idempotency/confirmation guards.
 */
requestDeletionRouter.post('/:id/execute', async (req, res) => {
  const requestId = req.params.id;
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !uuid(requestId) || !isValidDeleteRequestInput(b)) {
    errorResponse(
      res,
      422,
      'DELETION_VALIDATION',
      'Confira a versão, situação, confirmação explícita e chave de segurança antes de excluir.',
    );
    return;
  }

  try {
    const auth = res.locals.deletionAuth as DeletionAuth;
    const { data, error } = await auth.client.rpc('request_delete_permanently', {
      p_office_id: b.office_id,
      p_request_id: requestId,
      p_expected_version: b.expected_version,
      p_expected_status: b.expected_status,
      p_idempotency_key: b.idempotency_key,
      p_confirmation_ack: true,
      p_client_verification_token: b.client_verification_token ?? null,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    const result = await resumeCleanup(auth,b.office_id,b.idempotency_key,projectDeletionResult(data));
    res.status(result.status === 'processing' ? 202 : 200).json({ data: result });
  } catch {
    errorResponse(res, 503, 'DELETION_UNAVAILABLE', 'Não foi possível concluir a exclusão definitiva. Verifique o estado antes de repetir.');
  }
});

/**
 * POST /api/request-deletion/:id/status
 * Recovers authoritative status after lost response, timeout, or pending storage cleanup.
 */
requestDeletionRouter.post('/:id/status', async (req, res) => {
  const requestId = req.params.id;
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !uuid(requestId) ||
    !fields(b, ['office_id', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'DELETION_VALIDATION', 'Informe os dados da operação de exclusão.');
    return;
  }

  try {
    const auth = res.locals.deletionAuth as DeletionAuth;
    const { data, error } = await auth.client.rpc('request_deletion_status', {
      p_office_id: b.office_id,
      p_request_id: requestId,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: await resumeCleanup(auth,b.office_id,b.idempotency_key,projectDeletionResult(data)) });
  } catch {
    errorResponse(res, 503, 'DELETION_UNAVAILABLE', 'Não foi possível consultar o resultado da exclusão.');
  }
});
