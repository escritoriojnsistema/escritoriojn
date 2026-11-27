import test from 'node:test';
import assert from 'node:assert/strict';
import {
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
