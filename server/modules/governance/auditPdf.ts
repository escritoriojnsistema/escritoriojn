import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';

export type AuditPdfEvent = {
  actionLabel: string;
  occurredAt: string;
  actorName: string;
  targetLabel: string;
  outcomeLabel: string;
  changes: { label: string; value: string }[];
  reference: string;
};

export type AuditPdfInput = {
  reportId: string;
  officeName: string;
  actorName: string;
  generatedAt: string;
  scopeLabel: string;
  filters: Record<string, string>;
  events: AuditPdfEvent[];
  totalEvents: number;
};

const NAVY = '#103248';
const GOLD = '#aa7d36';
const MUTED = '#5c7180';
const MARGIN = 44;
const BODY_TOP = 140;
const BODY_BOTTOM = 752;
const BODY_SIZE = 9.5;
const WATERMARK = 'ESCRITÓRIO JN';
const segmenter = new Intl.Segmenter('pt-BR', { granularity: 'grapheme' });
const compareLabels = ([a]: [string, string], [b]: [string, string]) => a < b ? -1 : a > b ? 1 : 0;

function fontPath(name: string): string {
  const adjacent = fileURLToPath(new URL(`../../assets/audit-fonts/${name}`, import.meta.url));
  if (existsSync(adjacent)) return adjacent;
  // The compiled server and Vercel includeFiles retain assets in the source tree.
  const packaged = resolve(process.cwd(), 'server/assets/audit-fonts', name);
  if (existsSync(packaged)) return packaged;
  throw new Error('Fontes do relatório de auditoria indisponíveis.');
}

function officialDate(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    throw new Error('A data do relatório e dos eventos deve ser válida e informar o fuso horário.');
  }
  const date = new Date(value);
  const [year, month, day] = value.slice(0, 10).split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (!Number.isFinite(date.getTime()) || month < 1 || month > 12 || day < 1 || day > lastDay) {
    throw new Error('A data do relatório e dos eventos deve ser válida e informar o fuso horário.');
  }
  return date;
}

function displayDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}/${String(date.getUTCFullYear()).padStart(4, '0')} às ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}:${pad(date.getUTCSeconds())} UTC`;
}

function displayFilter(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split('-');
    return `${day}/${month}/${year}`;
  }
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    return displayDate(officialDate(value));
  }
  return value;
}

/** Render only the supplied snapshot. No database, network, permissions or integrity registry. */
export async function createAuditPdf(input: AuditPdfInput): Promise<Uint8Array> {
  if (!Number.isSafeInteger(input.totalEvents) || input.totalEvents < 0 || input.totalEvents !== input.events.length) {
    throw new Error('O total de eventos não corresponde aos eventos completos do relatório.');
  }
  const generatedAt = officialDate(input.generatedAt);
  const eventDates = input.events.map(event => officialDate(event.occurredAt));
  const filters = Object.entries(input.filters).sort(compareLabels);
  const doc = new PDFDocument({
    autoFirstPage: false,
    bufferPages: true,
    size: 'A4',
    margins: { top: BODY_TOP, bottom: 89.89, left: MARGIN, right: MARGIN },
    font: fontPath('OpenSans-Regular.ttf'),
    pdfVersion: '1.7',
    lang: 'pt-BR',
    displayTitle: true,
    info: {
      Title: 'Relatório de auditoria',
      Author: input.actorName,
      Subject: input.reportId,
      Creator: 'Escritório JN',
      Producer: 'Escritório JN',
      CreationDate: generatedAt,
      ModDate: generatedAt,
    },
  });
  // PDFKit 0.17.2 exposes no ID option. Derive its trailer ID from every DTO
  // field, including timestamp precision that is not shown in human dates.
  // This is an input identifier, never a hash of the final PDF or an attestation.
  (doc as PDFKit.PDFDocument & { _id: Buffer })._id = createHash('sha256').update(JSON.stringify([
    input.reportId, input.officeName, input.actorName, input.generatedAt, input.scopeLabel,
    filters, input.totalEvents, input.events.map(event => [
      event.actionLabel, event.occurredAt, event.actorName, event.targetLabel,
      event.outcomeLabel, event.changes.map(change => [change.label, change.value]), event.reference,
    ]),
  ])).digest().subarray(0, 16);
  doc.registerFont('regular', fontPath('OpenSans-Regular.ttf'));
  doc.registerFont('semibold', fontPath('OpenSans-Semibold.ttf'));

  // Read-only glyph availability in the pinned PDFKit/fontkit adapter. Both
  // embedded faces must support a glyph; otherwise preserve its Unicode code.
  type FontDocument = PDFKit.PDFDocument & {
    _font: { font: { hasGlyphForCodePoint: (codePoint: number) => boolean } };
  };
  doc.font('regular');
  const regular = (doc as FontDocument)._font.font;
  doc.font('semibold');
  const semibold = (doc as FontDocument)._font.font;
  let substituted = false;
  const printable = (value: string): string => {
    let result = '';
    for (const character of value.normalize('NFC').replace(/\r\n?/g, '\n').replace(/\t/g, '    ')) {
      const code = character.codePointAt(0)!;
      if (character === '\n' || (code >= 32 && code !== 127 && regular.hasGlyphForCodePoint(code) && semibold.hasGlyphForCodePoint(code))) {
        result += character;
      } else {
        substituted = true;
        result += `[U+${code.toString(16).toUpperCase().padStart(4, '0')}]`;
      }
    }
    return result;
  };

  const chunks: Buffer[] = [];
  const output = new Promise<Uint8Array>((resolveOutput, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.once('end', () => resolveOutput(Buffer.concat(chunks)));
    doc.once('error', reject);
  });

  try {
    let y = BODY_TOP;
    let activeEvent: number | undefined;
    let sectionName = 'Identificação do relatório';
    const contentWidth = 595.28 - 2 * MARGIN;

    const drawLine = (text: string, x: number, top: number, size = BODY_SIZE, bold = false, color = NAVY) => {
      doc.font(bold ? 'semibold' : 'regular').fontSize(size).fillColor(color)
        .text(text, x, top, { lineBreak: false });
    };

    const page = () => {
      doc.addPage();
      const { width, height } = doc.page;
      doc.save().fillColor(NAVY).fillOpacity(0.055)
        .rotate(-32, { origin: [width / 2, height / 2] });
      doc.font('semibold').fontSize(46);
      const watermarkWidth = doc.widthOfString(WATERMARK);
      doc.text(WATERMARK, (width - watermarkWidth) / 2, height / 2 - 30, { lineBreak: false });
      doc.restore();
      doc.rect(0, 0, width, 6).fill(NAVY);
      drawLine('JN', MARGIN, 30, 31, true);
      doc.moveTo(101, 37).lineTo(101, 72).lineWidth(0.8).strokeColor(GOLD).stroke();
      drawLine(WATERMARK, 118, 38, 12, true);
      drawLine('Gestão e registro de atividades', 118, 58, 8.5, false, MUTED);
      drawLine('Relatório de auditoria', MARGIN, 91, 21, true);
      doc.moveTo(MARGIN, 124).lineTo(width - MARGIN, 124).lineWidth(1).strokeColor(GOLD).stroke();
      y = BODY_TOP;
      if (doc.bufferedPageRange().count > 1) {
        drawLine(activeEvent === undefined ? `${sectionName} — continuação` : `Evento ${activeEvent} — continuação`, MARGIN, y, 8.5, true, MUTED);
        y += 22;
      }
    };

    const ensure = (height: number) => {
      if (y + height > BODY_BOTTOM) page();
    };

    const wrap = (value: string, size: number, bold: boolean): string[] => {
      doc.font(bold ? 'semibold' : 'regular').fontSize(size);
      const lines: string[] = [];
      for (const paragraph of printable(value).split('\n')) {
        let line = '';
        for (const token of paragraph.match(/\S+| +/gu) ?? []) {
          if (doc.widthOfString(line + token) <= contentWidth) {
            line += token;
            continue;
          }
          if (line.trimEnd()) lines.push(line.trimEnd());
          line = '';
          if (!token.trim()) continue;
          if (doc.widthOfString(token) <= contentWidth) {
            line = token;
            continue;
          }
          for (const { segment } of segmenter.segment(token)) {
            if (line && doc.widthOfString(line + segment) > contentWidth) {
              lines.push(line);
              line = '';
            }
            line += segment;
          }
        }
        lines.push(line.trimEnd());
      }
      return lines;
    };

    const paragraph = (value: string, options: { size?: number; bold?: boolean; color?: string; gap?: number } = {}) => {
      const { size = BODY_SIZE, bold = false, color = NAVY, gap = 4 } = options;
      const leading = size * 1.5;
      for (const line of wrap(value, size, bold)) {
        ensure(leading);
        drawLine(line, MARGIN, y, size, bold, color);
        y += leading;
      }
      y += gap;
    };

    const section = (name: string) => {
      sectionName = name;
      ensure(44);
      paragraph(name, { size: 11, bold: true, gap: 10 });
    };

    const field = (label: string, value: string) => paragraph(`${label}: ${value}`);
    page();
    section('Identificação do relatório');
    field('Protocolo', input.reportId);
    field('Escritório', input.officeName);
    field('Emitente', input.actorName);
    field('Emissão', displayDate(generatedAt));
    field('Escopo', input.scopeLabel);
    paragraph(`Total de eventos: ${input.totalEvents}`, { bold: true, gap: 14 });

    section('Filtros aplicados');
    if (filters.length === 0) paragraph('Nenhum filtro adicional informado.');
    for (const [label, value] of filters) field(label, displayFilter(value));
    y += 12;

    section('Eventos de auditoria');
    if (input.events.length === 0) paragraph('Nenhum evento encontrado para o escopo e os filtros informados.');
    for (const [index, event] of input.events.entries()) {
      activeEvent = undefined;
      // Keep a short event together. Large events continue without clipping.
      const eventHeight = 10 + wrap(`Evento ${index + 1} · ${event.actionLabel}`, 11, true).length * 16.5 + 5
        + 12.75 + 9 + 14 + [
          `Responsável: ${event.actorName}`, `Destino: ${event.targetLabel}`,
          `Resultado: ${event.outcomeLabel}`, `Referência: ${event.reference}`,
          ...event.changes.map(change => `${change.label}: ${change.value}`),
        ].reduce((height, value) => height + wrap(value, BODY_SIZE, false).length * BODY_SIZE * 1.5 + 4, 0);
      ensure(eventHeight <= BODY_BOTTOM - BODY_TOP - 22 ? eventHeight : 95);
      activeEvent = index + 1;
      doc.moveTo(MARGIN, y).lineTo(MARGIN + contentWidth, y).lineWidth(0.5).strokeColor('#d7dfe5').stroke();
      y += 10;
      paragraph(`Evento ${index + 1} · ${event.actionLabel}`, { size: 11, bold: true, gap: 5 });
      paragraph(displayDate(eventDates[index]), { size: 8.5, color: MUTED, gap: 9 });
      field('Responsável', event.actorName);
      field('Destino', event.targetLabel);
      field('Resultado', event.outcomeLabel);
      field('Referência', event.reference);
      for (const change of event.changes) field(change.label, change.value);
      y += 14;
    }
    activeEvent = undefined;

    if (substituted) {
      sectionName = 'Representação de caracteres';
      y += 4;
      paragraph('Caracteres sem glifo nas fontes são representados pelo código Unicode entre colchetes.', { size: 8, color: MUTED });
    }

    const { start, count } = doc.bufferedPageRange();
    const protocol = printable(input.reportId).replace(/\n/g, ' ');
    doc.font('regular').fontSize(7.2);
    const footerProtocol = doc.widthOfString(`Protocolo: ${protocol}`) <= contentWidth - 110
      ? `Protocolo: ${protocol}`
      : 'Protocolo na identificação do relatório';
    for (let index = start; index < start + count; index++) {
      doc.switchToPage(index);
      doc.moveTo(MARGIN, 779).lineTo(doc.page.width - MARGIN, 779).lineWidth(0.6).strokeColor(GOLD).stroke();
      drawLine(footerProtocol, MARGIN, 788, 7.2, false, MUTED);
      const pagination = `Página ${index + 1} de ${count}`;
      doc.font('regular').fontSize(7.2);
      drawLine(pagination, doc.page.width - MARGIN - doc.widthOfString(pagination), 788, 7.2, false, MUTED);
      drawLine('Verifique a integridade no sistema pelo protocolo deste relatório.', MARGIN, 804, 7.2, false, MUTED);
    }
    doc.end();
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error('Não foi possível gerar o relatório de auditoria.'));
  }
  return output;
}
