import type { DocumentDetail, ParticipantInput } from '../../../shared/documents';
import type { TemplateInput } from '../../../shared/templates';
import type {
  ConferenceStatus,
  CorrectionRequestInput,
  CorrectionRequestRecord,
  CorrectionStatus,
  CourtesyInput,
  ManualReadingInput,
  PendingFieldRecord,
  SmartPartyRecord,
  SmartSessionState,
  SmartStepId,
  SmartTemplateConfig,
} from '../../../shared/smartDocument';
import type { SmartDocumentResolution } from '../../../shared/smartDocumentRender';
import { commercialRequest } from '../documentCommercial/api';

const BASE = '/api/smart-documents';

export interface SmartConfigState {
  template_id: string;
  revision: number;
  config: SmartTemplateConfig | null;
  updated_at: string | null;
}

export interface SmartRequestContext {
  request_id: string;
  request_item_id: string;
  request_protocol: string;
  request_status: string;
  origin: 'portal' | 'presencial' | 'whatsapp';
  has_intake: boolean;
  intake: {
    model_name: string;
    template_id: string;
    template_version_id: string;
    answers: Record<string, string>;
  } | null;
  document_id: string | null;
  document_status: 'draft' | 'prepared' | null;
  document_revision: number | null;
  document_protocol: string | null;
  smart_session: SmartSessionState | null;
  smart_config: SmartTemplateConfig | null;
  financial: {
    charge_id: string;
    due_cents: number;
    allocated_cents: number;
    balance_cents: number;
    cancelled: boolean;
  } | null;
  courtesies: Array<{
    id: string;
    waived_cents: number;
    reason: string;
    authorized_by_name: string;
    created_at: string;
  }>;
}

export const smartDocumentsApi = {
  configGet: (office_id: string, template_id: string, signal?: AbortSignal) =>
    commercialRequest<SmartConfigState>('/config/get', { office_id, template_id }, signal, BASE),

  configSave: (
    office_id: string,
    template_id: string,
    config: SmartTemplateConfig,
    expected_revision: number,
    signal?: AbortSignal,
  ) =>
    commercialRequest<SmartConfigState>(
      '/config/save',
      { office_id, template_id, config, expected_revision },
      signal,
      BASE,
    ),

  configSuggest: (definition: TemplateInput, signal?: AbortSignal) =>
    commercialRequest<SmartTemplateConfig>('/config/suggest', { definition }, signal, BASE),

  preview: (
    payload: {
      definition: TemplateInput;
      config?: SmartTemplateConfig;
      input: { content: string; overrides: Record<string, string>; money_in_words: boolean };
      initial_answers: Record<string, string>;
      answers: Record<string, string>;
      parties: SmartPartyRecord[];
    },
    signal?: AbortSignal,
  ) => commercialRequest<{ resolution: SmartDocumentResolution }>('/preview', payload, signal, BASE),

  sessionGet: (
    office_id: string,
    query: { request_id?: string | null; document_id?: string | null },
    signal?: AbortSignal,
  ) =>
    commercialRequest<SmartSessionState | null>(
      '/session/get',
      { office_id, request_id: query.request_id ?? null, document_id: query.document_id ?? null },
      signal,
      BASE,
    ),

  sessionSave: (
    payload: {
      office_id: string;
      request_id?: string | null;
      request_item_id?: string | null;
      document_id?: string | null;
      template_id: string;
      template_version_id: string;
      origin: 'portal' | 'presencial' | 'whatsapp';
      channel?: string;
      current_step: SmartStepId;
      initial_answers: Record<string, string>;
      answers: Record<string, string>;
      parties: SmartPartyRecord[];
      pending_fields: PendingFieldRecord[];
      conference_status?: ConferenceStatus;
      conference_notes?: string;
      expected_revision?: number;
      submit?: boolean;
    },
    signal?: AbortSignal,
  ) => commercialRequest<SmartSessionState>('/session/save', payload, signal, BASE),

  requestContext: (office_id: string, request_id: string, request_item_id: string, signal?: AbortSignal) =>
    commercialRequest<SmartRequestContext>(
      '/request-context',
      { office_id, request_id, request_item_id },
      signal,
      BASE,
    ),

  conferenceStart: (
    office_id: string,
    request_id: string,
    request_item_id: string,
    participants: ParticipantInput[],
    idempotency_key: string,
    signal?: AbortSignal,
  ) =>
    commercialRequest<{ context: SmartRequestContext; document: DocumentDetail }>(
      '/conference/start',
      { office_id, request_id, request_item_id, participants, idempotency_key },
      signal,
      BASE,
    ),

  conferenceOperate: (
    payload: {
      office_id: string;
      request_id: string;
      document_id?: string | null;
      conference_status: ConferenceStatus;
      conference_notes?: string;
      notify_client?: boolean;
      release_charge?: boolean;
    },
    signal?: AbortSignal,
  ) =>
    commercialRequest<{ request_id: string; conference_status: ConferenceStatus; updated_at: string }>(
      '/conference/operate',
      payload,
      signal,
      BASE,
    ),

  authorizeCourtesy: (office_id: string, courtesy: CourtesyInput, signal?: AbortSignal) =>
    commercialRequest<{ id: string; waived_cents: number; reason: string; authorized_by_name: string }>(
      '/courtesy',
      { office_id, courtesy },
      signal,
      BASE,
    ),

  recordManualReading: (office_id: string, reading: ManualReadingInput, signal?: AbortSignal) =>
    commercialRequest<{ id: string; created_at: string }>(
      '/manual-reading',
      { office_id, reading },
      signal,
      BASE,
    ),

  listCorrections: (office_id: string, document_id: string, signal?: AbortSignal) =>
    commercialRequest<{ items: CorrectionRequestRecord[] }>(
      '/corrections/list',
      { office_id, document_id },
      signal,
      BASE,
    ),

  requestCorrection: (office_id: string, correction: CorrectionRequestInput, signal?: AbortSignal) =>
    commercialRequest<CorrectionRequestRecord>(
      '/corrections/request',
      { office_id, correction },
      signal,
      BASE,
    ),

  decideCorrection: (
    payload: {
      office_id: string;
      correction_id: string;
      status: Exclude<CorrectionStatus, 'aguardando_conferencia'>;
      reason?: string;
      new_revision?: number | null;
      new_publication_id?: string | null;
    },
    signal?: AbortSignal,
  ) => commercialRequest<CorrectionRequestRecord>('/corrections/decide', payload, signal, BASE),
};
