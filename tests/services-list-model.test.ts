import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SERVICES_AUTO_LOAD_CAP,
  SERVICES_BATCH_SIZE,
  formatServiceMeta,
  formatServicesTotal,
  mergeServicePages,
  shouldLoadMoreServicePages,
} from '../src/features/services/servicesListModel';

test('formatServicesTotal handles singular, plural, zero, and invalid numbers', () => {
  assert.equal(formatServicesTotal(0), 'Total: 0 serviços');
  assert.equal(formatServicesTotal(1), 'Total: 1 serviço');
  assert.equal(formatServicesTotal(2), 'Total: 2 serviços');
  assert.equal(formatServicesTotal(14), 'Total: 14 serviços');
  assert.equal(formatServicesTotal(-3), 'Total: 0 serviços');
  assert.equal(formatServicesTotal(3.9), 'Total: 3 serviços');
  assert.equal(formatServicesTotal(Number.NaN), 'Total: 0 serviços');
});

test('formatServiceMeta formats category hierarchy, BRL price, version, and scheduled state', () => {
  const now = Date.parse('2026-11-27T12:00:00.000Z');
  const active = formatServiceMeta(
    {
      category: 'Documentos',
      category_name: 'Documentos',
      unit: 'unidade',
      price_cents: 4000,
      version: 2,
      effective_from: '2026-10-01T00:00:00.000Z',
    },
    now,
  );
  assert.match(active, /^Documentos · R\$\s?40,00\/unidade · v2$/);

  const nestedScheduled = formatServiceMeta(
    {
      category: 'CCIR',
      category_parent_name: 'Rural',
      category_name: 'CCIR',
      unit: 'processo',
      price_cents: 35000,
      version: 1,
      effective_from: '2026-12-15T00:00:00.000Z',
    },
    now,
  );
  assert.match(
    nestedScheduled,
    /^Rural › CCIR · R\$\s?350,00\/processo · v1 · agendado$/,
  );
});

test('mergeServicePages preserves order and deduplicates overlapping server pages', () => {
  const page1 = [
    { id: 's1', name: 'Contrato' },
    { id: 's2', name: 'Salário' },
  ];
  const page2 = [
    { id: 's2', name: 'Salário duplicado' },
    { id: 's3', name: 'CCIR' },
  ];
  assert.deepEqual(mergeServicePages(page1, page2), [
    { id: 's1', name: 'Contrato' },
    { id: 's2', name: 'Salário' },
    { id: 's3', name: 'CCIR' },
  ]);
  assert.deepEqual(mergeServicePages([], page2), page2);
  assert.deepEqual(mergeServicePages(page1, []), page1);
});

test('shouldLoadMoreServicePages respects batch size, total count, and auto-load cap', () => {
  assert.equal(SERVICES_BATCH_SIZE, 5);
  assert.equal(SERVICES_AUTO_LOAD_CAP, 50);

  assert.equal(
    shouldLoadMoreServicePages({
      loadedCount: 5,
      total: 12,
      lastBatchSize: 5,
      maxItems: 50,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreServicePages({
      loadedCount: 12,
      total: 12,
      lastBatchSize: 5,
      maxItems: 50,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreServicePages({
      loadedCount: 7,
      total: 12,
      lastBatchSize: 2,
      maxItems: 50,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreServicePages({
      loadedCount: 50,
      total: 80,
      lastBatchSize: 5,
      maxItems: 50,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreServicePages({
      loadedCount: 50,
      total: 80,
      lastBatchSize: 5,
    }),
    true,
  );
});
