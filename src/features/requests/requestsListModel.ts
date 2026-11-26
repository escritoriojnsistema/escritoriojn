import {
  publicRequestStatusLabels,
  requestStatusLabels,
  type RequestSummary,
  type StaffRequestSummary,
} from '../../../shared/requests';
import { ruralStages } from '../../../shared/ruralWorkflow';
import { specializedKinds, specializedStages } from '../../../shared/specialized';

export type RequestItemSummary = RequestSummary | StaffRequestSummary;

export type RequestStatusTone =
  | 'navy'
  | 'neutral'
  | 'gold'
  | 'success'
  | 'danger';

export interface RequestStatusPresentation {
  label: string;
  tone: RequestStatusTone;
  progressLabel: string | null;
}

export const REQUESTS_BATCH_SIZE = 5;
export const REQUESTS_AUTO_LOAD_CAP = 50;

export function formatRequestsTotal(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return `Total: ${safe === 1 ? '1 solicitação' : `${safe} solicitações`}`;
}

export function formatRequestsResultCount(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return safe === 1 ? '1 resultado' : `${safe} resultados`;
}

export function mergeRequestPages<T extends { id: string }>(
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

export function shouldLoadMoreRequestPages(params: {
  loadedCount: number;
  total: number;
  lastBatchSize: number;
  pageSize?: number;
  maxItems?: number;
}): boolean {
  const pageSize = params.pageSize ?? REQUESTS_BATCH_SIZE;
  if (params.lastBatchSize <= 0) return false;
  if (params.lastBatchSize < pageSize) return false;
  if (params.loadedCount >= params.total) return false;
  if (typeof params.maxItems === 'number' && params.loadedCount >= params.maxItems) {
    return false;
  }
  return true;
}

export function getRequestStatusPresentation(
  item: RequestItemSummary,
): RequestStatusPresentation {
  const progressLabel = item.specialized_progress
    ? `${specializedKinds[item.specialized_progress.kind]} · ${specializedStages[item.specialized_progress.stage]}`
    : item.rural_progress
      ? `${item.rural_progress.kind} · ${ruralStages[item.rural_progress.stage]}`
      : null;

  if ('status' in item) {
    const label = requestStatusLabels[item.status];
    const tone: RequestStatusTone =
      item.status === 'em_atendimento'
        ? 'navy'
        : item.status === 'aguardando_cliente' ||
            item.status === 'aguardando_responsavel'
          ? 'gold'
          : item.status === 'concluido'
            ? 'success'
            : item.status === 'cancelado'
              ? 'danger'
              : 'neutral';
    return { label, tone, progressLabel };
  }

  const label = publicRequestStatusLabels[item.public_status];
  const tone: RequestStatusTone =
    item.public_status === 'em_analise'
      ? 'navy'
      : item.public_status === 'aguardando_cliente'
        ? 'gold'
        : item.public_status === 'concluido'
          ? 'success'
          : item.public_status === 'cancelado'
            ? 'danger'
            : 'neutral';
  return { label, tone, progressLabel };
}
