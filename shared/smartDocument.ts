import {isCustomTemplateKey,templateKinds,templateVariables,type TemplateInput,type TemplateVariable,type VariableType} from './templates.js';
import {digitsOnly,formatCnpj,formatCpf,validCnpj,validCpf} from './identifiers.js';
import {documentDate} from './documentRender.js';
import {documentObject,documentUuid} from './documents.js';

export type SmartStepId = 'contexto' | 'partes' | 'objeto' | 'pagamento' | 'documentos' | 'revisao';
export type SmartFieldCriticality = 'legal_required' | 'recommended' | 'optional';
export type SmartFieldInputType = VariableType | 'textarea' | 'select' | 'radio' | 'boolean';
export type DeclaredGender = 'masculine' | 'feminine' | 'neutral' | 'entity';
export type MaritalStatus = 'solteiro' | 'casado' | 'divorciado' | 'viuvo' | 'uniao_estavel';
export type PropertyRegime =
  | 'comunhao_parcial'
  | 'comunhao_universal'
  | 'separacao_total'
  | 'participacao_final'
  | 'uniao_estavel_parcial';

export type SmartConditionOp = 'equals' | 'not_equals' | 'in' | 'not_empty';
export interface SmartCondition {
  source_key: string;
  op: SmartConditionOp;
  value?: string;
  values?: string[];
}

export interface SmartQuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface SmartQuestion {
  key: string;
  label: string;
  help_text?: string;
  input_type: 'radio' | 'select' | 'boolean';
  options: SmartQuestionOption[];
  default_value?: string;
  criticality: SmartFieldCriticality;
  conditions?: SmartCondition[];
}

export interface SmartField {
  key: string;
  label: string;
  step_id: Exclude<SmartStepId, 'revisao'>;
  input_type: SmartFieldInputType;
  criticality: SmartFieldCriticality;
  placeholder?: string;
  help_text?: string;
  options?: SmartQuestionOption[];
  conditions?: SmartCondition[];
  sync_template_key?: string;
}

export interface SmartDocRequirement {
  id: string;
  label: string;
  description?: string;
  required: boolean;
  conditions?: SmartCondition[];
}

export interface SmartTemplateConfig {
  version: 1;
  domain: 'real_estate_sale' | 'rural_property' | 'declaration' | 'application' | 'official_letter' | 'general_contract';
  allow_multiple_buyers: boolean;
  allow_multiple_sellers: boolean;
  enable_marital_agreement: boolean;
  initial_questions: SmartQuestion[];
  fields: SmartField[];
  supporting_docs: SmartDocRequirement[];
}

export interface SmartSpouseRecord {
  full_name: string;
  cpf: string;
  gender: Exclude<DeclaredGender, 'entity'>;
  nationality?: string;
  profession?: string;
}

export interface SmartPartyRecord {
  id: string;
  role: 'buyer' | 'seller' | 'representative' | 'guardian' | 'other';
  customer_id?: string | null;
  entity_type: 'person' | 'company';
  gender: DeclaredGender;
  full_name: string;
  tax_id: string;
  rg?: string;
  nationality?: string;
  profession?: string;
  address?: string;
  marital_status?: MaritalStatus;
  property_regime?: PropertyRegime;
  has_spouse?: boolean;
  spouse?: SmartSpouseRecord;
  legal_representative_name?: string;
  legal_representative_cpf?: string;
  legal_representative_role?: string;
}

export interface PendingFieldRecord {
  key: string;
  label: string;
  step_id: SmartStepId;
  criticality: SmartFieldCriticality;
  reason: string;
}

export type ConferenceStatus =
  | 'nao_iniciada'
  | 'em_conferencia'
  | 'aguardando_complementacao'
  | 'conferencia_concluida';

export interface SmartSessionState {
  id?: string;
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
  conference_status: ConferenceStatus;
  conference_notes?: string;
  revision: number;
  autosaved_at?: string | null;
  submitted_at?: string | null;
}

export type CorrectionStatus =
  | 'aguardando_conferencia'
  | 'em_conferencia'
  | 'aguardando_complementacao'
  | 'aprovada'
  | 'recusada'
  | 'nova_versao_liberada';

export interface CorrectionRequestInput {
  publication_id?: string | null;
  document_id: string;
  section_key: string;
  incorrect_value: string;
  corrected_value: string;
  description: string;
  attachment_ids: string[];
}

export interface CorrectionRequestRecord extends CorrectionRequestInput {
  id: string;
  office_id: string;
  request_id: string;
  protocol: string;
  status: CorrectionStatus;
  review_reason?: string | null;
  new_revision?: number | null;
  new_publication_id?: string | null;
  was_signed_before: boolean;
  requires_resignature: boolean;
  zero_charge_linked_payment_id?: string | null;
  zero_charge_label: string;
  requested_by_name: string;
  reviewed_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

export interface CourtesyInput {
  request_id: string;
  charge_id?: string | null;
  reason: string;
  idempotency_key: string;
}

export interface ManualReadingInput {
  document_id: string;
  revision: number;
  clauses_reviewed: string[];
  customer_confirmed: boolean;
  notes?: string;
}

export interface FieldValidationError {
  key: string;
  label: string;
  step_id: SmartStepId;
  message: string;
}

export interface StepPendencyEvaluation {
  emptyPendencies: PendingFieldRecord[];
  invalidFields: FieldValidationError[];
  finalBlockers: FieldValidationError[];
}

export const stepLabels: Record<SmartStepId, string> = {
  contexto: 'Perguntas iniciais',
  partes: 'Partes e qualificação',
  objeto: 'Dados do documento',
  pagamento: 'Pagamento e condições',
  documentos: 'Documentos comprobatórios',
  revisao: 'Conferência e envio',
};

export const conferenceStatusLabels: Record<ConferenceStatus, string> = {
  nao_iniciada: 'Não iniciada',
  em_conferencia: 'Em conferência',
  aguardando_complementacao: 'Aguardando complementação',
  conferencia_concluida: 'Conferência concluída',
};

export const correctionStatusLabels: Record<CorrectionStatus, string> = {
  aguardando_conferencia: 'Aguardando conferência',
  em_conferencia: 'Em conferência',
  aguardando_complementacao: 'Aguardando complementação',
  aprovada: 'Aprovada pela equipe',
  recusada: 'Recusada',
  nova_versao_liberada: 'Nova versão liberada',
};

export const maritalStatusLabels: Record<MaritalStatus, string> = {
  solteiro: 'Solteiro(a)',
  casado: 'Casado(a)',
  divorciado: 'Divorciado(a)',
  viuvo: 'Viúvo(a)',
  uniao_estavel: 'União estável',
};

export const propertyRegimeLabels: Record<PropertyRegime, string> = {
  comunhao_parcial: 'Comunhão parcial de bens',
  comunhao_universal: 'Comunhão universal de bens',
  separacao_total: 'Separação total de bens',
  participacao_final: 'Participação final nos aquestos',
  uniao_estavel_parcial: 'União estável (regime legal parcial)',
};

export const genderLabels: Record<DeclaredGender, string> = {
  masculine: 'Masculino (O / ele)',
  feminine: 'Feminino (A / ela)',
  neutral: 'Neutro (A parte)',
  entity: 'Pessoa Jurídica',
};

function sanitizeText(v: unknown, max: number): boolean {
  return typeof v === 'string' && Array.from(v).length <= max && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
}

export function evaluateConditions(
  conditions: SmartCondition[] | undefined,
  values: Record<string, string>,
): boolean {
  if (!conditions || conditions.length === 0) return true;
  return conditions.every((cond) => {
    const actual = (values[cond.source_key] ?? '').trim();
    switch (cond.op) {
      case 'equals':
        return actual === (cond.value ?? '');
      case 'not_equals':
        return actual !== (cond.value ?? '');
      case 'in':
        return Array.isArray(cond.values) ? cond.values.includes(actual) : false;
      case 'not_empty':
        return actual.length > 0;
      default:
        return true;
    }
  });
}

function classifyDomain(
  def: TemplateInput,
  extra?: { name?: string; code?: string },
): SmartTemplateConfig['domain'] {
  const haystack = `${def.name} ${def.code} ${extra?.name ?? ''} ${extra?.code ?? ''} ${def.content}`.toLowerCase();
  if (/ccir|car|itr|im[oó]vel\s+rural|fazenda|s[ií]tio|gleba|terra\s+rural/.test(haystack)) {
    return 'rural_property';
  }
  if (/compra\s+e\s+venda|promessa\s+de\s+compra|escritura|cess[aã]o\s+de\s+posse|im[oó]vel/.test(haystack)) {
    return 'real_estate_sale';
  }
  if (def.kind === 'declaration') return 'declaration';
  if (def.kind === 'application') return 'application';
  if (def.kind === 'official_letter') return 'official_letter';
  return 'general_contract';
}

function mapVariableStep(variable: TemplateVariable): Exclude<SmartStepId, 'revisao'> {
  const k = variable.key.toLowerCase();
  if (k.startsWith('valores.') || /valor|parcela|pagamento|sinal|entrada|juros|multa/.test(k)) {
    return 'pagamento';
  }
  if (k.startsWith('participante.') || k.startsWith('cliente.')) {
    return 'partes';
  }
  return 'objeto';
}

export function suggestSmartConfigFromTemplate(
  definition: TemplateInput,
  extra?: { name?: string; code?: string },
): SmartTemplateConfig {
  const domain = classifyDomain(definition, extra);
  const contentAndVars = `${definition.name} ${definition.content} ${definition.variables.map((v) => `${v.key} ${v.label}`).join(' ')}`.toLowerCase();
  const isPropertyLike =
    domain === 'real_estate_sale' ||
    domain === 'rural_property' ||
    /im[oó]vel|matr[ií]cula|lote|terreno|casa|apartamento|posse|rural|urbano/.test(contentAndVars);
  const hasFinancial =
    definition.variables.some((v) => v.type === 'money' || v.key.startsWith('valores.')) ||
    /pre[çc]o|valor|pagamento|parcela|financiamento|sinal/.test(contentAndVars);
  const hasParties =
    definition.kind === 'contract' ||
    definition.variables.some((v) => v.key.startsWith('participante.')) ||
    /vendedor|comprador|outorgante|outorgado|locador|locat[áa]rio|contratante/.test(contentAndVars);

  const initial_questions: SmartQuestion[] = [];
  if (hasParties || definition.kind === 'contract') {
    initial_questions.push({
      key: 'smart.applicant_role',
      label: 'Qual é o seu papel principal neste documento?',
      help_text: 'Ajuda a organizar as seções de qualificação e concordância gramatical.',
      input_type: 'radio',
      default_value: 'comprador',
      criticality: 'legal_required',
      options: [
        { value: 'comprador', label: 'Comprador / Adquirente / Beneficiário' },
        { value: 'vendedor', label: 'Vendedor / Outorgante / Cedente' },
        { value: 'representante', label: 'Representante legal / Procurador / Equipe' },
      ],
    });
  }

  if (isPropertyLike) {
    initial_questions.push({
      key: 'smart.property_nature',
      label: 'O imóvel objeto do documento é urbano ou rural?',
      help_text: 'Imóveis rurais exibem campos específicos como CCIR, CAR e ITR.',
      input_type: 'radio',
      default_value: domain === 'rural_property' ? 'rural' : 'urbano',
      criticality: 'legal_required',
      options: [
        { value: 'urbano', label: 'Imóvel Urbano (casa, lote, apartamento, sala)' },
        { value: 'rural', label: 'Imóvel Rural (fazenda, sítio, chácara, gleba)' },
      ],
    });
  }

  if (hasParties) {
    initial_questions.push({
      key: 'smart.multiple_sellers',
      label: 'Haverá mais de um vendedor ou outorgante?',
      input_type: 'radio',
      default_value: 'nao',
      criticality: 'recommended',
      options: [
        { value: 'nao', label: 'Somente 1 vendedor / outorgante' },
        { value: 'sim', label: '2 ou mais vendedores / coproprietários' },
      ],
    });
    initial_questions.push({
      key: 'smart.multiple_buyers',
      label: 'Haverá mais de um comprador ou beneficiário?',
      input_type: 'radio',
      default_value: 'nao',
      criticality: 'recommended',
      options: [
        { value: 'nao', label: 'Somente 1 comprador / beneficiário' },
        { value: 'sim', label: '2 ou mais compradores / coproprietários' },
      ],
    });
  }

  if (hasFinancial) {
    initial_questions.push({
      key: 'smart.payment_mode',
      label: 'Como será realizado o pagamento previsto no documento?',
      input_type: 'select',
      default_value: 'a_vista',
      criticality: 'legal_required',
      options: [
        { value: 'a_vista', label: 'À vista (pagamento único)' },
        { value: 'parcelado', label: 'Parcelado direto entre as partes' },
        { value: 'financiamento', label: 'Financiamento bancário / consórcio' },
        { value: 'permuta_misto', label: 'Permuta ou misto' },
      ],
    });
  }

  if (definition.kind === 'declaration' || definition.kind === 'application' || definition.kind === 'official_letter') {
    initial_questions.push({
      key: 'smart.representation_mode',
      label: 'O pedido está sendo feito em nome próprio ou por representante?',
      input_type: 'radio',
      default_value: 'proprio',
      criticality: 'recommended',
      options: [
        { value: 'proprio', label: 'Em nome próprio (titular direto)' },
        { value: 'procurador', label: 'Por procurador / representante legal' },
      ],
    });
  }

  const fields: SmartField[] = [];
  const seenKeys = new Set<string>();

  if (isPropertyLike) {
    const propertyFields: SmartField[] = [
      {
        key: 'documento.imovel_matricula',
        label: 'Número da matrícula / registro ou posse',
        step_id: 'objeto',
        input_type: 'text',
        criticality: 'recommended',
        placeholder: 'Ex.: Matrícula nº 12.345 do CRI da Comarca',
      },
      {
        key: 'documento.imovel_endereco',
        label: 'Endereço ou localização detalhada do imóvel',
        step_id: 'objeto',
        input_type: 'textarea',
        criticality: 'legal_required',
        placeholder: 'Logradouro, lote, quadra, bairro/comarca ou denominação rural',
      },
      {
        key: 'documento.imovel_ccir',
        label: 'Número do CCIR (Certificado de Cadastro de Imóvel Rural)',
        step_id: 'objeto',
        input_type: 'text',
        criticality: 'recommended',
        placeholder: 'Código CCIR/INCRA',
        conditions: [{ source_key: 'smart.property_nature', op: 'equals', value: 'rural' }],
      },
      {
        key: 'documento.imovel_car',
        label: 'Registro no CAR (Cadastro Ambiental Rural)',
        step_id: 'objeto',
        input_type: 'text',
        criticality: 'recommended',
        placeholder: 'UF-XXXXXXX-...',
        conditions: [{ source_key: 'smart.property_nature', op: 'equals', value: 'rural' }],
      },
      {
        key: 'documento.imovel_area',
        label: 'Área total e confrontações',
        step_id: 'objeto',
        input_type: 'textarea',
        criticality: 'optional',
        placeholder: 'Ex.: 15,00 hectares ou 360,00 m²',
      },
      {
        key: 'documento.imovel_iptu',
        label: 'Inscrição imobiliária / IPTU',
        step_id: 'objeto',
        input_type: 'text',
        criticality: 'optional',
        conditions: [{ source_key: 'smart.property_nature', op: 'equals', value: 'urbano' }],
      },
    ];
    for (const f of propertyFields) {
      fields.push(f);
      seenKeys.add(f.key);
    }
  }

  for (const v of definition.variables) {
    if (seenKeys.has(v.key)) continue;
    // Standard participant/client names & cpfs are synced from Parties step automatically,
    // but extra custom variables appear cleanly in their semantic step.
    if (v.key === 'cliente.nome' || v.key === 'cliente.cpf' || v.key.startsWith('participante.')) {
      continue;
    }
    const step_id = mapVariableStep(v);
    const conditions: SmartCondition[] | undefined =
      v.key === 'valores.parcela'
        ? [{ source_key: 'smart.payment_mode', op: 'in', values: ['parcelado', 'financiamento'] }]
        : undefined;
    fields.push({
      key: v.key,
      label: v.label,
      step_id,
      input_type: v.type === 'text' && isCustomTemplateKey(v.key) ? 'textarea' : v.type,
      criticality: v.required ? 'legal_required' : 'recommended',
      sync_template_key: v.key,
      ...(conditions ? { conditions } : {}),
    });
    seenKeys.add(v.key);
  }

  if (hasFinancial) {
    const payCondition: SmartCondition[] = [{ source_key: 'smart.payment_mode', op: 'in', values: ['parcelado', 'financiamento'] }];
    if (!seenKeys.has('documento.pagamento_entrada')) {
      fields.push({
        key: 'documento.pagamento_entrada',
        label: 'Valor de entrada / sinal',
        step_id: 'pagamento',
        input_type: 'money',
        criticality: 'recommended',
        placeholder: '0.00',
        conditions: payCondition,
      });
    }
    if (!seenKeys.has('documento.pagamento_qtd_parcelas')) {
      fields.push({
        key: 'documento.pagamento_qtd_parcelas',
        label: 'Quantidade e vencimento das parcelas',
        step_id: 'pagamento',
        input_type: 'text',
        criticality: 'recommended',
        placeholder: 'Ex.: 12 parcelas mensais todo dia 10',
        conditions: payCondition,
      });
    }
    if (!seenKeys.has('documento.clausulas_especiais')) {
      fields.push({
        key: 'documento.clausulas_especiais',
        label: 'Condições especiais ou observações adicionais',
        step_id: 'pagamento',
        input_type: 'textarea',
        criticality: 'optional',
        placeholder: 'Ex.: entrega das chaves na assinatura, quitação de débitos anteriores...',
      });
    }
  } else if (!seenKeys.has('documento.observacoes_adicionais')) {
    fields.push({
      key: 'documento.observacoes_adicionais',
      label: 'Observações e condições específicas',
      step_id: 'objeto',
      input_type: 'textarea',
      criticality: 'optional',
      placeholder: 'Informe detalhes complementares para conferência da equipe.',
    });
  }

  const supporting_docs: SmartDocRequirement[] = [
    {
      id: 'doc_identidade',
      label: 'RG / CNH ou CPF das partes envolvidas',
      description: 'Documento oficial com foto legível.',
      required: true,
    },
    {
      id: 'doc_estado_civil',
      label: 'Certidão de casamento ou comprovação de estado civil',
      description: 'Necessária quando houver cônjuge ou regime de bens aplicável.',
      required: false,
    },
  ];
  if (isPropertyLike) {
    supporting_docs.push({
      id: 'doc_matricula',
      label: 'Certidão de matrícula atualizada ou documento de posse',
      required: true,
    });
    supporting_docs.push({
      id: 'doc_rural_ccir_car',
      label: 'CCIR, CAR e ITR atualizados do imóvel rural',
      required: true,
      conditions: [{ source_key: 'smart.property_nature', op: 'equals', value: 'rural' }],
    });
  }
  supporting_docs.push({
    id: 'doc_procuracao',
    label: 'Procuração pública/particular ou contrato social',
    description: 'Quando representado por procurador ou pessoa jurídica.',
    required: false,
  });

  return {
    version: 1,
    domain,
    allow_multiple_buyers: hasParties,
    allow_multiple_sellers: hasParties,
    enable_marital_agreement: hasParties || definition.kind === 'contract' || definition.kind === 'declaration',
    initial_questions,
    fields,
    supporting_docs,
  };
}

function validateTypedValue(type: SmartFieldInputType, value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (type === 'cpf') {
    if (!validCpf(trimmed)) return 'Informe um CPF válido com 11 dígitos.';
  } else if (type === 'cnpj') {
    if (!validCnpj(trimmed)) return 'Informe um CNPJ válido com 14 dígitos.';
  } else if (type === 'tax_id') {
    const d = digitsOnly(trimmed);
    if (d.length <= 11 ? !validCpf(trimmed) : !validCnpj(trimmed)) {
      return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos) válido.';
    }
  } else if (type === 'date') {
    if (!documentDate(trimmed)) return 'Informe uma data válida no formato AAAA-MM-DD.';
  } else if (type === 'money') {
    if (!/^(0|[1-9]\d{0,8})([.,]\d{1,2})?$/.test(trimmed)) {
      return 'Informe um valor em reais válido (ex.: 1500.00).';
    }
  } else if (type === 'number') {
    if (!/^(0|[1-9]\d{0,5})([.,]\d{1,3})?$/.test(trimmed) || Number(trimmed.replace(',', '.')) > 100000) {
      return 'Informe um número válido até 100.000.';
    }
  }
  return null;
}

export function normalizeSmartFieldValue(type: SmartFieldInputType, raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (type === 'cpf') return formatCpf(digitsOnly(trimmed));
  if (type === 'cnpj') return formatCnpj(digitsOnly(trimmed));
  if (type === 'tax_id') {
    const d = digitsOnly(trimmed);
    return d.length <= 11 ? formatCpf(d) : formatCnpj(d);
  }
  if (type === 'money') {
    return trimmed.replace(',', '.');
  }
  return raw;
}

export function evaluateStepPendencies(
  config: SmartTemplateConfig,
  state: {
    initial_answers: Record<string, string>;
    answers: Record<string, string>;
    parties: SmartPartyRecord[];
  },
  stepId?: SmartStepId,
): StepPendencyEvaluation {
  const emptyPendencies: PendingFieldRecord[] = [];
  const invalidFields: FieldValidationError[] = [];
  const finalBlockers: FieldValidationError[] = [];
  const allValues = { ...state.initial_answers, ...state.answers };

  const shouldCheck = (targetStep: SmartStepId) => !stepId || stepId === 'revisao' || stepId === targetStep;

  if (shouldCheck('contexto')) {
    for (const q of config.initial_questions) {
      if (!evaluateConditions(q.conditions, allValues)) continue;
      const val = (state.initial_answers[q.key] ?? '').trim();
      if (!val) {
        const rec: PendingFieldRecord = {
          key: q.key,
          label: q.label,
          step_id: 'contexto',
          criticality: q.criticality,
          reason: 'Pergunta inicial não respondida',
        };
        emptyPendencies.push(rec);
        if (q.criticality === 'legal_required') {
          finalBlockers.push({ key: q.key, label: q.label, step_id: 'contexto', message: `${q.label}: responda antes da emissão final.` });
        }
      }
    }
  }

  if (shouldCheck('partes')) {
    if (state.parties.length === 0) {
      emptyPendencies.push({
        key: 'parties.list',
        label: 'Ao menos uma parte qualificada',
        step_id: 'partes',
        criticality: 'legal_required',
        reason: 'Nenhuma parte cadastrada ainda',
      });
      finalBlockers.push({
        key: 'parties.list',
        label: 'Partes envolvidas',
        step_id: 'partes',
        message: 'Informe ao menos uma parte com nome, documento e papel.',
      });
    }
    state.parties.forEach((p, idx) => {
      const roleLabel = p.role === 'seller' ? `Vendedor ${idx + 1}` : p.role === 'buyer' ? `Comprador ${idx + 1}` : `Parte ${idx + 1}`;
      if (!p.full_name.trim()) {
        const msg = `${roleLabel}: informe o nome completo ou razão social.`;
        emptyPendencies.push({ key: `party.${p.id}.full_name`, label: `Nome de ${roleLabel}`, step_id: 'partes', criticality: 'legal_required', reason: 'Nome não informado' });
        finalBlockers.push({ key: `party.${p.id}.full_name`, label: `Nome de ${roleLabel}`, step_id: 'partes', message: msg });
      }
      const digits = digitsOnly(p.tax_id);
      if (!digits) {
        emptyPendencies.push({
          key: `party.${p.id}.tax_id`,
          label: `${p.entity_type === 'company' ? 'CNPJ' : 'CPF'} de ${p.full_name.trim() || roleLabel}`,
          step_id: 'partes',
          criticality: 'legal_required',
          reason: 'Documento não informado',
        });
        finalBlockers.push({
          key: `party.${p.id}.tax_id`,
          label: `${p.entity_type === 'company' ? 'CNPJ' : 'CPF'} de ${roleLabel}`,
          step_id: 'partes',
          message: `${p.full_name.trim() || roleLabel}: informe o ${p.entity_type === 'company' ? 'CNPJ' : 'CPF'} antes da conclusão final.`,
        });
      } else {
        const valid = p.entity_type === 'company' ? validCnpj(digits) : validCpf(digits);
        if (!valid) {
          const err: FieldValidationError = {
            key: `party.${p.id}.tax_id`,
            label: `${p.entity_type === 'company' ? 'CNPJ' : 'CPF'} de ${p.full_name.trim() || roleLabel}`,
            step_id: 'partes',
            message: `${p.full_name.trim() || roleLabel}: confira os dígitos do ${p.entity_type === 'company' ? 'CNPJ' : 'CPF'}.`,
          };
          invalidFields.push(err);
          finalBlockers.push(err);
        }
      }
      if (p.entity_type === 'person' && !p.address?.trim()) {
        emptyPendencies.push({
          key: `party.${p.id}.address`,
          label: `Endereço de ${p.full_name.trim() || roleLabel}`,
          step_id: 'partes',
          criticality: 'recommended',
          reason: 'Endereço ainda não informado',
        });
      }
      const needsSpouse = p.entity_type === 'person' && (p.marital_status === 'casado' || p.marital_status === 'uniao_estavel' || p.has_spouse);
      if (needsSpouse) {
        if (!p.property_regime) {
          emptyPendencies.push({
            key: `party.${p.id}.property_regime`,
            label: `Regime de bens de ${p.full_name.trim() || roleLabel}`,
            step_id: 'partes',
            criticality: 'legal_required',
            reason: 'Regime de bens pendente',
          });
          finalBlockers.push({
            key: `party.${p.id}.property_regime`,
            label: `Regime de bens de ${roleLabel}`,
            step_id: 'partes',
            message: `${p.full_name.trim() || roleLabel}: selecione o regime de bens.`,
          });
        }
        if (!p.spouse?.full_name.trim()) {
          emptyPendencies.push({
            key: `party.${p.id}.spouse.full_name`,
            label: `Nome do cônjuge/companheiro(a) de ${p.full_name.trim() || roleLabel}`,
            step_id: 'partes',
            criticality: 'legal_required',
            reason: 'Dados do cônjuge pendentes',
          });
          finalBlockers.push({
            key: `party.${p.id}.spouse.full_name`,
            label: `Cônjuge de ${roleLabel}`,
            step_id: 'partes',
            message: `${p.full_name.trim() || roleLabel}: informe o nome do cônjuge ou companheiro(a).`,
          });
        }
        if (p.spouse?.cpf?.trim() && !validCpf(p.spouse.cpf)) {
          const err: FieldValidationError = {
            key: `party.${p.id}.spouse.cpf`,
            label: `CPF do cônjuge de ${p.full_name.trim() || roleLabel}`,
            step_id: 'partes',
            message: `Cônjuge de ${p.full_name.trim() || roleLabel}: CPF inválido.`,
          };
          invalidFields.push(err);
          finalBlockers.push(err);
        } else if (!p.spouse?.cpf?.trim()) {
          emptyPendencies.push({
            key: `party.${p.id}.spouse.cpf`,
            label: `CPF do cônjuge de ${p.full_name.trim() || roleLabel}`,
            step_id: 'partes',
            criticality: 'recommended',
            reason: 'CPF do cônjuge pendente',
          });
        }
      }
      if (p.entity_type === 'company' && !p.legal_representative_name?.trim()) {
        emptyPendencies.push({
          key: `party.${p.id}.legal_representative_name`,
          label: `Representante legal de ${p.full_name.trim() || roleLabel}`,
          step_id: 'partes',
          criticality: 'legal_required',
          reason: 'Representante da pessoa jurídica pendente',
        });
        finalBlockers.push({
          key: `party.${p.id}.legal_representative_name`,
          label: `Representante de ${roleLabel}`,
          step_id: 'partes',
          message: `${p.full_name.trim() || roleLabel}: informe o representante legal da empresa.`,
        });
      }
    });
  }

  for (const field of config.fields) {
    if (!shouldCheck(field.step_id)) continue;
    if (!evaluateConditions(field.conditions, allValues)) continue;
    const raw = (state.answers[field.key] ?? '').trim();
    if (!raw) {
      emptyPendencies.push({
        key: field.key,
        label: field.label,
        step_id: field.step_id,
        criticality: field.criticality,
        reason: 'Campo ainda não preenchido',
      });
      if (field.criticality === 'legal_required') {
        finalBlockers.push({
          key: field.key,
          label: field.label,
          step_id: field.step_id,
          message: `${field.label}: campo obrigatório para conclusão final.`,
        });
      }
    } else {
      const formatErr = validateTypedValue(field.input_type, raw);
      if (formatErr) {
        const err: FieldValidationError = {
          key: field.key,
          label: field.label,
          step_id: field.step_id,
          message: `${field.label}: ${formatErr}`,
        };
        invalidFields.push(err);
        finalBlockers.push(err);
      }
    }
  }

  return { emptyPendencies, invalidFields, finalBlockers };
}

export function validCorrectionRequestInput(v: unknown): v is CorrectionRequestInput {
  if (!documentObject(v)) return false;
  if (!documentUuid(v.document_id)) return false;
  if (v.publication_id !== undefined && v.publication_id !== null && !documentUuid(v.publication_id)) return false;
  if (!sanitizeText(v.section_key, 120) || !String(v.section_key).trim()) return false;
  if (!sanitizeText(v.incorrect_value, 1000)) return false;
  if (!sanitizeText(v.corrected_value, 1000) || !String(v.corrected_value).trim()) return false;
  if (!sanitizeText(v.description, 2000) || String(v.description).trim().length < 5) return false;
  if (!Array.isArray(v.attachment_ids) || v.attachment_ids.length > 10 || !v.attachment_ids.every((id) => documentUuid(id))) return false;
  return true;
}

export function validCourtesyInput(v: unknown): v is CourtesyInput {
  if (!documentObject(v)) return false;
  if (!documentUuid(v.request_id) || !documentUuid(v.idempotency_key)) return false;
  if (v.charge_id !== undefined && v.charge_id !== null && !documentUuid(v.charge_id)) return false;
  if (!sanitizeText(v.reason, 500) || String(v.reason).trim().length < 5) return false;
  return true;
}

export function validManualReadingInput(v: unknown): v is ManualReadingInput {
  if (!documentObject(v)) return false;
  if (!documentUuid(v.document_id)) return false;
  if (typeof v.revision !== 'number' || !Number.isSafeInteger(v.revision) || v.revision < 1) return false;
  if (!Array.isArray(v.clauses_reviewed) || v.clauses_reviewed.length > 100 || !v.clauses_reviewed.every((c) => sanitizeText(c, 160))) {
    return false;
  }
  if (typeof v.customer_confirmed !== 'boolean') return false;
  if (v.notes !== undefined && !sanitizeText(v.notes, 500)) return false;
  return true;
}

export function validSmartConfig(v: unknown): v is SmartTemplateConfig {
  if (!documentObject(v)) return false;
  if (v.version !== 1) return false;
  if (!['real_estate_sale', 'rural_property', 'declaration', 'application', 'official_letter', 'general_contract'].includes(String(v.domain))) return false;
  if (typeof v.allow_multiple_buyers !== 'boolean' || typeof v.allow_multiple_sellers !== 'boolean' || typeof v.enable_marital_agreement !== 'boolean') return false;
  if (!Array.isArray(v.initial_questions) || v.initial_questions.length > 20) return false;
  if (!Array.isArray(v.fields) || v.fields.length > 80) return false;
  if (!Array.isArray(v.supporting_docs) || v.supporting_docs.length > 30) return false;
  for (const q of v.initial_questions) {
    if (!documentObject(q) || !sanitizeText(q.key, 80) || !String(q.key).trim() || !sanitizeText(q.label, 200) || !String(q.label).trim()) return false;
    if (!['radio', 'select', 'boolean'].includes(String(q.input_type))) return false;
    if (!['legal_required', 'recommended', 'optional'].includes(String(q.criticality))) return false;
    if (!Array.isArray(q.options) || q.options.length > 20) return false;
  }
  for (const f of v.fields) {
    if (!documentObject(f) || !sanitizeText(f.key, 80) || !String(f.key).trim() || !sanitizeText(f.label, 160) || !String(f.label).trim()) return false;
    if (!['contexto', 'partes', 'objeto', 'pagamento', 'documentos'].includes(String(f.step_id))) return false;
    if (!['legal_required', 'recommended', 'optional'].includes(String(f.criticality))) return false;
  }
  for (const d of v.supporting_docs) {
    if (!documentObject(d) || !sanitizeText(d.id, 60) || !sanitizeText(d.label, 200) || typeof d.required !== 'boolean') return false;
  }
  return true;
}

export function extractTemplateVariablesFromText(content: string): TemplateVariable[] {
  const keys = [...new Set([...content.matchAll(/{{([^{}]*)}}/g)].map((m) => m[1].trim()).filter(Boolean))];
  return keys
    .filter((k) => Object.hasOwn(templateVariables, k) || isCustomTemplateKey(k))
    .map((key) => {
      if (Object.hasOwn(templateVariables, key)) {
        const meta = templateVariables[key];
        return { key, label: meta.label, type: meta.type, required: true };
      }
      const rawName = key.replace(/^documento\./, '').replace(/_/g, ' ');
      const label = rawName.charAt(0).toUpperCase() + rawName.slice(1);
      const guessedType: VariableType =
        /cpf/.test(key) ? 'cpf' : /cnpj/.test(key) ? 'cnpj' : /data|vencimento/.test(key) ? 'date' : /valor|preco|entrada|parcela/.test(key) ? 'money' : /area|qtd|quantidade|numero/.test(key) ? 'number' : 'text';
      return { key, label, type: guessedType, required: true };
    });
}

export function sanitizeSmartParties(parties: unknown): SmartPartyRecord[] {
  if (!Array.isArray(parties)) return [];
  return parties
    .filter((p): p is SmartPartyRecord => !!p && typeof p === 'object' && typeof (p as SmartPartyRecord).id === 'string')
    .slice(0, 20);
}

export function buildSummaryPreviewChips(kind: keyof typeof templateKinds): string {
  return templateKinds[kind];
}
