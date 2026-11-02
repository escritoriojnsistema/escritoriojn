export const requestArchiveDays = [30, 60, 90] as const;
export const requestArchiveReportMaxRows = 1000;
export const requestArchiveReportMaxBytes = 3_000_000;
export type RequestArchiveDays = typeof requestArchiveDays[number];
export type RequestArchiveFilters = {
 scope: 'mine' | 'all'; view: 'recent' | 'archived'; status: '' | 'concluido' | 'cancelado'; from: string; until: string;
};
export type RequestArchivePolicy = { days: RequestArchiveDays; version: number; cutoff: string };
export type RequestArchiveItem = {
 id: string; protocol: string; title: string; status: 'concluido' | 'cancelado'; version: number;
 closed_at: string; archived: boolean; archived_at: string | null;
};
export type RequestArchivePage = {
 items: RequestArchiveItem[]; page: number; page_size: 3 | 5; total: number; can_read_all: boolean;
};
export type RequestArchiveReport = {
 id: string; office_id: string; protocol: string; renderer_version: 1; created_at: string;
 office_name: string; actor_name: string; cutoff: string; count: number;
 filters: Omit<RequestArchiveFilters, 'from' | 'until'> & { from: string | null; until: string | null };
 items: RequestArchiveItem[];
};
