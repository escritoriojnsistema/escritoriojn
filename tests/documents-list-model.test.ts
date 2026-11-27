import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectAllDocumentPages,
  DOCUMENTS_AUTO_LOAD_CAP,
  DOCUMENTS_BATCH_SIZE,
  formatDocumentsCount,
  formatIssuedDocumentMeta,
  formatTemplateMeta,
  mergeByKey,
  shouldLoadMoreDocumentPages,
} from '../src/features/documents/documentsListModel';

test('mergeByKey preserves order and deduplicates items by key', () => {
  const first = [
    { id: 'a', name: 'Primeiro' },
    { id: 'b', name: 'Segundo' },
  ];
  const second = [
    { id: 'b', name: 'Segundo duplicado' },
    { id: 'c', name: 'Terceiro' },
  ];
  assert.deepEqual(
    mergeByKey(first, second, item => item.id),
    [
      { id: 'a', name: 'Primeiro' },
      { id: 'b', name: 'Segundo' },
      { id: 'c', name: 'Terceiro' },
    ],
  );
});

test('shouldLoadMoreDocumentPages stops at total, short batch, or auto-load cap', () => {
  assert.equal(DOCUMENTS_BATCH_SIZE, 5);
  assert.equal(
    shouldLoadMoreDocumentPages({
      loadedCount: 5,
      total: 12,
      lastBatchSize: 5,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreDocumentPages({
      loadedCount: 12,
      total: 12,
      lastBatchSize: 5,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreDocumentPages({
      loadedCount: 8,
      total: 12,
      lastBatchSize: 3,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreDocumentPages({
      loadedCount: 50,
      total: 75,
      lastBatchSize: 5,
      maxItems: DOCUMENTS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreDocumentPages({
      loadedCount: 50,
      total: 75,
      lastBatchSize: 5,
    }),
    true,
  );
});

test('formatTemplateMeta formats draft, approved, and demonstration templates', () => {
  assert.equal(
    formatTemplateMeta({
      kind: 'declaration',
      latest_version: 1,
      current_version: null,
      demonstration: false,
    }),
    'Declaração · v1 · Sem versão aprovada vigente',
  );
  assert.equal(
    formatTemplateMeta({
      kind: 'application',
      latest_version: 3,
      current_version: 2,
      demonstration: true,
    }),
    'Requerimento · v3 · Aprovada vigente: v2 · Demonstração',
  );
  assert.equal(
    formatTemplateMeta({
      kind: 'unknown' as never,
      latest_version: 1,
      current_version: null,
      demonstration: false,
    }),
    'v1 · Sem versão aprovada vigente',
  );
});

test('formatIssuedDocumentMeta and formatDocumentsCount format counts and status cleanly', () => {
  assert.equal(
    formatIssuedDocumentMeta({
      request_protocol: 'ATD-2026-001',
      revision: 2,
      status: 'draft',
      demonstration: false,
    }),
    'ATD-2026-001 · Revisão 2 · Rascunho',
  );
  assert.equal(
    formatIssuedDocumentMeta({
      request_protocol: 'ATD-2026-002',
      revision: 4,
      status: 'prepared',
      demonstration: true,
    }),
    'ATD-2026-002 · Revisão 4 · Preenchimento concluído · Homologação',
  );
  assert.equal(formatDocumentsCount(0, 'modelo', 'modelos'), '0 modelos');
  assert.equal(formatDocumentsCount(1, 'modelo', 'modelos'), '1 modelo');
  assert.equal(formatDocumentsCount(7, 'revisão', 'revisões'), '7 revisões');
});

test('collectAllDocumentPages merges pages, deduplicates keys, and respects maxItems cap', async () => {
  const pages = new Map<number, { items: { id: string }[]; total: number }>([
    [1, { items: [{ id: '1' }, { id: '2' }, { id: '3' }, { id: '4' }, { id: '5' }], total: 8 }],
    [2, { items: [{ id: '5' }, { id: '6' }, { id: '7' }, { id: '8' }], total: 8 }],
  ]);
  const calls: number[] = [];
  const result = await collectAllDocumentPages({
    fetchPage: async page => {
      calls.push(page);
      return pages.get(page) ?? { items: [], total: 8 };
    },
    getItems: p => p.items,
    getTotal: p => p.total,
    getKey: item => item.id,
    pageSize: 5,
    maxItems: 50,
  });

  assert.deepEqual(calls, [1, 2]);
  assert.equal(result.total, 8);
  assert.deepEqual(
    result.items.map(i => i.id),
    ['1', '2', '3', '4', '5', '6', '7', '8'],
  );

  const cappedCalls: number[] = [];
  const capped = await collectAllDocumentPages({
    fetchPage: async page => {
      cappedCalls.push(page);
      const start = (page - 1) * 5;
      return {
        items: Array.from({ length: 5 }, (_, i) => ({ id: String(start + i + 1) })),
        total: 30,
      };
    },
    getItems: p => p.items,
    getTotal: p => p.total,
    getKey: item => item.id,
    pageSize: 5,
    maxItems: 10,
  });

  assert.deepEqual(cappedCalls, [1, 2]);
  assert.equal(capped.items.length, 10);
});
