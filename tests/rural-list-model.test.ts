import test from 'node:test';
import assert from 'node:assert/strict';
import {
  RURAL_AUTO_LOAD_CAP,
  RURAL_BATCH_SIZE,
  filterRuralProperties,
  formatCountLabel,
  formatRuralCount,
  formatRuralTotal,
  mergeById,
  shouldLoadMoreByCount,
  shouldLoadMoreWithoutTotal,
} from '../src/features/rural/ruralListModel';

test('mergeById deduplicates and preserves order while updating existing items', () => {
  const a = [
    { id: '1', name: 'Fazenda A' },
    { id: '2', name: 'Fazenda B' },
  ];
  const b = [
    { id: '2', name: 'Fazenda B Atualizada' },
    { id: '3', name: 'Fazenda C' },
  ];
  assert.deepEqual(mergeById(a, b), [
    { id: '1', name: 'Fazenda A' },
    { id: '2', name: 'Fazenda B Atualizada' },
    { id: '3', name: 'Fazenda C' },
  ]);
});

test('shouldLoadMoreByCount respects total, batch size, and auto-load cap', () => {
  assert.equal(
    shouldLoadMoreByCount({
      loadedCount: 5,
      total: 12,
      lastBatchSize: 5,
      pageSize: RURAL_BATCH_SIZE,
      maxItems: RURAL_AUTO_LOAD_CAP,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreByCount({
      loadedCount: 12,
      total: 12,
      lastBatchSize: 5,
      pageSize: RURAL_BATCH_SIZE,
      maxItems: RURAL_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreByCount({
      loadedCount: 50,
      total: 80,
      lastBatchSize: 5,
      pageSize: RURAL_BATCH_SIZE,
      maxItems: RURAL_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreByCount({
      loadedCount: 50,
      total: 80,
      lastBatchSize: 5,
      pageSize: RURAL_BATCH_SIZE,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreByCount({
      loadedCount: 3,
      total: 10,
      lastBatchSize: 3,
      pageSize: RURAL_BATCH_SIZE,
    }),
    false,
  );
});

test('shouldLoadMoreWithoutTotal stops on partial batch or auto-load cap', () => {
  assert.equal(
    shouldLoadMoreWithoutTotal({
      loadedCount: 5,
      lastBatchSize: 5,
      pageSize: 5,
      maxItems: 50,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreWithoutTotal({
      loadedCount: 8,
      lastBatchSize: 3,
      pageSize: 5,
      maxItems: 50,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreWithoutTotal({
      loadedCount: 50,
      lastBatchSize: 5,
      pageSize: 5,
      maxItems: 50,
    }),
    false,
  );
});

test('filterRuralProperties matches name, municipality, and state ignoring accents and case', () => {
  const properties = [
    { id: '1', name: 'Fazenda São João', municipality: 'Uberlândia', state: 'MG' },
    { id: '2', name: 'Sítio Água Clara', municipality: 'Goiânia', state: 'GO' },
    { id: '3', name: 'Estância Boa Vista', municipality: 'Ribeirão Preto', state: 'SP' },
  ];
  assert.equal(filterRuralProperties(properties, '').length, 3);
  assert.deepEqual(
    filterRuralProperties(properties, 'sao joao').map(p => p.id),
    ['1'],
  );
  assert.deepEqual(
    filterRuralProperties(properties, 'goiania/go').map(p => p.id),
    ['2'],
  );
  assert.deepEqual(
    filterRuralProperties(properties, 'SP').map(p => p.id),
    ['3'],
  );
});

test('count and total formatters produce singular, plural, and truncated labels', () => {
  assert.equal(formatRuralCount(0), '0 imóveis');
  assert.equal(formatRuralCount(1), '1 imóvel');
  assert.equal(formatRuralCount(1, true), '1+ imóveis');
  assert.equal(formatRuralTotal(6), 'Total: 6 imóveis');
  assert.equal(formatRuralTotal(50, true), 'Total: 50+ imóveis');
  assert.equal(formatCountLabel(1, 'registro', 'registros'), 'Total: 1 registro');
  assert.equal(formatCountLabel(7, 'registro', 'registros', true), 'Total: 7+ registros');
  assert.equal(formatCountLabel(0, 'declaração', 'declarações'), 'Total: 0 declarações');
});
