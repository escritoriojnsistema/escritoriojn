import type { CashConfiguration } from '../../../shared/cash';
import { loadAllCashConfigurationPagesWithFetcher } from '../../../shared/manualPaymentFlow';
import { cashApi } from './api';

/**
 * Fetches all pages of `cashApi.configuration` for an office without silently
 * truncating at 50 items or disguising API errors as empty lists.
 */
export function loadAllCashConfigurationPages(
  officeId: string,
  unitId: string | null = null,
  signal?: AbortSignal,
  fetcher: (
    office: string,
    page: number,
    unit: string | null,
    sig?: AbortSignal,
  ) => Promise<CashConfiguration> = cashApi.configuration,
): Promise<CashConfiguration> {
  return loadAllCashConfigurationPagesWithFetcher(officeId, unitId, fetcher, signal);
}
