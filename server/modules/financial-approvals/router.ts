import { Router, json, type Response } from 'express';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import { positive, requestText } from '../requests/validation.js';
import { isValidIdempotencyKey } from '../../../shared/requestDeletion.js';
import {
  financialApprovalKinds,
  financialApprovalStatuses,
  isValidIsoDate,
  type EligibleApprover,
  type FinancialApprovalItem,
  type FinancialApprovalKind,
  type FinancialApprovalStatus,
} from '../../../shared/financialApprovals.js';

export const financialApprovalsRouter = Router();

financialApprovalsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.vary('Authorization');
  next();
});

financialApprovalsRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) {
    res.locals.approvalsAuth = auth;
    next();
  }
});

financialApprovalsRouter.use(
  (req, res, next) => {
    if (!req.is('application/json')) {
      errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
      return;
    }
    next();
  },
  json({ limit: '16kb' }),
);

const RPC_MISSING_CODES = new Set(['PGRST202', '42883']);

const STATUS_MAP: Record<string, number> = {
  AUTH_REQUIRED: 401,
  APPROVAL_FORBIDDEN: 403,
  PERMISSION_REVOKED: 403,
  WRONG_APPROVER: 403,
  APPROVAL_NOT_FOUND: 404,
  CHARGE_NOT_FOUND: 404,
  APPROVAL_CONFLICT: 409,
  CHARGE_CHANGED: 409,
  ALREADY_DECIDED: 409,
  ALREADY_EXECUTED: 409,
  APPROVAL_EXPIRED: 409,
  APPROVAL_VALIDATION: 422,
  CASH_SESSION_CLOSED: 422,
};

function mapSafeError(res: Response, error: { code?: string; message?: string }) {
  if (error.code && RPC_MISSING_CODES.has(error.code)) {
    errorResponse(
      res,
      503,
      'APPROVALS_BACKEND_NOT_PROVISIONED',
      'O fluxo de autorizações financeiras está aguardando ativação no banco de dados.',
    );
    return;
  }
  const msg = error.message ?? '';
  const status = STATUS_MAP[msg];
  if (status && error.code === `PT${status}`) {
    const safeMessages: Record<number, string> = {
      401: 'Entre novamente para continuar.',
      403: 'Seu acesso não permite realizar ou aprovar esta solicitação.',
      404: 'Autorização ou cobrança não disponível no seu escopo.',
      409: 'A cobrança ou autorização foi alterada, expirou ou já foi utilizada. Atualize a tela.',
      422: 'Confira os valores, o aprovador selecionado e a justificativa.',
    };
    errorResponse(res, status, msg, safeMessages[status] ?? 'Não foi possível concluir a autorização.');
    return;
  }
  errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível concluir a operação de autorização.');
}

function projectApprover(raw: unknown): EligibleApprover {
  const d = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const role = d.role_code === 'owner' ? 'owner' : 'admin';
  return {
    membership_id: String(d.membership_id ?? ''),
    user_id: String(d.user_id ?? ''),
    name: String(d.name ?? ''),
    role_code: role,
    role_label: role === 'owner' ? 'Super administrador' : 'Administrador',
  };
}

function projectApprovalItem(raw: unknown): FinancialApprovalItem {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Invalid approval item');
  }
  const d = raw as Record<string, unknown>;
  const kind: FinancialApprovalKind = financialApprovalKinds.includes(d.kind as FinancialApprovalKind)
    ? (d.kind as FinancialApprovalKind)
    : 'manual_payment';
  const status: FinancialApprovalStatus = financialApprovalStatuses.includes(d.status as FinancialApprovalStatus)
    ? (d.status as FinancialApprovalStatus)
    : 'pending';

  return {
    id: String(d.id ?? ''),
    office_id: String(d.office_id ?? ''),
    kind,
    status,
    charge_id: String(d.charge_id ?? ''),
    charge_version_snapshot: Number.isSafeInteger(d.charge_version_snapshot) ? Number(d.charge_version_snapshot) : 1,
    request_id: String(d.request_id ?? ''),
    protocol: String(d.protocol ?? ''),
    customer_name: String(d.customer_name ?? ''),
    service_summary: String(d.service_summary ?? ''),
    requester_user_id: String(d.requester_user_id ?? ''),
    requester_name: String(d.requester_name ?? ''),
    approver_user_id: String(d.approver_user_id ?? ''),
    approver_name: String(d.approver_name ?? ''),
    original_cents: Number.isSafeInteger(d.original_cents) ? Number(d.original_cents) : 0,
    requested_amount_cents: Number.isSafeInteger(d.requested_amount_cents) ? Number(d.requested_amount_cents) : 0,
    discount_cents: Number.isSafeInteger(d.discount_cents) ? Number(d.discount_cents) : null,
    discount_percent: typeof d.discount_percent === 'number' && Number.isFinite(d.discount_percent) ? d.discount_percent : null,
    final_cents: Number.isSafeInteger(d.final_cents) ? Number(d.final_cents) : 0,
    card_fee_cents: Number.isSafeInteger(d.card_fee_cents) ? Number(d.card_fee_cents) : 0,
    payment_method_id: typeof d.payment_method_id === 'string' ? d.payment_method_id : null,
    payment_method_name: typeof d.payment_method_name === 'string' ? d.payment_method_name : null,
    session_id: typeof d.session_id === 'string' ? d.session_id : null,
    unit_id: typeof d.unit_id === 'string' ? d.unit_id : null,
    unit_name: typeof d.unit_name === 'string' ? d.unit_name : null,
    destination_account_id: typeof d.destination_account_id === 'string' ? d.destination_account_id : null,
    destination_account_name: typeof d.destination_account_name === 'string' ? d.destination_account_name : null,
    operation_date: typeof d.operation_date === 'string' ? d.operation_date : null,
    external_reference: typeof d.external_reference === 'string' ? d.external_reference : null,
    justification: String(d.justification ?? ''),
    decision_note: typeof d.decision_note === 'string' ? d.decision_note : null,
    created_at: String(d.created_at ?? ''),
    expires_at: String(d.expires_at ?? ''),
    decided_at: typeof d.decided_at === 'string' ? d.decided_at : null,
    executed_at: typeof d.executed_at === 'string' ? d.executed_at : null,
    can_decide: Boolean(d.can_decide),
    can_execute: Boolean(d.can_execute),
    invalidation_reason: typeof d.invalidation_reason === 'string' ? d.invalidation_reason : null,
  };
}

/**
 * POST /api/financial-approvals/approvers
 * Returns backend-filtered eligible office approvers for manual_payment or discount.
 */
financialApprovalsRouter.post('/approvers', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'kind']) ||
    !uuid(b.office_id) ||
    !financialApprovalKinds.includes(b.kind as FinancialApprovalKind)
  ) {
    errorResponse(res, 422, 'APPROVAL_VALIDATION', 'Informe o escritório e o tipo de autorização.');
    return;
  }

  try {
    const { client } = res.locals.approvalsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('financial_approval_eligible_approvers', {
      p_office_id: b.office_id,
      p_kind: b.kind,
    });
    if (error) {
      if (error.code && RPC_MISSING_CODES.has(error.code)) {
        res.json({ data: { items: [], backend_ready: false } });
        return;
      }
      mapSafeError(res, error);
      return;
    }
    const items = Array.isArray(data) ? data.map(projectApprover) : [];
    res.json({ data: { items, backend_ready: true } });
  } catch {
    errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível listar aprovadores elegíveis.');
  }
});

/**
 * POST /api/financial-approvals/list
 */
financialApprovalsRouter.post('/list', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, ['office_id', 'scope', 'kind', 'page']) ||
    !uuid(b.office_id) ||
    !['all', 'assigned_to_me', 'requested_by_me'].includes(String(b.scope)) ||
    !(b.kind === 'all' || financialApprovalKinds.includes(b.kind as FinancialApprovalKind)) ||
    !positive(b.page)
  ) {
    errorResponse(res, 422, 'APPROVAL_VALIDATION', 'Filtros inválidos para listar autorizações.');
    return;
  }

  try {
    const { client } = res.locals.approvalsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('financial_approvals_page', {
      p_office_id: b.office_id,
      p_scope: b.scope,
      p_kind: b.kind === 'all' ? null : b.kind,
      p_page: b.page,
    });
    if (error) {
      if (error.code && RPC_MISSING_CODES.has(error.code)) {
        res.json({ data: { items: [], total: 0, page: 1, page_size: 5, backend_ready: false } });
        return;
      }
      mapSafeError(res, error);
      return;
    }
    const d = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
    res.json({
      data: {
        items: Array.isArray(d.items) ? d.items.map(projectApprovalItem) : [],
        total: Number.isSafeInteger(d.total) ? Number(d.total) : 0,
        page: Number.isSafeInteger(d.page) ? Number(d.page) : 1,
        page_size: Number.isSafeInteger(d.page_size) ? Number(d.page_size) : 5,
        backend_ready: true,
      },
    });
  } catch {
    errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível carregar as solicitações de autorização.');
  }
});

/**
 * POST /api/financial-approvals/manual-payment/request (Etapa 4)
 */
financialApprovalsRouter.post('/manual-payment/request', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'charge_id',
      'charge_version',
      'request_id',
      'session_id',
      'unit_id',
      'destination_account_id',
      'payment_method_id',
      'approver_user_id',
      'amount_cents',
      'operation_date',
      'external_reference',
      'justification',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !uuid(b.charge_id) ||
    !positive(b.charge_version, 2147483645) ||
    !uuid(b.request_id) ||
    !uuid(b.session_id) ||
    !uuid(b.unit_id) ||
    !(b.destination_account_id === null || uuid(b.destination_account_id)) ||
    !uuid(b.payment_method_id) ||
    !uuid(b.approver_user_id) ||
    !positive(b.amount_cents, 1000000000) ||
    !isValidIsoDate(b.operation_date) ||
    !(
      b.external_reference === null ||
      b.external_reference === '' ||
      (typeof b.external_reference === 'string' &&
        b.external_reference.trim().length <= 120 &&
        !/[\r\n\0]/.test(b.external_reference))
    ) ||
    !requestText(b.justification, 300) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(
      res,
      422,
      'APPROVAL_VALIDATION',
      'Preencha o valor, a forma de pagamento, a data da operação, o aprovador e a justificativa.',
    );
    return;
  }

  try {
    const { client } = res.locals.approvalsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('financial_approval_request_manual_payment', {
      p_office_id: b.office_id,
      p_charge_id: b.charge_id,
      p_charge_version: b.charge_version,
      p_request_id: b.request_id,
      p_session_id: b.session_id,
      p_unit_id: b.unit_id,
      p_destination_account_id: b.destination_account_id,
      p_payment_method_id: b.payment_method_id,
      p_approver_user_id: b.approver_user_id,
      p_amount_cents: b.amount_cents,
      p_operation_date: String(b.operation_date).trim(),
      p_external_reference:
        typeof b.external_reference === 'string' && b.external_reference.trim()
          ? b.external_reference.trim()
          : null,
      p_justification: String(b.justification).trim(),
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.status(201).json({ data: projectApprovalItem(data) });
  } catch {
    errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível enviar o pedido de autorização de pagamento.');
  }
});

/**
 * POST /api/financial-approvals/discount/request (Etapa 5)
 */
financialApprovalsRouter.post('/discount/request', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !fields(b, [
      'office_id',
      'charge_id',
      'charge_version',
      'request_id',
      'approver_user_id',
      'mode',
      'discount_cents',
      'discount_percent',
      'justification',
      'idempotency_key',
    ]) ||
    !uuid(b.office_id) ||
    !uuid(b.charge_id) ||
    !positive(b.charge_version, 2147483645) ||
    !uuid(b.request_id) ||
    !uuid(b.approver_user_id) ||
    (b.mode !== 'amount_cents' && b.mode !== 'percent') ||
    !positive(b.discount_cents, 1000000000) ||
    !(b.discount_percent === null || (typeof b.discount_percent === 'number' && Number.isFinite(b.discount_percent) && b.discount_percent > 0 && b.discount_percent <= 100)) ||
    !requestText(b.justification, 300) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'APPROVAL_VALIDATION', 'Informe um desconto válido, o aprovador e a justificativa.');
    return;
  }

  try {
    const { client } = res.locals.approvalsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('financial_approval_request_discount', {
      p_office_id: b.office_id,
      p_charge_id: b.charge_id,
      p_charge_version: b.charge_version,
      p_request_id: b.request_id,
      p_approver_user_id: b.approver_user_id,
      p_mode: b.mode,
      p_discount_cents: b.discount_cents,
      p_discount_percent: b.discount_percent,
      p_justification: String(b.justification).trim(),
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.status(201).json({ data: projectApprovalItem(data) });
  } catch {
    errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível enviar o pedido de autorização de desconto.');
  }
});

/**
 * POST /api/financial-approvals/:id/decide
 */
financialApprovalsRouter.post('/:id/decide', async (req, res) => {
  const approvalId = req.params.id;
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !uuid(approvalId) ||
    !fields(b, ['office_id', 'decision', 'expected_charge_version', 'note', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    (b.decision !== 'approve' && b.decision !== 'reject') ||
    !positive(b.expected_charge_version, 2147483645) ||
    !(b.note === null || b.note === '' || requestText(b.note, 300)) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'APPROVAL_VALIDATION', 'Confira a decisão e a observação informada.');
    return;
  }

  try {
    const { client } = res.locals.approvalsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('financial_approval_decide', {
      p_office_id: b.office_id,
      p_approval_id: approvalId,
      p_decision: b.decision,
      p_expected_charge_version: b.expected_charge_version,
      p_note: typeof b.note === 'string' && b.note.trim() ? b.note.trim() : null,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectApprovalItem(data) });
  } catch {
    errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível registrar a decisão.');
  }
});

/**
 * POST /api/financial-approvals/:id/execute-payment
 * Executes an approved manual payment strictly once inside an open cash session.
 */
financialApprovalsRouter.post('/:id/execute-payment', async (req, res) => {
  const approvalId = req.params.id;
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !uuid(approvalId) ||
    !fields(b, ['office_id', 'session_id', 'expected_charge_version', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    !uuid(b.session_id) ||
    !positive(b.expected_charge_version, 2147483645) ||
    !isValidIdempotencyKey(b.idempotency_key)
  ) {
    errorResponse(res, 422, 'APPROVAL_VALIDATION', 'Confira os dados do caixa e da autorização antes de concluir.');
    return;
  }

  try {
    const { client } = res.locals.approvalsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc('financial_approval_execute_manual_payment', {
      p_office_id: b.office_id,
      p_approval_id: approvalId,
      p_session_id: b.session_id,
      p_expected_charge_version: b.expected_charge_version,
      p_idempotency_key: b.idempotency_key,
    });
    if (error) {
      mapSafeError(res, error);
      return;
    }
    res.json({ data: projectApprovalItem(data) });
  } catch {
    errorResponse(res, 503, 'APPROVALS_UNAVAILABLE', 'Não foi possível executar o pagamento autorizado.');
  }
});
