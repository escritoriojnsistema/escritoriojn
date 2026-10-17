export interface HealthResponse {
  data: { status: 'ok'; service: 'escritorio-jn-api' };
}
export interface ApiErrorResponse {
  error: { code: string; message: string; request_id: string };
}
