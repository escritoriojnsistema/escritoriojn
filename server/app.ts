import {financeRouter} from './modules/finance/router.js';
import {templatesRouter} from './modules/templates/router.js';
import {documentsRouter} from './modules/documents/router.js';
import express, { type ErrorRequestHandler } from 'express';
import { MAX_VALIDATION_MESSAGE_LENGTH, type HealthResponse, type ValidationResponse } from '../shared/api.js';
import { errorResponse } from './errors.js';
import { authRouter } from './modules/auth/router.js';
import { accountRouter } from './modules/account/router.js';
import { governanceRouter } from './modules/governance/router.js';
import { teamRouter } from './modules/team/router.js';
import { customersRouter } from './modules/customers/router.js';
import { customerRelationsRouter } from './modules/customer-relations/router.js';
import { servicesRouter } from './modules/services/router.js';
import { requestsRouter } from './modules/requests/router.js';
import { attachmentsRouter } from './modules/attachments/router.js';
import { notificationsRouter } from './modules/notifications/router.js';
import { cashRouter } from './modules/cash/router.js';
import { chargesRouter } from './modules/charges/router.js';
import { checklistsRouter } from './modules/checklists/router.js';

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  if (req.method === 'GET' && req.accepts('html') && !/^\/(assets|images|src|node_modules|@)/.test(req.path)) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
  }
  next();
});
const api = express.Router();
api.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  next();
});
api.get('/health', (_req, res) => {
  res.json({ data: { status: 'ok', service: 'escritorio-jn-api' } } satisfies HealthResponse);
});
api.use('/auth',authRouter);
api.use('/account',accountRouter);
api.use('/team',teamRouter);
api.use('/governance',governanceRouter);
api.use('/customers',customersRouter);
api.use('/customer-relations',customerRelationsRouter);
api.use('/services',servicesRouter);
api.use('/requests',requestsRouter);
api.use('/attachments',attachmentsRouter);
api.use('/checklists',checklistsRouter);
api.use('/charges',chargesRouter);
api.use('/cash',cashRouter);
api.use('/finance',financeRouter);
api.use('/templates',templatesRouter);
api.use('/documents',documentsRouter);
api.use('/notifications',notificationsRouter);
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
