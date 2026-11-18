import test from 'node:test';
import assert from 'node:assert/strict';
import { validParticipants } from '../shared/documents.js';
import type { TemplateInput } from '../shared/templates.js';
import {
  evaluateConditions,
  evaluateStepPendencies,
  extractTemplateVariablesFromText,
  suggestSmartConfigFromTemplate,
  validSmartConfig,
  type SmartPartyRecord,
} from '../shared/smartDocument.js';
import {
  formatPartyQualificationPTBR,
  resolvePartiesAgreementGroup,
  resolveSmartDocument,
} from '../shared/smartDocumentRender.js';
import { SpeechReader, type ReadingState } from '../src/features/documentReading/speech.js';

const imovelTemplate: TemplateInput = {
  code: 'CONTRATO_IMOVEL_01',
  name: 'Contrato de Compra e Venda de Imóvel',
  kind: 'contract',
  content: [
    'CLÁUSULA 1 - DAS PARTES',
    'Vendedor: {{participante.vendedor.nome}} ({{participante.vendedor.cpf}})',
    'Comprador: {{participante.comprador.nome}} ({{participante.comprador.cpf}})',
    '',
    'CLÁUSULA 2 - DO OBJETO',
    'Matrícula {{documento.matricula_imovel}}, área {{documento.area_imovel}}, CCIR {{documento.ccir_numero}}, CAR {{documento.car_numero}}, IPTU {{documento.iptu_inscricao}}.',
    '',
    'CLÁUSULA 3 - DO PREÇO E PAGAMENTO',
    'Valor total de {{valores.total}} pago conforme {{documento.forma_pagamento}}.',
  ].join('\n\n'),
  variables: [
    { key: 'participante.vendedor.nome', label: 'Nome do vendedor', type: 'text', required: true },
    { key: 'participante.vendedor.cpf', label: 'CPF do vendedor', type: 'text', required: true },
    { key: 'participante.comprador.nome', label: 'Nome do comprador', type: 'text', required: true },
    { key: 'participante.comprador.cpf', label: 'CPF do comprador', type: 'text', required: true },
    { key: 'documento.matricula_imovel', label: 'Matrícula do imóvel', type: 'text', required: true },
    { key: 'documento.area_imovel', label: 'Área do imóvel', type: 'text', required: true },
    { key: 'documento.ccir_numero', label: 'Número do CCIR', type: 'text', required: false },
    { key: 'documento.car_numero', label: 'Número do CAR', type: 'text', required: false },
    { key: 'documento.iptu_inscricao', label: 'Inscrição do IPTU', type: 'text', required: false },
    { key: 'documento.forma_pagamento', label: 'Forma de pagamento', type: 'text', required: true },
    { key: 'valores.total', label: 'Valor total', type: 'money', required: true },
  ],
  signature_policy: 'physical',
  review_required: true,
  demonstration: false,
  effective_from: null,
  effective_until: null,
};

test('motor inteligente: detecta domínio, gera sugestões sem alterar texto jurídico e valida config', () => {
  const originalContent = imovelTemplate.content;
  const config = suggestSmartConfigFromTemplate(imovelTemplate);
  assert.equal(imovelTemplate.content, originalContent, 'Texto jurídico original preservado intacto');
  assert.equal(validSmartConfig(config), true);
  assert.equal(config.allow_multiple_buyers, true);
  assert.equal(config.allow_multiple_sellers, true);
  assert.equal(config.enable_marital_agreement, true);
  assert.ok(config.initial_questions.some((q) => q.key === 'smart.property_nature'));
  assert.equal(extractTemplateVariablesFromText(imovelTemplate.content).length, 11);
});

test('motor inteligente: permite avançar etapa com pendências secundárias e sinaliza exatamente os itens faltantes', () => {
  const config = suggestSmartConfigFromTemplate(imovelTemplate);
  const evalObjeto = evaluateStepPendencies(
    config,
    {
      initial_answers: {
        'smart.property_nature': 'urbano',
        'smart.payment_mode': 'a_vista',
      },
      answers: {},
      parties: [],
    },
    'objeto',
  );
  assert.equal(evalObjeto.invalidFields.length, 0);
  assert.ok(evalObjeto.emptyPendencies.length > 0, 'Pendências vazias sinalizadas para confirmação');
  assert.ok(evalObjeto.emptyPendencies.some((p) => p.key === 'documento.matricula_imovel'));

  // Formato inválido de CPF bloqueia com erro explícito (não é simples pendência vazia)
  const badCpfEval = evaluateStepPendencies(
    config,
    {
      initial_answers: {},
      answers: {},
      parties: [
        {
          id: 'p1',
          role: 'seller',
          entity_type: 'person',
          gender: 'feminine',
          full_name: 'Maria da Silva',
          tax_id: '123',
        },
      ],
    },
    'partes',
  );
  assert.ok(badCpfEval.invalidFields.some((f) => f.key.includes('tax_id')));
});

test('concordância gramatical PT-BR: gênero, estado civil, regime de bens e cônjuge', () => {
  const vendedoraCasada: SmartPartyRecord = {
    id: 's1',
    role: 'seller',
    entity_type: 'person',
    gender: 'feminine',
    full_name: 'Ana Paula Souza',
    tax_id: '52998224725',
    nationality: 'brasileira',
    profession: 'produtora rural',
    marital_status: 'casado',
    property_regime: 'comunhao_parcial',
    has_spouse: true,
    spouse: {
      full_name: 'Carlos Eduardo Souza',
      cpf: '11144477735',
      gender: 'masculine',
      nationality: 'brasileiro',
      profession: 'engenheiro agrônomo',
    },
    address: 'Fazenda Santa Clara, Zona Rural',
  };

  const textoVendedora = formatPartyQualificationPTBR(vendedoraCasada, 0, 1);
  assert.match(textoVendedora, /^A VENDEDORA: Ana Paula Souza/);
  assert.match(textoVendedora, /casada sob o regime de Comunhão parcial de bens/i);
  assert.match(textoVendedora, /juntamente com seu marido Carlos Eduardo Souza/);
  assert.match(textoVendedora, /CPF sob nº 111\.444\.777-35/);

  const compradorSolteiro: SmartPartyRecord = {
    id: 'b1',
    role: 'buyer',
    entity_type: 'person',
    gender: 'masculine',
    full_name: 'João Pedro Lima',
    tax_id: '11144477735',
    marital_status: 'solteiro',
  };
  const textoComprador = formatPartyQualificationPTBR(compradorSolteiro, 0, 1);
  assert.match(textoComprador, /^O COMPRADOR: João Pedro Lima/);
  assert.match(textoComprador, /, solteiro/);

  const empresaCompradora: SmartPartyRecord = {
    id: 'b2',
    role: 'buyer',
    entity_type: 'company',
    gender: 'entity',
    full_name: 'Agropecuária Horizonte Ltda',
    tax_id: '11222333000181',
    legal_representative_name: 'Marcos Oliveira',
    legal_representative_role: 'sócio administrador',
  };
  const textoEmpresa = formatPartyQualificationPTBR(empresaCompradora, 0, 1);
  assert.match(textoEmpresa, /pessoa jurídica de direito privado/);
  assert.match(textoEmpresa, /neste ato representada por Marcos Oliveira/);
});

test('múltiplos vendedores e compradores: plural automático e validação de participantes no contrato', () => {
  const sellers: SmartPartyRecord[] = [
    {
      id: 's1',
      role: 'seller',
      entity_type: 'person',
      gender: 'feminine',
      full_name: 'Maria Clara',
      tax_id: '52998224725',
      marital_status: 'divorciado',
    },
    {
      id: 's2',
      role: 'seller',
      entity_type: 'person',
      gender: 'masculine',
      full_name: 'Roberto Alves',
      tax_id: '11144477735',
      marital_status: 'viuvo',
    },
  ];
  const group = resolvePartiesAgreementGroup(sellers, 'seller');
  assert.equal(group.clauses.length, 2);
  assert.equal(group.isPlural, true);
  assert.equal(group.heading, 'OS(AS) VENDEDORES(AS)');
  assert.match(group.clauses[0], /^A VENDEDORA \(1º\): Maria Clara/);
  assert.match(group.clauses[1], /^O VENDEDOR \(2º\): Roberto Alves/);
  assert.equal(group.joinedNames, 'Maria Clara e Roberto Alves');

  // Shared validParticipants permite múltiplos buyers & sellers, rejeitando mesma pessoa nos dois papéis
  const okMulti = validParticipants([
    { role: 'seller', customer_id: '00000000-0000-4000-8000-000000000001', label: 'Vendedora 1' },
    { role: 'seller', customer_id: '00000000-0000-4000-8000-000000000002', label: 'Vendedor 2' },
    { role: 'buyer', customer_id: '00000000-0000-4000-8000-000000000003', label: 'Comprador 1' },
    { role: 'buyer', customer_id: '00000000-0000-4000-8000-000000000004', label: 'Compradora 2' },
  ]);
  assert.equal(okMulti, true);

  const sameAsBuyerAndSeller = validParticipants([
    { role: 'seller', customer_id: '00000000-0000-4000-8000-000000000001', label: 'Vendedor' },
    { role: 'buyer', customer_id: '00000000-0000-4000-8000-000000000001', label: 'Comprador' },
  ]);
  assert.equal(sameAsBuyerAndSeller, false);
});

test('condicional imóvel rural vs urbano: libera CCIR/CAR somente em rural e oculta IPTU urbano', () => {
  const config = suggestSmartConfigFromTemplate(imovelTemplate);
  const ccirField = config.fields.find((f) => f.key === 'documento.imovel_ccir');
  const iptuField = config.fields.find((f) => f.key === 'documento.imovel_iptu');
  assert.ok(ccirField);
  assert.ok(iptuField);

  assert.equal(evaluateConditions(ccirField.conditions, { 'smart.property_nature': 'rural' }), true);
  assert.equal(evaluateConditions(ccirField.conditions, { 'smart.property_nature': 'urbano' }), false);
  assert.equal(evaluateConditions(iptuField.conditions, { 'smart.property_nature': 'urbano' }), true);
  assert.equal(evaluateConditions(iptuField.conditions, { 'smart.property_nature': 'rural' }), false);

  const resolutionRural = resolveSmartDocument(
    imovelTemplate,
    config,
    { content: imovelTemplate.content, overrides: { 'documento.matricula_imovel': '12.345' }, money_in_words: true },
    {
      customer: null,
      service: { id: 's', version_id: 'v', description: 'Imóvel', quantity: 1, total_cents: 25000000 },
      emitted_on: '2026-11-18',
    },
    [],
    {
      initial_answers: { 'smart.property_nature': 'rural', 'smart.payment_mode': 'parcelado' },
      answers: {
        'documento.imovel_ccir': '999.888.777',
        'documento.imovel_car': 'MG-3100000-ABCD',
      },
      parties: [],
    },
  );
  assert.match(resolutionRural.rendered_content, /CCIR: 999\.888\.777/);
  assert.match(resolutionRural.rendered_content, /CAR: MG-3100000-ABCD/);
  assert.ok(resolutionRural.pendencies.length > 0);
});

test('modos de leitura: velocidade configurável (0.75x a 1.5x) e reinício no Ler em voz alta', () => {
  const spoken: SpeechSynthesisUtterance[] = [];
  const states: ReadingState[] = [];
  const synth = {
    getVoices: () => [{ lang: 'pt-BR', localService: true, name: 'Local', voiceURI: 'pt-BR', default: true } as SpeechSynthesisVoice],
    speak: (u: SpeechSynthesisUtterance) => spoken.push(u),
    cancel: () => {},
    pause: () => {},
    resume: () => {},
  };
  const reader = new SpeechReader(synth, () => ({} as SpeechSynthesisUtterance), (s) => states.push(s));
  reader.start('Primeira cláusula do documento.', 1.25);
  assert.equal(spoken.length, 1);
  assert.equal(spoken[0].rate, 1.25);
  assert.equal(states.at(-1), 'speaking');

  reader.setRate(1.5);
  reader.start('Reinício na nova velocidade.', 1.5);
  assert.equal(spoken[1].rate, 1.5);
});
