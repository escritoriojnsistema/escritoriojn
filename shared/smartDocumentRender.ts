import {resolveDocument} from './documentRender.js';
import type {DocumentParticipant,DocumentResolution,DocumentSource,DraftInput} from './documents.js';
import {digitsOnly,formatCnpj,formatCpf} from './identifiers.js';
import type {TemplateInput} from './templates.js';
import {
  evaluateStepPendencies,
  maritalStatusLabels,
  propertyRegimeLabels,
  type DeclaredGender,
  type MaritalStatus,
  type PendingFieldRecord,
  type PropertyRegime,
  type SmartPartyRecord,
  type SmartTemplateConfig,
} from './smartDocument.js';

export interface SmartDocumentSection {
  id: string;
  title: string;
  body: string;
  has_pendency: boolean;
}

export interface SmartDocumentResolution extends DocumentResolution {
  parties_clauses: string[];
  sections: SmartDocumentSection[];
  pendencies: PendingFieldRecord[];
  highlighted_tokens: Array<{ label: string; value: string; pending: boolean }>;
}

const roleNouns: Record<
  SmartPartyRecord['role'],
  {
    singular: Record<DeclaredGender, { article: string; noun: string }>;
    plural: { masculine: string; feminine: string; mixed: string };
  }
> = {
  seller: {
    singular: {
      masculine: { article: 'O', noun: 'VENDEDOR' },
      feminine: { article: 'A', noun: 'VENDEDORA' },
      neutral: { article: 'A', noun: 'PARTE VENDEDORA' },
      entity: { article: 'A', noun: 'VENDEDORA (PESSOA JURÍDICA)' },
    },
    plural: { masculine: 'OS VENDEDORES', feminine: 'AS VENDEDORAS', mixed: 'OS(AS) VENDEDORES(AS)' },
  },
  buyer: {
    singular: {
      masculine: { article: 'O', noun: 'COMPRADOR' },
      feminine: { article: 'A', noun: 'COMPRADORA' },
      neutral: { article: 'A', noun: 'PARTE COMPRADORA' },
      entity: { article: 'A', noun: 'COMPRADORA (PESSOA JURÍDICA)' },
    },
    plural: { masculine: 'OS COMPRADORES', feminine: 'AS COMPRADORAS', mixed: 'OS(AS) COMPRADORES(AS)' },
  },
  representative: {
    singular: {
      masculine: { article: 'O', noun: 'REPRESENTANTE' },
      feminine: { article: 'A', noun: 'REPRESENTANTE' },
      neutral: { article: 'A', noun: 'PARTE REPRESENTANTE' },
      entity: { article: 'A', noun: 'REPRESENTANTE LEGAL' },
    },
    plural: { masculine: 'OS REPRESENTANTES', feminine: 'AS REPRESENTANTES', mixed: 'OS(AS) REPRESENTANTES' },
  },
  guardian: {
    singular: {
      masculine: { article: 'O', noun: 'RESPONSÁVEL' },
      feminine: { article: 'A', noun: 'RESPONSÁVEL' },
      neutral: { article: 'A', noun: 'PARTE RESPONSÁVEL' },
      entity: { article: 'A', noun: 'RESPONSÁVEL' },
    },
    plural: { masculine: 'OS RESPONSÁVEIS', feminine: 'AS RESPONSÁVEIS', mixed: 'OS(AS) RESPONSÁVEIS' },
  },
  other: {
    singular: {
      masculine: { article: 'O', noun: 'INTERESSADO' },
      feminine: { article: 'A', noun: 'INTERESSADA' },
      neutral: { article: 'A', noun: 'PARTE INTERESSADA' },
      entity: { article: 'A', noun: 'INTERESSADA' },
    },
    plural: { masculine: 'OS INTERESSADOS', feminine: 'AS INTERESSADAS', mixed: 'OS(AS) INTERESSADOS(AS)' },
  },
};

function inflectMaritalStatus(status: MaritalStatus | undefined, gender: DeclaredGender): string {
  if (!status) return '[Pendente: estado civil]';
  const fem = gender === 'feminine';
  switch (status) {
    case 'solteiro':
      return fem ? 'solteira' : gender === 'neutral' ? 'em estado civil solteiro(a)' : 'solteiro';
    case 'casado':
      return fem ? 'casada' : gender === 'neutral' ? 'em matrimônio' : 'casado';
    case 'divorciado':
      return fem ? 'divorciada' : gender === 'neutral' ? 'divorciado(a)' : 'divorciado';
    case 'viuvo':
      return fem ? 'viúva' : gender === 'neutral' ? 'viúvo(a)' : 'viúvo';
    case 'uniao_estavel':
      return fem ? 'convivente em união estável' : 'convivente em união estável';
    default:
      return maritalStatusLabels[status];
  }
}

export function spouseConnectorPhrase(spouseGender: Exclude<DeclaredGender, 'entity'>, marital?: MaritalStatus): string {
  if (marital === 'uniao_estavel') {
    if (spouseGender === 'feminine') return 'convivente em união estável com sua companheira';
    if (spouseGender === 'masculine') return 'convivente em união estável com seu companheiro';
    return 'convivente em união estável com seu(sua) companheiro(a)';
  }
  if (spouseGender === 'feminine') return 'juntamente com sua esposa';
  if (spouseGender === 'masculine') return 'juntamente com seu marido';
  return 'juntamente com seu cônjuge';
}

export function regimeRequiresOutorga(regime: PropertyRegime | undefined): boolean {
  if (!regime) return true;
  return regime !== 'separacao_total';
}

export function formatPartyQualificationPTBR(party: SmartPartyRecord, indexInRole: number, totalInRole: number): string {
  const roleInfo = roleNouns[party.role];
  const gender: DeclaredGender = party.entity_type === 'company' ? 'entity' : party.gender;
  const nounInfo = roleInfo.singular[gender];
  const ordinalTag = totalInRole > 1 ? ` (${indexInRole + 1}º)` : '';
  const nameText = party.full_name.trim() || `[Pendente: Nome d${nounInfo.article.toLowerCase()} ${nounInfo.noun.toLowerCase()}]`;
  const digits = digitsOnly(party.tax_id);

  if (party.entity_type === 'company') {
    const cnpjText = digits.length === 14 ? formatCnpj(digits) : '[Pendente: CNPJ]';
    const repName = party.legal_representative_name?.trim() || '[Pendente: Representante legal]';
    const repCpfDigits = digitsOnly(party.legal_representative_cpf ?? '');
    const repCpfText = repCpfDigits.length === 11 ? `, CPF nº ${formatCpf(repCpfDigits)}` : '';
    const repRole = party.legal_representative_role?.trim() || 'representante legal';
    const addrText = party.address?.trim() ? `, com sede em ${party.address.trim()}` : ', [Pendente: endereço da sede]';
    return `${nounInfo.article} ${nounInfo.noun}${ordinalTag}: ${nameText}, pessoa jurídica de direito privado, inscrita no CNPJ sob nº ${cnpjText}${addrText}, neste ato representada por ${repName} (${repRole}${repCpfText}).`;
  }

  const cpfText = digits.length === 11 ? formatCpf(digits) : '[Pendente: CPF]';
  const bearerWord = gender === 'feminine' ? 'portadora' : gender === 'masculine' ? 'portador' : 'titular';
  const registeredWord = gender === 'feminine' ? 'inscrita' : 'inscrito';
  const nationality = party.nationality?.trim() || 'brasileiro(a)';
  const profession = party.profession?.trim() ? `, ${party.profession.trim()}` : '';
  const marital = inflectMaritalStatus(party.marital_status, gender);
  const rgText = party.rg?.trim() ? `, ${bearerWord} do RG nº ${party.rg.trim()}` : '';
  const addrText = party.address?.trim() ? `, residente e domiciliad${gender === 'feminine' ? 'a' : 'o'} em ${party.address.trim()}` : ', [Pendente: endereço residencial]';

  let text = `${nounInfo.article} ${nounInfo.noun}${ordinalTag}: ${nameText}, ${nationality}${profession}, ${marital}`;

  const hasPartner = party.marital_status === 'casado' || party.marital_status === 'uniao_estavel' || party.has_spouse;
  if (hasPartner) {
    const regimeText = party.property_regime ? propertyRegimeLabels[party.property_regime] : '[Pendente: regime de bens]';
    const spouse = party.spouse;
    const spouseGender = spouse?.gender ?? 'neutral';
    const connector = spouseConnectorPhrase(spouseGender, party.marital_status);
    const spouseName = spouse?.full_name?.trim() || '[Pendente: nome do cônjuge/companheiro(a)]';
    const spouseCpfDigits = digitsOnly(spouse?.cpf ?? '');
    const spouseCpfText = spouseCpfDigits.length === 11 ? formatCpf(spouseCpfDigits) : '[Pendente: CPF do cônjuge]';
    const outorgaNote =
      party.role === 'seller'
        ? regimeRequiresOutorga(party.property_regime)
          ? ' (com outorga conjugal obrigatória)'
          : ' (dispensada a vênia conjugal conforme regime de bens, se imóvel particular)'
        : '';
    text += ` sob o regime de ${regimeText}, ${connector} ${spouseName}, inscrito(a) no CPF sob nº ${spouseCpfText}${outorgaNote}`;
  }

  text += `${rgText}, ${registeredWord} no CPF sob nº ${cpfText}${addrText}.`;
  return text;
}

export function resolvePartiesAgreementGroup(parties: SmartPartyRecord[], role: SmartPartyRecord['role']): {
  heading: string;
  clauses: string[];
  joinedNames: string;
  isPlural: boolean;
} {
  const matched = parties.filter((p) => p.role === role);
  if (matched.length === 0) {
    return {
      heading: roleNouns[role].singular.neutral.noun,
      clauses: [],
      joinedNames: '',
      isPlural: false,
    };
  }
  const allFem = matched.every((p) => (p.entity_type === 'company' ? false : p.gender === 'feminine'));
  const allMasc = matched.every((p) => (p.entity_type === 'company' ? false : p.gender === 'masculine'));
  const heading =
    matched.length > 1
      ? allFem
        ? roleNouns[role].plural.feminine
        : allMasc
          ? roleNouns[role].plural.masculine
          : roleNouns[role].plural.mixed
      : `${roleNouns[role].singular[matched[0].entity_type === 'company' ? 'entity' : matched[0].gender].article} ${roleNouns[role].singular[matched[0].entity_type === 'company' ? 'entity' : matched[0].gender].noun}`;

  const clauses = matched.map((p, i) => formatPartyQualificationPTBR(p, i, matched.length));
  const names = matched.map((p) => p.full_name.trim() || '[Pendente: Nome]');
  const joinedNames =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return {
    heading,
    clauses,
    joinedNames,
    isPlural: matched.length > 1,
  };
}

function splitSections(text: string): SmartDocumentSection[] {
  const lines = text.split(/\n{2,}/).filter((block) => block.trim().length > 0);
  if (lines.length === 0) {
    return [{ id: 'sec-1', title: 'Corpo do documento', body: '[Documento sem conteúdo]', has_pendency: true }];
  }
  return lines.map((block, index) => {
    const firstLine = block.split('\n')[0]?.trim() ?? '';
    const looksLikeHeading =
      firstLine.length > 0 &&
      firstLine.length <= 90 &&
      (/^cl[áa]usula\b/i.test(firstLine) ||
        /^do\s+objeto\b/i.test(firstLine) ||
        /^das?\s+partes\b/i.test(firstLine) ||
        /^do\s+pre[çc]o\b/i.test(firstLine) ||
        /^[0-9]+[.)\-]\s+/.test(firstLine) ||
        firstLine === firstLine.toUpperCase());
    const title = looksLikeHeading ? firstLine : `Seção ${index + 1}`;
    return {
      id: `sec-${index + 1}`,
      title,
      body: block.trim(),
      has_pendency: /\[Pendente:/i.test(block),
    };
  });
}

export function resolveSmartDocument(
  definition: TemplateInput,
  config: SmartTemplateConfig,
  input: DraftInput,
  source: DocumentSource,
  participants: DocumentParticipant[],
  smartState: {
    initial_answers: Record<string, string>;
    answers: Record<string, string>;
    parties: SmartPartyRecord[];
  },
): SmartDocumentResolution {
  const sellerGroup = resolvePartiesAgreementGroup(smartState.parties, 'seller');
  const buyerGroup = resolvePartiesAgreementGroup(smartState.parties, 'buyer');
  const repGroup = resolvePartiesAgreementGroup(smartState.parties, 'representative');
  const mergedOverrides: Record<string, string> = { ...input.overrides };

  if (sellerGroup.joinedNames && !mergedOverrides['participante.vendedor.nome']) {
    mergedOverrides['participante.vendedor.nome'] = sellerGroup.joinedNames;
  }
  const firstSellerCpf = digitsOnly(smartState.parties.find((p) => p.role === 'seller')?.tax_id ?? '');
  if (firstSellerCpf.length === 11 && !mergedOverrides['participante.vendedor.cpf']) {
    mergedOverrides['participante.vendedor.cpf'] = firstSellerCpf;
  }

  if (buyerGroup.joinedNames && !mergedOverrides['participante.comprador.nome']) {
    mergedOverrides['participante.comprador.nome'] = buyerGroup.joinedNames;
  }
  const firstBuyerCpf = digitsOnly(smartState.parties.find((p) => p.role === 'buyer')?.tax_id ?? '');
  if (firstBuyerCpf.length === 11 && !mergedOverrides['participante.comprador.cpf']) {
    mergedOverrides['participante.comprador.cpf'] = firstBuyerCpf;
  }

  for (const v of definition.variables) {
    if (!Object.hasOwn(mergedOverrides, v.key) && typeof smartState.answers[v.key] === 'string' && smartState.answers[v.key].trim()) {
      mergedOverrides[v.key] = smartState.answers[v.key].trim();
    }
  }

  const base = resolveDocument(
    definition,
    { ...input, overrides: mergedOverrides },
    source,
    participants,
  );

  const partiesClauses = [
    ...sellerGroup.clauses,
    ...buyerGroup.clauses,
    ...repGroup.clauses,
    ...resolvePartiesAgreementGroup(smartState.parties, 'guardian').clauses,
    ...resolvePartiesAgreementGroup(smartState.parties, 'other').clauses,
  ];

  let rendered = base.rendered_content;
  if (partiesClauses.length > 0) {
    const partyBlock = `\n\nQUALIFICAÇÃO DAS PARTES (${sellerGroup.clauses.length ? sellerGroup.heading : ''}${sellerGroup.clauses.length && buyerGroup.clauses.length ? ' e ' : ''}${buyerGroup.clauses.length ? buyerGroup.heading : ''}):\n${partiesClauses.join('\n')}`;
    if (rendered.includes('{{blocos.partes}}')) {
      rendered = rendered.replace(/\{\{blocos\.partes\}\}/g, partiesClauses.join('\n'));
    } else if (!rendered.includes(partiesClauses[0])) {
      rendered = `${rendered.trim()}${partyBlock}`;
    }
  }

  const ruralLines: string[] = [];
  if (smartState.initial_answers['smart.property_nature'] === 'rural') {
    if (smartState.answers['documento.imovel_matricula']) ruralLines.push(`Matrícula / Registro: ${smartState.answers['documento.imovel_matricula']}`);
    if (smartState.answers['documento.imovel_ccir']) ruralLines.push(`CCIR: ${smartState.answers['documento.imovel_ccir']}`);
    if (smartState.answers['documento.imovel_car']) ruralLines.push(`CAR: ${smartState.answers['documento.imovel_car']}`);
  } else if (smartState.initial_answers['smart.property_nature'] === 'urbano') {
    if (smartState.answers['documento.imovel_matricula']) ruralLines.push(`Matrícula / Registro: ${smartState.answers['documento.imovel_matricula']}`);
    if (smartState.answers['documento.imovel_iptu']) ruralLines.push(`Inscrição / IPTU: ${smartState.answers['documento.imovel_iptu']}`);
  }
  if (smartState.answers['documento.imovel_endereco']) {
    ruralLines.push(`Localização do imóvel: ${smartState.answers['documento.imovel_endereco']}`);
  }
  if (smartState.answers['documento.imovel_area']) {
    ruralLines.push(`Área / confrontações: ${smartState.answers['documento.imovel_area']}`);
  }
  if (ruralLines.length > 0) {
    const missingFromBody = ruralLines.filter((line) => !rendered.includes(line));
    if (missingFromBody.length > 0) {
      rendered += `\n\nCARACTERIZAÇÃO DO OBJETO:\n${missingFromBody.join('\n')}`;
    }
  }

  const payLines: string[] = [];
  const payMode = smartState.initial_answers['smart.payment_mode'];
  if (payMode) {
    const modeLabel =
      payMode === 'a_vista'
        ? 'À vista'
        : payMode === 'parcelado'
          ? 'Parcelado entre as partes'
          : payMode === 'financiamento'
            ? 'Financiamento bancário / consórcio'
            : 'Permuta / misto';
    payLines.push(`Modalidade de pagamento: ${modeLabel}`);
  }
  if (smartState.answers['documento.pagamento_entrada']) {
    payLines.push(`Sinal / Entrada: R$ ${smartState.answers['documento.pagamento_entrada']}`);
  }
  if (smartState.answers['documento.pagamento_qtd_parcelas']) {
    payLines.push(`Parcelamento: ${smartState.answers['documento.pagamento_qtd_parcelas']}`);
  }
  if (smartState.answers['documento.clausulas_especiais']) {
    payLines.push(`Condições especiais: ${smartState.answers['documento.clausulas_especiais']}`);
  }
  if (payLines.length > 0) {
    const missingPay = payLines.filter((line) => !rendered.includes(line));
    if (missingPay.length > 0) {
      rendered += `\n\nCONDIÇÕES E PAGAMENTO:\n${missingPay.join('\n')}`;
    }
  }

  const evalResult = evaluateStepPendencies(config, smartState);
  const highlighted_tokens: Array<{ label: string; value: string; pending: boolean }> = [];
  for (const v of definition.variables) {
    const fmt = base.formatted[v.key];
    highlighted_tokens.push({
      label: v.label,
      value: fmt || `[Pendente: ${v.label}]`,
      pending: !fmt,
    });
  }
  for (const f of config.fields) {
    if (definition.variables.some((v) => v.key === f.key)) continue;
    const val = (smartState.answers[f.key] ?? '').trim();
    if (val || f.criticality === 'legal_required') {
      highlighted_tokens.push({
        label: f.label,
        value: val || `[Pendente: ${f.label}]`,
        pending: !val,
      });
    }
  }

  return {
    ...base,
    rendered_content: rendered,
    parties_clauses: partiesClauses,
    sections: splitSections(rendered),
    pendencies: evalResult.emptyPendencies,
    highlighted_tokens,
  };
}
