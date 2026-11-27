export const RURAL_BATCH_SIZE = 5;
export const RURAL_AUTO_LOAD_CAP = 50;

export function mergeById<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return existing.slice();
  if (existing.length === 0) return incoming.slice();
  const byId = new Map<string, number>();
  const merged = existing.slice();
  merged.forEach((item, index) => byId.set(item.id, index));
  for (const item of incoming) {
    const found = byId.get(item.id);
    if (found !== undefined) {
      merged[found] = item;
    } else {
      byId.set(item.id, merged.length);
      merged.push(item);
    }
  }
  return merged;
}

export function shouldLoadMoreByCount(params: {
  loadedCount: number;
  total: number;
  lastBatchSize: number;
  pageSize: number;
  maxItems?: number;
}): boolean {
  const { loadedCount, total, lastBatchSize, pageSize, maxItems } = params;
  if (lastBatchSize < pageSize) return false;
  if (loadedCount >= total) return false;
  if (maxItems !== undefined && loadedCount >= maxItems) return false;
  return true;
}

export function shouldLoadMoreWithoutTotal(params: {
  loadedCount: number;
  lastBatchSize: number;
  pageSize: number;
  maxItems?: number;
}): boolean {
  const { loadedCount, lastBatchSize, pageSize, maxItems } = params;
  if (lastBatchSize < pageSize) return false;
  if (maxItems !== undefined && loadedCount >= maxItems) return false;
  return true;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterRuralProperties<
  T extends { name: string; municipality: string; state: string },
>(items: readonly T[], query: string): T[] {
  const needle = normalizeSearch(query);
  if (!needle) return items.slice();
  return items.filter(item => {
    const haystack = normalizeSearch(
      `${item.name} ${item.municipality} ${item.state} ${item.municipality}/${item.state}`,
    );
    return haystack.includes(needle);
  });
}

export function formatRuralCount(count: number, hasMore = false): string {
  const suffix = hasMore ? '+' : '';
  return count === 1 && !hasMore ? '1 imóvel' : `${count}${suffix} imóveis`;
}

export function formatRuralTotal(count: number, hasMore = false): string {
  return `Total: ${formatRuralCount(count, hasMore)}`;
}

export function formatCountLabel(
  count: number,
  singular: string,
  plural: string,
  truncated = false,
): string {
  const suffix = truncated ? '+' : '';
  const unit = count === 1 && !truncated ? singular : plural;
  return `Total: ${count}${suffix} ${unit}`;
}
