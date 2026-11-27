import { serviceMoney, type ServiceSummary } from '../../../shared/services';

export const SERVICES_BATCH_SIZE = 5;
export const SERVICES_AUTO_LOAD_CAP = 50;

export function formatServicesTotal(total: number): string {
  const safe = Number.isFinite(total) ? Math.max(0, Math.floor(total)) : 0;
  return `Total: ${safe === 1 ? '1 serviço' : `${safe} serviços`}`;
}

export function formatServiceMeta(
  service: Pick<
    ServiceSummary,
    | 'category'
    | 'category_name'
    | 'category_parent_name'
    | 'price_cents'
    | 'unit'
    | 'version'
    | 'effective_from'
  >,
  nowMs: number = Date.now(),
): string {
  const categoryPath = [
    service.category_parent_name,
    service.category_name ?? service.category,
  ]
    .map(part => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join(' › ');

  const pricePart = `${serviceMoney(service.price_cents)}/${service.unit}`;
  const versionPart = `v${service.version}`;
  const effectiveAt = Date.parse(service.effective_from);
  const scheduled = Number.isFinite(effectiveAt) && effectiveAt > nowMs;

  const parts = [categoryPath, pricePart, versionPart].filter(Boolean);
  if (scheduled) parts.push('agendado');
  return parts.join(' · ');
}

export function mergeServicePages<T extends { id: string }>(
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

export function shouldLoadMoreServicePages(params: {
  loadedCount: number;
  total: number;
  lastBatchSize: number;
  pageSize?: number;
  maxItems?: number;
}): boolean {
  const pageSize = params.pageSize ?? SERVICES_BATCH_SIZE;
  if (params.lastBatchSize <= 0) return false;
  if (params.lastBatchSize < pageSize) return false;
  if (params.loadedCount >= params.total) return false;
  if (
    typeof params.maxItems === 'number' &&
    params.loadedCount >= params.maxItems
  ) {
    return false;
  }
  return true;
}
