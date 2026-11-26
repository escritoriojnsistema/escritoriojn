import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatEntityTotal,
  formatRequestsResultCount,
  formatRequestsTotal,
  getAttachmentStatusPresentation,
  getRequestStatusPresentation,
  HISTORY_BATCH_SIZE,
  mergeItemsByKey,
  mergeRequestPages,
  REQUESTS_AUTO_LOAD_CAP,
  REQUESTS_BATCH_SIZE,
  shouldLoadMoreRequestPages,
} from '../src/features/requests/requestsListModel';
import type { RequestSummary, StaffRequestSummary } from '../shared/requests';

test('formatRequestsTotal and formatRequestsResultCount handle singular, plural and zero', () => {
  assert.equal(formatRequestsTotal(0), 'Total: 0 solicitações');
  assert.equal(formatRequestsTotal(1), 'Total: 1 solicitação');
  assert.equal(formatRequestsTotal(8), 'Total: 8 solicitações');
  assert.equal(formatRequestsTotal(-3), 'Total: 0 solicitações');

  assert.equal(formatRequestsResultCount(0), '0 resultados');
  assert.equal(formatRequestsResultCount(1), '1 resultado');
  assert.equal(formatRequestsResultCount(12), '12 resultados');
});

test('formatEntityTotal handles attachments, models, options, and history records', () => {
  assert.equal(formatEntityTotal(0, 'arquivo', 'arquivos'), 'Total: 0 arquivos');
  assert.equal(formatEntityTotal(1, 'arquivo', 'arquivos'), 'Total: 1 arquivo');
  assert.equal(formatEntityTotal(7, 'modelo', 'modelos'), 'Total: 7 modelos');
  assert.equal(formatEntityTotal(1, 'registro', 'registros'), 'Total: 1 registro');
  assert.equal(formatEntityTotal(4, 'opção', 'opções'), 'Total: 4 opções');
});

test('mergeRequestPages and mergeItemsByKey deduplicate while preserving order', () => {
  const page1 = [
    { id: 'a', protocol: 'AT-001' },
    { id: 'b', protocol: 'AT-002' },
  ];
  const page2 = [
    { id: 'b', protocol: 'AT-002' },
    { id: 'c', protocol: 'AT-003' },
  ];
  const merged = mergeRequestPages(page1, page2);
  assert.deepEqual(
    merged.map(x => x.id),
    ['a', 'b', 'c'],
  );

  const offers = mergeItemsByKey(
    [{ template_id: 't1' }],
    [{ template_id: 't1' }, { template_id: 't2' }],
    x => x.template_id,
  );
  assert.deepEqual(
    offers.map(x => x.template_id),
    ['t1', 't2'],
  );
});

test('shouldLoadMoreRequestPages stops when all items loaded, short batch, or cap reached', () => {
  assert.equal(REQUESTS_BATCH_SIZE, 5);
  assert.equal(HISTORY_BATCH_SIZE, 3);
  assert.equal(
    shouldLoadMoreRequestPages({
      loadedCount: 5,
      total: 12,
      lastBatchSize: 5,
      maxItems: REQUESTS_AUTO_LOAD_CAP,
    }),
    true,
  );
  assert.equal(
    shouldLoadMoreRequestPages({
      loadedCount: 12,
      total: 12,
      lastBatchSize: 5,
      maxItems: REQUESTS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({
      loadedCount: 8,
      total: 12,
      lastBatchSize: 3,
      maxItems: REQUESTS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({
      loadedCount: 50,
      total: 120,
      lastBatchSize: 5,
      maxItems: REQUESTS_AUTO_LOAD_CAP,
    }),
    false,
  );
  assert.equal(
    shouldLoadMoreRequestPages({
      loadedCount: 3,
      total: 8,
      lastBatchSize: 3,
      pageSize: HISTORY_BATCH_SIZE,
    }),
    true,
  );
});

test('getRequestStatusPresentation maps staff, client, and workflow progress statuses accurately', () => {
  const staffInProgress: StaffRequestSummary = {
    id: '1',
    protocol: 'JN-2026-000101',
    title: 'Alvará Rural',
    status: 'em_atendimento',
    public_status: 'em_analise',
    origin: 'presencial',
    priority: 'normal',
    customer_name: 'Maria',
    assignee_name: 'João',
    created_by: 'u-1',
    assignee_id: 'u-2',
    version: 1,
    created_at: '2026-11-19T12:00:00Z',
    updated_at: '2026-11-20T12:00:00Z',
  };
  assert.deepEqual(getRequestStatusPresentation(staffInProgress), {
    label: 'Em atendimento',
    tone: 'navy',
    progressLabel: null,
  });

  const staffWaiting: StaffRequestSummary = {
    ...staffInProgress,
    status: 'aguardando_cliente',
    public_status: 'aguardando_cliente',
    rural_progress: {
      kind: 'CAR',
      stage: 'complementacao',
      pending: 'Aguardando croqui',
      updated_at: '2026-11-20T12:00:00Z',
    },
  };
  assert.deepEqual(getRequestStatusPresentation(staffWaiting), {
    label: 'Aguardando cliente',
    tone: 'gold',
    progressLabel: 'CAR · Complementação solicitada',
  });

  const clientDone: RequestSummary = {
    id: '2',
    protocol: 'JN-2026-000102',
    title: 'Declaração ITR',
    public_status: 'concluido',
    created_at: '2026-11-19T12:00:00Z',
    updated_at: '2026-11-20T12:00:00Z',
  };
  assert.deepEqual(getRequestStatusPresentation(clientDone), {
    label: 'Concluído',
    tone: 'success',
    progressLabel: null,
  });
});

test('getAttachmentStatusPresentation maps attachment statuses and pending deletion', () => {
  assert.deepEqual(
    getAttachmentStatusPresentation({ status: 'disponivel' }),
    { label: 'Disponível', tone: 'success' },
  );
  assert.deepEqual(
    getAttachmentStatusPresentation({ status: 'quarentena' }),
    { label: 'Quarentena', tone: 'gold' },
  );
  assert.deepEqual(
    getAttachmentStatusPresentation({ status: 'rejeitado' }),
    { label: 'Rejeitado', tone: 'danger' },
  );
  assert.deepEqual(
    getAttachmentStatusPresentation({
      status: 'disponivel',
      delete_pending: true,
    }),
    { label: 'Exclusão pendente', tone: 'danger' },
  );
});
