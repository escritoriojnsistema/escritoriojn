import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatRequestsResultCount,
  formatRequestsTotal,
  getRequestStatusPresentation,
  mergeRequestPages,
  shouldLoadMoreRequestPages,
  type RequestItemSummary,
} from '../src/features/requests/requestsListModel';

const baseDate = '2026-11-26T10:00:00.000Z';

function staffItem(
  id: string,
  status:
    | 'aberto'
    | 'em_atendimento'
    | 'aguardando_cliente'
    | 'aguardando_responsavel'
    | 'concluido'
    | 'cancelado',
): RequestItemSummary {
  return {
    id,
    protocol: `AT-00000${id}`,
    title: `Solicitação ${id}`,
    public_status: 'recebido',
    created_at: baseDate,
    updated_at: baseDate,
    status,
    origin: 'presencial',
    priority: 'normal',
    created_by: 'user-1',
    assignee_id: 'user-1',
    assignee_name: 'Equipe',
    customer_name: null,
    version: 1,
  };
}

test('formatRequestsTotal and formatRequestsResultCount handle singular, plural and zero', () => {
  assert.equal(formatRequestsTotal(0), 'Total: 0 solicitações');
  assert.equal(formatRequestsTotal(1), 'Total: 1 solicitação');
  assert.equal(formatRequestsTotal(4), 'Total: 4 solicitações');
  assert.equal(formatRequestsTotal(-2), 'Total: 0 solicitações');

  assert.equal(formatRequestsResultCount(0), '0 resultados');
  assert.equal(formatRequestsResultCount(1), '1 resultado');
  assert.equal(formatRequestsResultCount(8), '8 resultados');
});

test('mergeRequestPages deduplicates ids while preserving order', () => {
  const first = [staffItem('1', 'aberto'), staffItem('2', 'em_atendimento')];
  const second = [staffItem('2', 'em_atendimento'), staffItem('3', 'concluido')];
  const merged = mergeRequestPages(first, second);
  assert.deepEqual(
    merged.map(item => item.id),
    ['1', '2', '3'],
  );
});

test('shouldLoadMoreRequestPages stops when all items loaded, short batch, or cap reached', () => {
  assert.equal(
    shouldLoadMoreRequestPages({ loadedCount: 5, total: 12, lastBatchSize: 5, maxItems: 50 }),
    true,
  );
  assert.equal(
    shouldLoadMoreRequestPages({ loadedCount: 12, total: 12, lastBatchSize: 5, maxItems: 50 }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({ loadedCount: 4, total: 10, lastBatchSize: 4, maxItems: 50 }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({ loadedCount: 0, total: 5, lastBatchSize: 0, maxItems: 50 }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({ loadedCount: 50, total: 120, lastBatchSize: 5, maxItems: 50 }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({ loadedCount: 50, total: 120, lastBatchSize: 5 }),
    true,
  );
});

test('getRequestStatusPresentation maps staff, client, and workflow progress statuses accurately', () => {
  assert.deepEqual(getRequestStatusPresentation(staffItem('1', 'em_atendimento')), {
    label: 'Em atendimento',
    tone: 'navy',
    progressLabel: null,
  });
  assert.deepEqual(getRequestStatusPresentation(staffItem('2', 'aberto')), {
    label: 'Aberto',
    tone: 'neutral',
    progressLabel: null,
  });
  assert.deepEqual(getRequestStatusPresentation(staffItem('3', 'aguardando_cliente')), {
    label: 'Aguardando cliente',
    tone: 'gold',
    progressLabel: null,
  });
  assert.deepEqual(getRequestStatusPresentation(staffItem('4', 'concluido')), {
    label: 'Concluído',
    tone: 'success',
    progressLabel: null,
  });
  assert.deepEqual(getRequestStatusPresentation(staffItem('5', 'cancelado')), {
    label: 'Cancelado',
    tone: 'danger',
    progressLabel: null,
  });

  const portalItem: RequestItemSummary = {
    id: 'p-1',
    protocol: 'JN-2026-000010',
    title: 'Pedido portal',
    public_status: 'aguardando_cliente',
    created_at: baseDate,
    updated_at: baseDate,
  };
  assert.deepEqual(getRequestStatusPresentation(portalItem), {
    label: 'Aguardando você',
    tone: 'gold',
    progressLabel: null,
  });

  const ruralItem: RequestItemSummary = {
    ...portalItem,
    public_status: 'em_analise',
    rural_progress: {
      kind: 'CAR',
      stage: 'complementacao',
      pending: '',
      updated_at: baseDate,
    },
  };
  assert.deepEqual(getRequestStatusPresentation(ruralItem), {
    label: 'Em análise',
    tone: 'navy',
    progressLabel: 'CAR · Complementação solicitada',
  });
});
