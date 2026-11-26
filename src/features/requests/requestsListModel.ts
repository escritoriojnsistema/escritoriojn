import {
  publicRequestStatusLabels,
  requestStatusLabels,
  type PublicRequestStatus,
  type RequestStatus,
  type RequestSummary,
  type StaffRequestSummary,
} from '../../../shared/requests';
import type { AttachmentFile } from '../../../shared/attachments';
import { ruralStages, type RuralProgress } from '../../../shared/ruralWorkflow';
import {
  specializedKinds,
  specializedStages,
  type SpecializedProgress,
} from '../../../shared/specialized';

export type RequestItemSummary = RequestSummary | StaffRequestSummary;

export interface RequestStatusInput {
  status?: RequestStatus;
  public_status: PublicRequestStatus;
  rural_progress?: RuralProgress | null;
  specialized_progress?: SpecializedProgress | null;
}

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
export const HISTORY_BATCH_SIZE = 3;
export const HISTORY_AUTO_LOAD_CAP = 60;

export function formatEntityTotal(
  total: number,
  singular: string,
  plural: string,
): string {
  const safe = Math.max(0, Math.floor(total));
  return `Total: ${safe === 1 ? `1 ${singular}` : `${safe} ${plural}`}`;
}

export function formatRequestsTotal(total: number): string {
  return formatEntityTotal(total, 'solicitação', 'solicitações');
}

export function formatRequestsResultCount(total: number): string {
  const safe = Math.max(0, Math.floor(total));
  return safe === 1 ? '1 resultado' : `${safe} resultados`;
}

export function mergeItemsByKey<T>(
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

export function mergeRequestPages<T extends { id: string }>(
  existing: readonly T[],
  incoming: readonly T[],
): T[] {
  return mergeItemsByKey(existing, incoming, item => item.id);
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
  item: RequestStatusInput,
): RequestStatusPresentation {
  const progressLabel = item.specialized_progress
    ? `${specializedKinds[item.specialized_progress.kind]} · ${specializedStages[item.specialized_progress.stage]}`
    : item.rural_progress
      ? `${item.rural_progress.kind} · ${ruralStages[item.rural_progress.stage]}`
      : null;

  if (item.status) {
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

const attachmentStatusLabels: Record<AttachmentFile['status'], string> = {
  aguardando_upload: 'Aguardando upload',
  quarentena: 'Quarentena',
  disponivel: 'Disponível',
  rejeitado: 'Rejeitado',
  removido: 'Removido',
};

export function getAttachmentStatusPresentation(file: {
  status: AttachmentFile['status'];
  delete_pending?: boolean;
}): { label: string; tone: RequestStatusTone } {
  if (file.delete_pending) {
    return { label: 'Exclusão pendente', tone: 'danger' };
  }
  const label = attachmentStatusLabels[file.status];
  const tone: RequestStatusTone =
    file.status === 'disponivel'
      ? 'success'
      : file.status === 'quarentena' || file.status === 'aguardando_upload'
        ? 'gold'
        : file.status === 'rejeitado' || file.status === 'removido'
          ? 'danger'
          : 'neutral';
  return { label, tone };
}
