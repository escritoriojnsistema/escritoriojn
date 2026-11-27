import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CUSTOMERS_AUTO_LOAD_CAP,
  CUSTOMERS_BATCH_SIZE,
  formatCustomersResultCount,
  formatCustomersTotal,
  getCustomerKindLabel,
  mergeCustomerPages,
  shouldLoadMoreCustomerPages,
} from '../src/features/customers/customersListModel';

test('formatCustomersTotal formats singular, plural, zero and negative values', () => {
  assert.equal(formatCustomersTotal(0), 'Total: 0 clientes');
  assert.equal(formatCustomersTotal(1), 'Total: 1 cliente');
  assert.equal(formatCustomersTotal(14), 'Total: 14 clientes');
  assert.equal(formatCustomersTotal(-3), 'Total: 0 clientes');
});

test('formatCustomersResultCount formats singular and plural counts', () => {
  assert.equal(formatCustomersResultCount(0), '0 resultados');
  assert.equal(formatCustomersResultCount(1), '1 resultado');
  assert.equal(formatCustomersResultCount(8), '8 resultados');
});

test('getCustomerKindLabel distinguishes client registration, person and company', () => {
  assert.equal(
    getCustomerKindLabel({ kind: 'person', source: 'client_registration' }),
    'Cadastro pelo cliente',
  );
  assert.equal(getCustomerKindLabel({ kind: 'person' }), 'Pessoa física');
  assert.equal(getCustomerKindLabel({ kind: 'company' }), 'Pessoa jurídica');
});

test('mergeCustomerPages deduplicates by id while preserving order', () => {
  const first = [
    { id: 'c1', name: 'Ana' },
    { id: 'c2', name: 'Bruno' },
  ];
  const second = [
    { id: 'c2', name: 'Bruno duplicado' },
    { id: 'c3', name: 'Carla' },
  ];
  assert.deepEqual(mergeCustomerPages(first, second), [
    { id: 'c1', name: 'Ana' },
    { id: 'c2', name: 'Bruno' },
    { id: 'c3', name: 'Carla' },
  ]);
  assert.deepEqual(mergeCustomerPages([], second), second);
  assert.deepEqual(mergeCustomerPages(first, []), first);
});

test('shouldLoadMoreCustomerPages stops on partial batch, total reached, or auto-load cap', () => {
  assert.equal(
    shouldLoadMoreCustomerPages({
      loadedCount: 5,
      total: 12,
      lastBatchSize: CUSTOMERS_BATCH_SIZE,
      maxItems: CUSTOMERS_AUTO_LOAD_CAP,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreCustomerPages({
      loadedCount: 12,
      total: 12,
      lastBatchSize: CUSTOMERS_BATCH_SIZE,
      maxItems: CUSTOMERS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreCustomerPages({
      loadedCount: 8,
      total: 12,
      lastBatchSize: 3,
      maxItems: CUSTOMERS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreCustomerPages({
      loadedCount: CUSTOMERS_AUTO_LOAD_CAP,
      total: 120,
      lastBatchSize: CUSTOMERS_BATCH_SIZE,
      maxItems: CUSTOMERS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreCustomerPages({
      loadedCount: 50,
      total: 120,
      lastBatchSize: CUSTOMERS_BATCH_SIZE,
    }),
    true,
  );
});
