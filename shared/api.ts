export interface HealthResponse {
  data: { status: 'ok'; service: 'escritorio-jn-api' };
}
export interface ApiErrorResponse {
  error: { code: string; message: string; request_id: string };
}
export interface ValidationRequest { message: string; }
export interface ValidationResponse { data: { valid: true }; }
export const MAX_VALIDATION_MESSAGE_LENGTH = 120;
