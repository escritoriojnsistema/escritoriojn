import type { RequestStatus } from './requests.js';

export type RequestOriginChannel = 'presencial' | 'whatsapp' | 'portal';
export type DeletionActorKind = 'client' | 'team';

export type DeletionBlockReason =
  | 'PAYMENT_CONFIRMED'
  | 'REFUND_LINKED'
  | 'RECEIPT_ISSUED'
  | 'FORMALIZED_DOCUMENT'
  | 'DELIVERY_REGISTERED'
  | 'LEGAL_RETENTION'
  | 'CONTROL_WITH_CLIENT'
  | 'CONTROL_WITH_TEAM'
  | 'INSUFFICIENT_PERMISSION'
  | 'CLIENT_UNVERIFIED_CHANNEL'
  | 'STATUS_NOT_ELIGIBLE'
  | 'CONCURRENT_OPERATION'
  | 'BACKEND_NOT_PROVISIONED';

export type DeletionJobStatus =
  | 'eligible'
  | 'blocked'
  | 'processing'
  | 'storage_cleanup_failed'
  | 'completed';

export type DeletionAttachmentImpact = {
  total_count: number;
  exclusive_count: number;
  shared_preserved_count: number;
  retained_preserved_count: number;
};

export type RequestDeletionEligibility = {
  request_id: string;
  office_id: string;
  protocol: string;
  title: string;
  status: RequestStatus;
  version: number;
  actor_kind: DeletionActorKind;
  eligible: boolean;
  can_show_action: boolean;
  block_reason: DeletionBlockReason | null;
  block_message: string | null;
  recommended_alternatives: string[];
  notify_client_on_delete: boolean;
  requires_audit: boolean;
  attachments: DeletionAttachmentImpact;
  backend_ready: boolean;
};

export type RequestDeletionExecuteInput = {
  office_id: string;
  expected_version: number;
  expected_status: RequestStatus;
  idempotency_key: string;
  confirmation_ack: true;
  client_verification_token?: string | null;
};

export type RequestDeletionResult = {
  operation_id: string;
  request_id: string;
  protocol: string;
  status: Exclude<DeletionJobStatus, 'eligible' | 'blocked'>;
  db_deleted: boolean;
  storage_cleanup_completed: boolean;
  attachments_removed: number;
  attachments_preserved: number;
  client_notified: boolean;
  audit_recorded: boolean;
  message: string;
  idempotent_replay?: boolean;
};

export type EligibilityEvaluationInput = {
  actor_kind: DeletionActorKind;
  is_request_owner_client: boolean;
  is_authenticated_portal_client: boolean;
  channel: RequestOriginChannel;
  status: RequestStatus;
  has_attendant: boolean;
  is_client_preparation?: boolean;
  team_role?: 'owner' | 'admin' | 'employee' | null;
  team_has_delete_permission?: boolean;
  has_confirmed_payment: boolean;
  has_linked_refund: boolean;
  has_issued_receipt: boolean;
  has_formalized_document: boolean;
  has_registered_delivery: boolean;
  has_legal_retention: boolean;
  client_identity_verified_for_channel?: boolean;
  concurrent_deletion_in_progress?: boolean;
};

export const deletionBlockMessages: Record<DeletionBlockReason, string> = {
  PAYMENT_CONFIRMED:
    'Esta solicitação possui pagamento confirmado e não pode ser excluída definitivamente.',
  REFUND_LINKED:
    'Esta solicitação possui reembolso ou estorno vinculado e precisa permanecer no histórico financeiro.',
  RECEIPT_ISSUED:
    'Esta solicitação já possui recibo emitido e não pode ser removida definitivamente.',
  FORMALIZED_DOCUMENT:
    'Esta solicitação possui documento formalizado ou assinado e não pode ser excluída.',
  DELIVERY_REGISTERED:
    'Esta solicitação possui entrega documental registrada e precisa ser preservada.',
  LEGAL_RETENTION:
    'Esta solicitação está protegida por obrigação legal, retenção ou guarda documental ativa.',
  CONTROL_WITH_CLIENT:
    'A solicitação ainda está sob controle do cliente antes do envio. Somente o titular pode excluí-la nesta etapa.',
  CONTROL_WITH_TEAM:
    'Esta solicitação já está em atendimento pela equipe do escritório e não pode mais ser excluída pelo cliente.',
  INSUFFICIENT_PERMISSION:
    'Seu perfil não possui permissão para excluir solicitações definitivamente.',
  CLIENT_UNVERIFIED_CHANNEL:
    'Para solicitações abertas por atendimento presencial ou WhatsApp sem conta autenticada, é necessária confirmação de identidade verificada.',
  STATUS_NOT_ELIGIBLE:
    'A situação atual da solicitação não permite exclusão definitiva.',
  CONCURRENT_OPERATION:
    'Já existe uma operação de exclusão em andamento para esta solicitação. Aguarde a conclusão.',
  BACKEND_NOT_PROVISIONED:
    'A exclusão definitiva ainda está aguardando ativação da persistência no servidor.',
};

const TEAM_DELETABLE_STATUSES: ReadonlySet<RequestStatus> = new Set([
  'aberto',
  'em_atendimento',
  'aguardando_cliente',
  'aguardando_responsavel',
  'cancelado',
]);

export function evaluateRequestDeletionEligibility(
  input: EligibilityEvaluationInput,
): {
  eligible: boolean;
  can_show_action: boolean;
  block_reason: DeletionBlockReason | null;
  block_message: string | null;
  recommended_alternatives: string[];
  notify_client_on_delete: boolean;
  requires_audit: boolean;
} {
  if (input.concurrent_deletion_in_progress) {
    return {
      eligible: false,
      can_show_action: true,
      block_reason: 'CONCURRENT_OPERATION',
      block_message: deletionBlockMessages.CONCURRENT_OPERATION,
      recommended_alternatives: ['Aguardar a confirmação da operação em andamento'],
      notify_client_on_delete: false,
      requires_audit: false,
    };
  }

  // Absolute legal / financial / documentary blocks apply to every actor (Situation E)
  const absoluteChecks: Array<[boolean, DeletionBlockReason, string[]]> = [
    [input.has_confirmed_payment, 'PAYMENT_CONFIRMED', ['Cancelar atendimento', 'Consultar financeiro e recibos']],
    [input.has_linked_refund, 'REFUND_LINKED', ['Consultar histórico financeiro']],
    [input.has_issued_receipt, 'RECEIPT_ISSUED', ['Consultar recibo emitido', 'Manter registro arquivado']],
    [input.has_formalized_document, 'FORMALIZED_DOCUMENT', ['Arquivar atendimento após conclusão', 'Consultar documento formalizado']],
    [input.has_registered_delivery, 'DELIVERY_REGISTERED', ['Consultar registro de entrega']],
    [input.has_legal_retention, 'LEGAL_RETENTION', ['Manter sob guarda documental', 'Arquivar solicitação']],
  ];

  for (const [triggered, reason, alternatives] of absoluteChecks) {
    if (triggered) {
      const canShow =
        input.actor_kind === 'team'
          ? Boolean(input.team_has_delete_permission || input.team_role === 'owner' || input.team_role === 'admin')
          : input.is_request_owner_client;
      return {
        eligible: false,
        can_show_action: canShow,
        block_reason: reason,
        block_message: deletionBlockMessages[reason],
        recommended_alternatives: alternatives,
        notify_client_on_delete: false,
        requires_audit: false,
      };
    }
  }

  const underClientPreparation =
    Boolean(input.is_client_preparation) ||
    (input.status === 'aguardando_cliente' && !input.has_attendant);

  // Client actor rules (Situations A & B)
  if (input.actor_kind === 'client') {
    if (!input.is_request_owner_client) {
      return {
        eligible: false,
        can_show_action: false,
        block_reason: 'INSUFFICIENT_PERMISSION',
        block_message: deletionBlockMessages.INSUFFICIENT_PERMISSION,
        recommended_alternatives: [],
        notify_client_on_delete: false,
        requires_audit: false,
      };
    }

    if (
      !input.is_authenticated_portal_client &&
      (input.channel === 'presencial' || input.channel === 'whatsapp') &&
      !input.client_identity_verified_for_channel
    ) {
      return {
        eligible: false,
        can_show_action: true,
        block_reason: 'CLIENT_UNVERIFIED_CHANNEL',
        block_message: deletionBlockMessages.CLIENT_UNVERIFIED_CHANNEL,
        recommended_alternatives: ['Entrar com sua conta verificada no Portal do Cliente', 'Solicitar apoio à equipe do escritório'],
        notify_client_on_delete: false,
        requires_audit: false,
      };
    }

    // Situation A: Client can delete before entering triage / team attendance
    const clientBeforeTriage =
      underClientPreparation ||
      (input.status === 'aberto' && !input.has_attendant);

    if (clientBeforeTriage) {
      return {
        eligible: true,
        can_show_action: true,
        block_reason: null,
        block_message: null,
        recommended_alternatives: [],
        notify_client_on_delete: false,
        // Requirement: client self-deletion does NOT generate enterprise audit entry
        requires_audit: false,
      };
    }

    // Situation B: Once under team attendance/triage, client cannot delete
    return {
      eligible: false,
      can_show_action: true,
      block_reason: 'CONTROL_WITH_TEAM',
      block_message: deletionBlockMessages.CONTROL_WITH_TEAM,
      recommended_alternatives: ['Acompanhar andamento da solicitação', 'Solicitar cancelamento junto à equipe'],
      notify_client_on_delete: false,
      requires_audit: false,
    };
  }

  // Team actor rules (Situations C & D)
  const hasTeamPermission =
    input.team_role === 'owner' ||
    (input.team_role === 'admin' && Boolean(input.team_has_delete_permission)) ||
    Boolean(input.team_has_delete_permission);

  if (!hasTeamPermission) {
    return {
      eligible: false,
      can_show_action: false,
      block_reason: 'INSUFFICIENT_PERMISSION',
      block_message: deletionBlockMessages.INSUFFICIENT_PERMISSION,
      recommended_alternatives: ['Solicitar exclusão a um administrador autorizado', 'Usar cancelamento quando aplicável'],
      notify_client_on_delete: false,
      requires_audit: false,
    };
  }

  // Situation C: Request still under client control before submission
  if (underClientPreparation) {
    return {
      eligible: false,
      can_show_action: true,
      block_reason: 'CONTROL_WITH_CLIENT',
      block_message: deletionBlockMessages.CONTROL_WITH_CLIENT,
      recommended_alternatives: ['Aguardar envio pelo cliente'],
      notify_client_on_delete: false,
      requires_audit: false,
    };
  }

  // Situation D: Under team control and eligible status
  if (TEAM_DELETABLE_STATUSES.has(input.status)) {
    return {
      eligible: true,
      can_show_action: true,
      block_reason: null,
      block_message: null,
      recommended_alternatives: [],
      notify_client_on_delete: true,
      requires_audit: true,
    };
  }

  return {
    eligible: false,
    can_show_action: true,
    block_reason: 'STATUS_NOT_ELIGIBLE',
    block_message: deletionBlockMessages.STATUS_NOT_ELIGIBLE,
    recommended_alternatives: ['Arquivar solicitação concluída', 'Consultar histórico'],
    notify_client_on_delete: false,
    requires_audit: false,
  };
}

export const clientDeletedNoticeTitle = 'Sua solicitação foi excluída';

export function formatClientDeletedNoticeBody(protocol: string | null | undefined): string {
  const safeProtocol = protocol && protocol.trim() ? protocol.trim() : 'sem protocolo';
  return `A solicitação ${safeProtocol} foi excluída pela equipe do Escritório JN. Caso ainda precise deste serviço, você pode iniciar uma nova solicitação.`;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VALID_STATUSES: ReadonlySet<string> = new Set([
  'aberto',
  'em_atendimento',
  'aguardando_cliente',
  'aguardando_responsavel',
  'concluido',
  'cancelado',
]);

export function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function isValidIdempotencyKey(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length >= 8 && value.trim().length <= 128 && /^[a-zA-Z0-9:_-]+$/.test(value.trim());
}

export function isValidDeleteRequestInput(value: unknown): value is RequestDeletionExecuteInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  const allowed = new Set([
    'office_id',
    'expected_version',
    'expected_status',
    'idempotency_key',
    'confirmation_ack',
    'client_verification_token',
  ]);
  if (Object.keys(v).some((k) => !allowed.has(k))) return false;
  if (!isValidUuid(v.office_id)) return false;
  if (typeof v.expected_version !== 'number' || !Number.isInteger(v.expected_version) || v.expected_version < 1) return false;
  if (typeof v.expected_status !== 'string' || !VALID_STATUSES.has(v.expected_status)) return false;
  if (!isValidIdempotencyKey(v.idempotency_key)) return false;
  if (v.confirmation_ack !== true) return false;
  if (
    v.client_verification_token !== undefined &&
    v.client_verification_token !== null &&
    (typeof v.client_verification_token !== 'string' || v.client_verification_token.trim().length > 256)
  ) {
    return false;
  }
  return true;
}
