import express, { type ErrorRequestHandler, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { MAX_VALIDATION_MESSAGE_LENGTH, type ApiErrorResponse, type HealthResponse, type ValidationResponse } from '../shared/api.js';

export const app = express();
app.disable('x-powered-by');
const api = express.Router();
function errorResponse(res: Response, status: number, code: string, message: string) {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.status(status).json({ error: { code, message, request_id: requestId } } satisfies ApiErrorResponse);
}
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
api.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', service: 'escritorio-jn-api' } } satisfies HealthResponse);
});
api.post('/validate', (req, res, next) => {
  if (!req.is('application/json')) {
    errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.');
    return;
  }
  next();
}, express.json({ limit: '1kb' }), (req, res) => {
  const body: unknown = req.body;
  if (typeof body !== 'object' || body === null || Array.isArray(body) || !('message' in body)
    || Object.keys(body).length !== 1 || typeof body.message !== 'string'
    || body.message.trim().length === 0 || body.message.length > MAX_VALIDATION_MESSAGE_LENGTH) {
    errorResponse(res, 422, 'VALIDATION_ERROR', 'Informe uma mensagem de 1 a 120 caracteres.');
    return;
  }
  res.json({ data: { valid: true } } satisfies ValidationResponse);
});
api.use((_req, res) => {
  errorResponse(res, 404, 'NOT_FOUND', 'Rota da API não encontrada.');
});
const apiErrorHandler: ErrorRequestHandler = (error: { type?: string }, _req, res, _next) => {
  if (error.type === 'entity.parse.failed') errorResponse(res, 400, 'INVALID_JSON', 'JSON inválido.');
  else if (error.type === 'entity.too.large') errorResponse(res, 413, 'PAYLOAD_TOO_LARGE', 'Corpo da requisição excede o limite.');
  else errorResponse(res, 500, 'INTERNAL_ERROR', 'Não foi possível concluir a operação.');
};
api.use(apiErrorHandler);
app.use('/api', api);
