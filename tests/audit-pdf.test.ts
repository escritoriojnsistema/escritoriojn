import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createAuditPdf } from '../server/modules/governance/auditPdf.js';
import type { AuditPdfEvent, AuditPdfInput } from '../server/modules/governance/auditPdf.js';

const event = (index = 1): AuditPdfEvent => ({
  actionLabel: 'Conciliação registrada',
  occurredAt: '2026-10-23T18:15:00-03:00',
  actorName: 'João da Conceição',
  targetLabel: 'Atendimento de São Luís',
  outcomeLabel: 'Concluído',
  changes: [{ label: 'Observação', value: `Informação integral número ${index}: ação, gestão e revisão.` }],
  reference: `REFERÊNCIA-ÚNICA-${String(index).padStart(4, '0')}`,
});

const input = (overrides: Partial<AuditPdfInput> = {}): AuditPdfInput => ({
  reportId: 'JN-AUD-DEMONSTRACAO-2026',
  officeName: 'Escritório JN — São Luís',
  actorName: 'Érica Gonçalves',
  generatedAt: '2026-10-23T18:30:00-03:00',
  scopeLabel: 'Recentes',
  filters: { 'Período inicial': '2026-10-01', 'Período final': '2026-10-23', Ação: 'Conciliação registrada' },
  events: [event()],
  totalEvents: 1,
  ...overrides,
});

type Inspection = {
  pages: {
    text: string;
    bodyText: string;
    width: number;
    height: number;
    images: number;
    watermarkCount: number;
    watermarkOpacity: number;
    watermarkBehind: boolean;
    bodyWithinMargins: boolean;
    embeddedFonts: boolean;
  }[];
  title: string;
  author: string;
  creationDate: string;
  modificationDate: string;
  javascript: boolean;
};

// Independent parsers inspect finished bytes, paint order, embedded fonts and bounds.
const inspectScript = String.raw`
import json, sys, fitz
from pypdf import PdfReader
reader = PdfReader(sys.argv[1], strict=True)
doc = fitz.open(sys.argv[1])
pages = []
for page in doc:
    traces = page.get_texttrace()
    def text(trace):
        return ''.join(chr(c[0]) for c in trace['chars'])
    marks = [t for t in traces if text(t) == 'ESCRITÓRIO JN' and t['opacity'] < .15]
    visible = [t for t in traces if t['opacity'] > .9]
    body = [t for t in visible if t['bbox'][1] >= 120 and t['bbox'][1] < 770]
    fonts = list(page.get_fonts(full=True))
    pages.append(dict(
        text=page.get_text(), bodyText=''.join(text(t) for t in body if not text(t).endswith(' — continuação')),
        width=page.rect.width, height=page.rect.height,
        images=len(page.get_images()), watermarkCount=len(marks),
        watermarkOpacity=marks[0]['opacity'] if marks else 1,
        watermarkBehind=bool(marks) and all(marks[0]['seqno'] < t['seqno'] for t in visible),
        bodyWithinMargins=all(t['bbox'][0] >= 42 and t['bbox'][2] <= page.rect.width-42 and t['bbox'][3] <= 763 for t in body),
        embeddedFonts=bool(fonts) and all(bool(doc.extract_font(f[0])[3]) for f in fonts),
    ))
root = reader.trailer['/Root']
names = root.get('/Names')
print(json.dumps(dict(pages=pages, title=str(reader.metadata['/Title']), author=str(reader.metadata['/Author']),
    creationDate=str(reader.metadata['/CreationDate']), modificationDate=str(reader.metadata['/ModDate']),
    javascript=bool(root.get('/OpenAction') or root.get('/AA') or (names and names.get_object().get('/JavaScript'))))))
`;

async function inspect(report: AuditPdfInput) {
  const bytes = await createAuditPdf(report);
  assert.ok(bytes instanceof Uint8Array);
  assert.equal(Buffer.from(bytes.subarray(0, 5)).toString(), '%PDF-');
  assert.ok(bytes.length > 2_000);
  const directory = await mkdtemp(join(tmpdir(), 'jn-audit-pdf-'));
  try {
    const file = join(directory, 'relatorio.pdf');
    await writeFile(file, bytes);
    const text = execFileSync('pdftotext', ['-layout', file, '-'], { encoding: 'utf8', maxBuffer: 20_000_000 });
    const parsed = JSON.parse(execFileSync('python', ['-c', inspectScript, file], { encoding: 'utf8', maxBuffer: 20_000_000 })) as Inspection;
    return { bytes, text, parsed };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

function checkPages(parsed: Inspection) {
  for (const [index, page] of parsed.pages.entries()) {
    assert.ok(Math.abs(page.width - 595.28) < 0.1, 'largura A4');
    assert.ok(Math.abs(page.height - 841.89) < 0.1, 'altura A4');
    assert.equal(page.images, 0, 'texto e identidade vetoriais');
    assert.equal(page.watermarkCount, 1, 'uma marca d’água exata em cada página');
    assert.ok(page.watermarkOpacity > 0 && page.watermarkOpacity <= 0.08);
    assert.equal(page.watermarkBehind, true, 'marca desenhada antes do conteúdo');
    assert.equal(page.bodyWithinMargins, true, 'conteúdo fora do cabeçalho/rodapé e dentro da largura');
    assert.equal(page.embeddedFonts, true, 'fontes incorporadas em todas as páginas');
    assert.match(page.text, /Relatório de auditoria/);
    assert.match(page.text, new RegExp(`Página ${index + 1} de ${parsed.pages.length}`));
    assert.match(page.text, /Verifique a integridade no sistema/);
  }
  assert.equal(parsed.javascript, false);
}

test('relatório vazio é PDF A4 útil, com identidade, protocolo e total zero', async () => {
  const { text, parsed } = await inspect(input({ events: [], totalEvents: 0 }));
  assert.equal(parsed.pages.length, 1);
  assert.equal(parsed.title, 'Relatório de auditoria');
  assert.equal(parsed.author, 'Érica Gonçalves');
  assert.match(text, /Nenhum evento encontrado/);
  assert.match(text, /Total de eventos:\s*0/);
  assert.match(text, /Escopo:\s*Recentes/);
  assert.match(text, /JN-AUD-DEMONSTRACAO-2026/);
  assert.doesNotMatch(text, /inviolável|ICP-Brasil|SHA-?256/i);
  checkPages(parsed);
});

test('preserva escopo exato, filtros, acentos e todos os campos; datas ficam em pt-BR e UTC', async () => {
  const record = event();
  record.changes.push({ label: 'Valor', value: 'R$ 1.234,56' });
  const { text, parsed } = await inspect(input({ scopeLabel: 'Arquivados', events: [record] }));
  for (const value of ['Arquivados', 'Érica Gonçalves', 'Escritório JN', 'São Luís', 'João da Conceição',
    'Conciliação registrada', 'Atendimento de São Luís', 'Concluído', record.reference, 'R$ 1.234,56',
    'Período inicial', '01/10/2026', 'Período final', '23/10/2026', '21:30:00 UTC', '21:15:00 UTC']) {
    assert.ok(text.includes(value), `conteúdo presente: ${value}`);
  }
  assert.match(text, /Total de eventos:\s*1\b/);
  checkPages(parsed);
});

test('múltiplas páginas conservam cada evento e detalhes que atravessam páginas', async () => {
  const records = Array.from({ length: 36 }, (_, index) => event(index + 1));
  const paragraphs = Array.from({ length: 170 }, (_, index) => `TRECHO-${String(index).padStart(4, '0')} — Conferência de informação e revisão integral.`);
  records[0].changes.push({ label: 'Detalhamento extenso', value: paragraphs.join('\n') });
  const { text, parsed } = await inspect(input({ events: records, totalEvents: records.length }));
  assert.ok(parsed.pages.length > 5);
  for (const record of records) assert.ok(text.includes(record.reference), record.reference);
  for (let index = 0; index < paragraphs.length; index++) {
    assert.ok(text.includes(`TRECHO-${String(index).padStart(4, '0')}`), `trecho ${index} preservado`);
  }
  assert.match(text, /Total de eventos:\s*36\b/);
  assert.match(text, /continuação/);
  checkPages(parsed);
});

test('metadados, filtros e palavras sem espaços crescem sem corte ou sobreposição', async () => {
  const longName = Array.from({ length: 160 }, (_, i) => `FILIAL-${i}`).join(' ');
  const unbroken = 'Á'.repeat(2_000) + 'FIM-SEM-ESPAÇOS';
  const record = event();
  record.targetLabel = unbroken;
  const report = input({ officeName: longName, reportId: 'PROTOCOLO-'.repeat(100) + 'FINAL', filters: { Unidade: longName }, events: [record] });
  const { text, parsed } = await inspect(report);
  const compact = parsed.pages.map(page => page.bodyText).join('').replace(/\s/g, '');
  assert.ok(compact.includes(unbroken));
  assert.ok(compact.includes(report.reportId));
  assert.ok(text.includes('FILIAL-159'));
  assert.ok(parsed.pages.length >= 3);
  checkPages(parsed);
});

test('nomes internacionais usam glifos reais ou fallback Unicode explícito, sem omissão', async () => {
  const record = event();
  record.actorName = 'Jose\u0301 Łukasz Dvořák Александр 李 🙂';
  const { text, parsed } = await inspect(input({ events: [record] }));
  assert.match(text, /José Łukasz Dvořák Александр/);
  assert.match(text, /\[U\+674E\]/);
  assert.match(text, /\[U\+1F642\]/);
  assert.match(text, /código Unicode/);
  checkPages(parsed);
});

test('texto arbitrário fica literal, sem ações PDF ou scripts executáveis', async () => {
  const record = event();
  record.changes = [{ label: 'Texto fornecido', value: '<script>alert("teste")</script> & (parênteses) \\ caminho /JavaScript /OpenAction' }];
  const { text, parsed } = await inspect(input({ events: [record] }));
  assert.ok(text.includes('<script>alert("teste")</script>'));
  assert.ok(text.includes('& (parênteses) \\ caminho /JavaScript /OpenAction'));
  checkPages(parsed);
});

test('recusa totais divergentes ou inválidos e datas sem fuso, sem emitir relatório parcial', async () => {
  for (const totalEvents of [0, 2, -1, 1.5, Number.NaN]) {
    await assert.rejects(createAuditPdf(input({ totalEvents })), /total de eventos/i);
  }
  for (const generatedAt of ['inválida', '2026-10-23T18:30:00']) {
    await assert.rejects(createAuditPdf(input({ generatedAt })), /data.*fuso/i);
  }
  await assert.rejects(createAuditPdf(input({ events: [{ ...event(), occurredAt: 'inválida' }] })), /data.*fuso/i);
});

test('gerações concorrentes não alteram o DTO nem misturam conteúdo de relatórios', async () => {
  const first = input({ reportId: 'RELATÓRIO-ALFA', officeName: 'Unidade Alfa', events: [], totalEvents: 0 });
  const second = input({ reportId: 'RELATÓRIO-BETA', officeName: 'Unidade Beta', events: [], totalEvents: 0 });
  const original = structuredClone(first);
  const [a, b] = await Promise.all([inspect(first), inspect(second)]);
  assert.deepEqual(first, original);
  assert.ok(a.text.includes('RELATÓRIO-ALFA'));
  assert.ok(b.text.includes('RELATÓRIO-BETA'));
  assert.ok(!a.text.includes('RELATÓRIO-BETA'));
  assert.ok(!b.text.includes('RELATÓRIO-ALFA'));
});

test('mesmo input produz bytes e SHA256 iguais em processos separados; evento diferente muda o arquivo', async () => {
  const report = input();
  const first = await createAuditPdf(report);
  const second = await createAuditPdf(structuredClone(report));
  const script = `import { createAuditPdf } from './server/modules/governance/auditPdf.ts';
    const chunks = []; for await (const chunk of process.stdin) chunks.push(chunk);
    process.stdout.write(await createAuditPdf(JSON.parse(Buffer.concat(chunks).toString())));`;
  const separate = execFileSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script], {
    input: JSON.stringify(report), env: { ...process.env, TZ: 'America/Sao_Paulo' },
  });
  assert.deepEqual(first, second);
  assert.deepEqual(Buffer.from(first), separate);
  const hash = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
  assert.equal(hash(first), hash(separate));
  const changed = await createAuditPdf(input({ events: [{ ...event(), outcomeLabel: 'Recusado' }] }));
  assert.notEqual(hash(first), hash(changed));
  const precise = await createAuditPdf(input({ events: [{ ...event(), occurredAt: '2026-10-23T18:15:00.001-03:00' }] }));
  assert.notEqual(hash(first), hash(precise), 'precisão do snapshot também participa do identificador');
  const reordered = await createAuditPdf(input({ filters: Object.fromEntries(Object.entries(report.filters).reverse()) }));
  assert.deepEqual(first, reordered, 'ordem de inserção das chaves não altera o relatório');
  const { parsed } = await inspect(report);
  assert.equal(parsed.creationDate, 'D:20261023213000Z');
  assert.equal(parsed.modificationDate, parsed.creationDate);
});
