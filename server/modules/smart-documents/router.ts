import { Router, json, type Response } from 'express';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import {
  documentExact as exact,
  documentObject as object,
  documentUuid as uuid,
  validParticipants,
  type ParticipantInput,
} from '../../../shared/documents.js';
import { validTemplate } from '../../../shared/templates.js';
import {
  evaluateStepPendencies,
  sanitizeSmartParties,
  suggestSmartConfigFromTemplate,
  validCorrectionRequestInput,
  validCourtesyInput,
  validManualReadingInput,
  validSmartConfig,
  type SmartStepId,
} from '../../../shared/smartDocument.js';
import { resolveSmartDocument } from '../../../shared/smartDocumentRender.js';
import { documentDetail } from '../documents/dto.js';

export const smartDocumentsRouter = Router();

smartDocumentsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.vary('Authorization');
  next();
});

smartDocumentsRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) {
    res.locals.smartAuth = auth;
    next();
  }
});

smartDocumentsRouter.use(
  (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD' && !req.is('application/json')) {
      errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
      return;
    }
    next();
  },
  json({ limit: '512kb' }),
);

const invalid = (res: Response, message = 'Confira os dados enviados ao motor inteligente.') =>
  errorResponse(res, 422, 'SMART_DOCUMENT_VALIDATION', message);

const messages: Record<string, [number, string]> = {
  AUTH_REQUIRED: [401, 'Entre novamente para continuar.'],
  TEMPLATES_FORBIDDEN: [403, 'Seu acesso não permite configurar modelos.'],
  DOCUMENTS_FORBIDDEN: [403, 'Seu acesso não permite esta operação documental.'],
  TEMPLATE_NOT_FOUND: [404, 'Modelo não encontrado.'],
  DOCUMENT_CONTEXT_UNAVAILABLE: [422, 'Este item não possui um documento disponível para o seu acesso.'],
  DOCUMENT_NOT_FOUND: [404, 'Documento ou atendimento não encontrado.'],
  TEMPLATE_CONFLICT: [409, 'A configuração do modelo mudou. Atualize e confira.'],
  DOCUMENT_CONFLICT: [409, 'Os dados do documento mudaram. Reabra para preservar sua edição.'],
  DOCUMENTS_VALIDATION: [422, 'Confira os campos informados.'],
  TEMPLATES_VALIDATION: [422, 'Confira a configuração inteligente do modelo.'],
};

async function callRpc(res: Response, name: string, args: Record<string, unknown>, project: (value: unknown) => unknown = value => value) {
  try {
    const { client } = res.locals.smartAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const m = messages[error.message];
      if (m && error.code === `PT${m[0]}`) {
        errorResponse(res, m[0], error.message, m[1]);
      } else {
        errorResponse(res, 503, 'SMART_DOCUMENT_UNAVAILABLE', 'Serviço documental temporariamente indisponível. Preserve seus dados e tente novamente.');
      }
      return;
    }
    res.json({ data: project(data) });
  } catch {
    errorResponse(res, 503, 'SMART_DOCUMENT_UNAVAILABLE', 'Serviço documental temporariamente indisponível. Preserve seus dados e tente novamente.');
  }
}

smartDocumentsRouter.post('/config/get', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !exact(b, ['office_id', 'template_id']) || !uuid(b.office_id) || !uuid(b.template_id)) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_template_config_get', {
    p_office_id: b.office_id,
    p_template_id: b.template_id,
  });
});

smartDocumentsRouter.post('/config/save', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !exact(b, ['office_id', 'template_id', 'config', 'expected_revision']) ||
    !uuid(b.office_id) ||
    !uuid(b.template_id) ||
    typeof b.expected_revision !== 'number' ||
    !Number.isSafeInteger(b.expected_revision) ||
    b.expected_revision < 0 ||
    !validSmartConfig(b.config)
  ) {
    invalid(res, 'Confira as perguntas iniciais e regras condicionais configuradas.');
    return;
  }
  await callRpc(res, 'smart_template_config_save', {
    p_office_id: b.office_id,
    p_template_id: b.template_id,
    p_config: b.config,
    p_expected_revision: b.expected_revision,
  });
});

smartDocumentsRouter.post('/config/suggest', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !exact(b, ['definition']) || !validTemplate(b.definition)) {
    invalid(res, 'Envie uma definição de modelo válida para gerar sugestões.');
    return;
  }
  res.json({ data: suggestSmartConfigFromTemplate(b.definition) });
});

smartDocumentsRouter.post('/preview', async (req, res) => {
  const b: unknown = req.body;
  if (!object(b) || !validTemplate(b.definition) || !object(b.input)) {
    invalid(res, 'Envie uma definição e entradas válidas para gerar a prévia.');
    return;
  }
  const config = validSmartConfig(b.config) ? b.config : suggestSmartConfigFromTemplate(b.definition);
  const initial_answers = object(b.initial_answers)
    ? Object.fromEntries(Object.entries(b.initial_answers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    : {};
  const answers = object(b.answers)
    ? Object.fromEntries(Object.entries(b.answers).filter(([, v]) => typeof v === 'string')) as Record<string, string>
    : {};
  const parties = sanitizeSmartParties(b.parties);
  const draftInput = {
    content: typeof b.input.content === 'string' ? b.input.content : b.definition.content,
    overrides: object(b.input.overrides)
      ? (Object.fromEntries(Object.entries(b.input.overrides).filter(([, v]) => typeof v === 'string')) as Record<string, string>)
      : {},
    money_in_words: typeof b.input.money_in_words === 'boolean' ? b.input.money_in_words : true,
  };
  const source = object(b.source)
    ? (b.source as Parameters<typeof resolveSmartDocument>[3])
    : {
        customer: null,
        service: { id: '00000000-0000-4000-8000-000000000001', version_id: '00000000-0000-4000-8000-000000000002', description: b.definition.name, quantity: 1, total_cents: 0 },
        emitted_on: new Date().toISOString().slice(0, 10),
      };
  const resolution = resolveSmartDocument(b.definition, config, draftInput, source, [], {
    initial_answers,
    answers,
    parties,
  });
  const evaluation = evaluateStepPendencies(config, { initial_answers, answers, parties });
  res.json({ data: { resolution, evaluation } });
});

smartDocumentsRouter.post('/session/get', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !exact(b, ['office_id', 'request_id', 'document_id']) ||
    !uuid(b.office_id) ||
    !(b.request_id === null || uuid(b.request_id)) ||
    !(b.document_id === null || uuid(b.document_id)) ||
    (!b.request_id && !b.document_id)
  ) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_session_get', {
    p_office_id: b.office_id,
    p_request_id: b.request_id,
    p_document_id: b.document_id,
  });
});

smartDocumentsRouter.post('/session/save', async (req, res) => {
  const b: unknown = req.body;
  if (!object(b) || !uuid(b.office_id) || !uuid(b.template_id) || !uuid(b.template_version_id)) {
    invalid(res);
    return;
  }
  if (b.request_id !== undefined && b.request_id !== null && !uuid(b.request_id)) {
    invalid(res);
    return;
  }
  if (b.document_id !== undefined && b.document_id !== null && !uuid(b.document_id)) {
    invalid(res);
    return;
  }
  const allowedSteps: SmartStepId[] = ['contexto', 'partes', 'objeto', 'pagamento', 'documentos', 'revisao'];
  if (b.current_step !== undefined && !allowedSteps.includes(b.current_step as SmartStepId)) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_session_upsert', {
    p_office_id: b.office_id,
    p_payload: {
      request_id: b.request_id ?? null,
      request_item_id: b.request_item_id ?? null,
      document_id: b.document_id ?? null,
      template_id: b.template_id,
      template_version_id: b.template_version_id,
      origin: b.origin ?? 'portal',
      channel: b.channel ?? 'web',
      current_step: b.current_step ?? 'contexto',
      initial_answers: object(b.initial_answers) ? b.initial_answers : {},
      answers: object(b.answers) ? b.answers : {},
      parties: Array.isArray(b.parties) ? b.parties : [],
      pending_fields: Array.isArray(b.pending_fields) ? b.pending_fields : [],
      conference_status: typeof b.conference_status === 'string' ? b.conference_status : undefined,
      conference_notes: typeof b.conference_notes === 'string' ? b.conference_notes : undefined,
      expected_revision: typeof b.expected_revision === 'number' ? b.expected_revision : 0,
      submit: Boolean(b.submit),
    },
  });
});

smartDocumentsRouter.post('/request-context', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !exact(b, ['office_id', 'request_id', 'request_item_id']) ||
    !uuid(b.office_id) ||
    !uuid(b.request_id) ||
    !uuid(b.request_item_id)
  ) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_request_context', {
    p_office_id: b.office_id,
    p_request_id: b.request_id,
    p_request_item_id: b.request_item_id,
  });
});

smartDocumentsRouter.post('/conference/start', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !exact(b, ['office_id', 'request_id', 'request_item_id', 'participants', 'idempotency_key']) ||
    !uuid(b.office_id) ||
    !uuid(b.request_id) ||
    !uuid(b.request_item_id) ||
    !uuid(b.idempotency_key) ||
    !validParticipants(b.participants)
  ) {
    invalid(res);
    return;
  }

  await callRpc(res, 'document_intake_open_from_request', {
    p_office_id: b.office_id,
    p_request_id: b.request_id,
    p_request_item_id: b.request_item_id,
    p_participants: b.participants as ParticipantInput[],
    p_idempotency_key: b.idempotency_key,
  }, value => {
    if (!object(value)) throw new Error('Invalid document entry');
    return { context: value.context, document: documentDetail(value.document) };
  });
});

smartDocumentsRouter.post('/conference/operate', async (req, res) => {
  const b: unknown = req.body;
  if (
    !object(b) ||
    !uuid(b.office_id) ||
    !uuid(b.request_id) ||
    typeof b.conference_status !== 'string' ||
    !['nao_iniciada', 'em_conferencia', 'aguardando_complementacao', 'conferencia_concluida'].includes(b.conference_status)
  ) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_conference_operate', {
    p_office_id: b.office_id,
    p_payload: {
      request_id: b.request_id,
      document_id: typeof b.document_id === 'string' && uuid(b.document_id) ? b.document_id : null,
      conference_status: b.conference_status,
      conference_notes: typeof b.conference_notes === 'string' ? b.conference_notes : '',
      notify_client: Boolean(b.notify_client),
      release_charge: Boolean(b.release_charge),
    },
  });
});

smartDocumentsRouter.post('/courtesy', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !object(b) ||
    !uuid(b.office_id) ||
    !validCourtesyInput(b.courtesy)
  ) {
    invalid(res, 'Informe o motivo da cortesia autorizada (5 a 500 caracteres).');
    return;
  }
  await callRpc(res, 'smart_courtesy_authorize', {
    p_office_id: b.office_id,
    p_request_id: b.courtesy.request_id,
    p_charge_id: b.courtesy.charge_id ?? null,
    p_reason: b.courtesy.reason.trim(),
    p_idempotency_key: b.courtesy.idempotency_key,
  });
});

smartDocumentsRouter.post('/manual-reading', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !object(b) || !uuid(b.office_id) || !validManualReadingInput(b.reading)) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_manual_reading_record', {
    p_office_id: b.office_id,
    p_document_id: b.reading.document_id,
    p_revision: b.reading.revision,
    p_clauses: b.reading.clauses_reviewed,
    p_customer_confirmed: b.reading.customer_confirmed,
    p_notes: b.reading.notes ?? '',
  });
});

smartDocumentsRouter.post('/corrections/list', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !exact(b, ['office_id', 'document_id']) || !uuid(b.office_id) || !uuid(b.document_id)) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_correction_list', {
    p_office_id: b.office_id,
    p_document_id: b.document_id,
  });
});

smartDocumentsRouter.post('/corrections/request', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !object(b) || !uuid(b.office_id) || !validCorrectionRequestInput(b.correction)) {
    invalid(res, 'Informe o campo ou cláusula, o dado correto e a justificativa (mínimo 5 caracteres).');
    return;
  }
  await callRpc(res, 'smart_correction_request', {
    p_office_id: b.office_id,
    p_payload: b.correction,
  });
});

smartDocumentsRouter.post('/corrections/decide', async (req, res) => {
  const b: unknown = req.body;
  if (
    Object.keys(req.query).length ||
    !object(b) ||
    !uuid(b.office_id) ||
    !uuid(b.correction_id) ||
    typeof b.status !== 'string' ||
    !['em_conferencia', 'aguardando_complementacao', 'aprovada', 'recusada', 'nova_versao_liberada'].includes(b.status)
  ) {
    invalid(res);
    return;
  }
  await callRpc(res, 'smart_correction_decide', {
    p_office_id: b.office_id,
    p_correction_id: b.correction_id,
    p_status: b.status,
    p_reason: typeof b.reason === 'string' ? b.reason : '',
    p_new_revision: typeof b.new_revision === 'number' && Number.isSafeInteger(b.new_revision) ? b.new_revision : null,
    p_new_publication_id: typeof b.new_publication_id === 'string' && uuid(b.new_publication_id) ? b.new_publication_id : null,
  });
});
