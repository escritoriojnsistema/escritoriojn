import express from 'express';
import { randomUUID } from 'node:crypto';
import type { ApiErrorResponse, HealthResponse } from '../shared/api.js';

export const app = express();
app.disable('x-powered-by');
const api = express.Router();
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
api.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', service: 'escritorio-jn-api' } } satisfies HealthResponse);
});
api.use((_req, res) => {
  const requestId = randomUUID();
  res.setHeader('X-Request-Id', requestId);
  res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Rota da API não encontrada.', request_id: requestId } } satisfies ApiErrorResponse);
});
app.use('/api', api);
