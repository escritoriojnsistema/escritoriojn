import type { HealthResponse } from '../../../shared/api';

export async function readHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch('/api/health', {
    headers: { Accept: 'application/json' }, cache: 'no-store',
    signal: AbortSignal.any([AbortSignal.timeout(5000), ...(signal ? [signal] : [])]),
  });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('API indisponível.');
  const body: unknown = await response.json();
  if (typeof body !== 'object' || body === null || !('data' in body)) throw new Error('Resposta inválida.');
  const data = body.data;
  if (typeof data !== 'object' || data === null || !('status' in data) || !('service' in data)
    || data.status !== 'ok' || data.service !== 'escritorio-jn-api') throw new Error('Resposta inválida.');
  return { data: { status: data.status, service: data.service } };
}
