import { templateKinds, type TemplateSummary } from '../../../shared/templates';
import type { DocumentSummary } from '../../../shared/documents';

export const DOCUMENTS_BATCH_SIZE = 5 as const;
export const DOCUMENTS_AUTO_LOAD_CAP = 50;

export function mergeByKey<T>(
  existing: readonly T[],
  incoming: readonly T[],
  getKey: (item: T) => string,
): T[] {
  if (existing.length === 0) return [...incoming];
  if (incoming.length === 0) return [...existing];
  const seen = new Set(existing.map(getKey));
  const merged = [...existing];
  for (const item of incoming) {
    const key = getKey(item);
    if (!seen.has(key)) {
      seen.add(key);
      merged.push(item);
    }
  }
  return merged;
}

export function shouldLoadMoreDocumentPages(params: {
  loadedCount: number;
  total: number;
  lastBatchSize: number;
  pageSize?: number;
  maxItems?: number;
}): boolean {
  const pageSize = params.pageSize ?? DOCUMENTS_BATCH_SIZE;
  if (params.lastBatchSize <= 0) return false;
  if (params.lastBatchSize < pageSize) return false;
  if (params.loadedCount >= params.total) return false;
  if (typeof params.maxItems === 'number' && params.loadedCount >= params.maxItems) {
    return false;
  }
  return true;
}

export function formatTemplateMeta(
  item: Pick<TemplateSummary, 'kind' | 'latest_version' | 'current_version' | 'demonstration'>,
): string {
  const parts = [
    templateKinds[item.kind],
    `v${item.latest_version}`,
    item.current_version
      ? `Aprovada vigente: v${item.current_version}`
      : 'Sem versão aprovada vigente',
  ];
  if (item.demonstration) {
    parts.push('Demonstração');
  }
  return parts.filter(Boolean).join(' · ');
}

export function formatIssuedDocumentMeta(
  item: Pick<DocumentSummary, 'request_protocol' | 'revision' | 'status' | 'demonstration'>,
): string {
  const parts = [
    item.request_protocol,
    `Revisão ${item.revision}`,
    item.status === 'prepared' ? 'Preenchimento concluído' : 'Rascunho',
  ];
  if (item.demonstration) {
    parts.push('Homologação');
  }
  return parts.join(' · ');
}

export function formatDocumentsCount(
  total: number,
  singular: string,
  plural: string,
): string {
  const safe = Math.max(0, Math.floor(total));
  return safe === 1 ? `1 ${singular}` : `${safe} ${plural}`;
}

export async function collectAllDocumentPages<TPage, TItem>(params: {
  fetchPage: (page: number, signal?: AbortSignal) => Promise<TPage>;
  getItems: (page: TPage) => readonly TItem[];
  getTotal: (page: TPage) => number;
  getKey: (item: TItem) => string;
  pageSize?: number;
  maxItems?: number;
  signal?: AbortSignal;
}): Promise<{
  firstPage: TPage;
  items: TItem[];
  total: number;
  loadedPage: number;
  lastBatchSize: number;
}> {
  const pageSize = params.pageSize ?? DOCUMENTS_BATCH_SIZE;
  const maxItems = params.maxItems ?? DOCUMENTS_AUTO_LOAD_CAP;
  const firstPage = await params.fetchPage(1, params.signal);
  let items = [...params.getItems(firstPage)];
  let total = params.getTotal(firstPage);
  let loadedPage = 1;
  let lastBatchSize = items.length;

  while (
    !params.signal?.aborted &&
    shouldLoadMoreDocumentPages({
      loadedCount: items.length,
      total,
      lastBatchSize,
      pageSize,
      maxItems,
    })
  ) {
    const nextPage = loadedPage + 1;
    const response = await params.fetchPage(nextPage, params.signal);
    if (params.signal?.aborted) break;
    const batch = params.getItems(response);
    items = mergeByKey(items, batch, params.getKey);
    total = params.getTotal(response);
    loadedPage = nextPage;
    lastBatchSize = batch.length;
    if (batch.length === 0) break;
  }

  return {
    firstPage,
    items,
    total,
    loadedPage,
    lastBatchSize,
  };
}
