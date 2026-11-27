import type { CustomerSummary } from '../../../shared/customers';

export const CUSTOMERS_BATCH_SIZE = 5;
export const CUSTOMERS_AUTO_LOAD_CAP = 50;

export function formatCustomersTotal(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return `Total: ${safe === 1 ? '1 cliente' : `${safe} clientes`}`;
}

export function formatCustomersResultCount(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return safe === 1 ? '1 resultado' : `${safe} resultados`;
}

export function getCustomerKindLabel(
  customer: Pick<CustomerSummary, 'kind' | 'source'>,
): string {
  if (customer.source === 'client_registration') {
    return 'Cadastro pelo cliente';
  }
  return customer.kind === 'person' ? 'Pessoa física' : 'Pessoa jurídica';
}

export function mergeCustomerPages<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  if (existing.length === 0) return [...incoming];
  if (incoming.length === 0) return [...existing];
  const seen = new Set(existing.map(item => item.id));
  const merged = [...existing];
  for (const item of incoming) {
    if (!seen.has(item.id)) {
      seen.add(item.id);
      merged.push(item);
    }
  }
  return merged;
}

export function shouldLoadMoreCustomerPages(params: {
  loadedCount: number;
  total: number;
  lastBatchSize: number;
  pageSize?: number;
  maxItems?: number;
}): boolean {
  const pageSize = params.pageSize ?? CUSTOMERS_BATCH_SIZE;
  if (params.lastBatchSize <= 0) return false;
  if (params.lastBatchSize < pageSize) return false;
  if (params.loadedCount >= params.total) return false;
  if (typeof params.maxItems === 'number' && params.loadedCount >= params.maxItems) {
    return false;
  }
  return true;
}
