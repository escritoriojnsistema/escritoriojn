import { Router, json, type Response } from 'express';
import { validCategoryCommand } from '../../../shared/categories.js';
import { errorResponse } from '../../errors.js';
import { authenticatedClient } from '../auth/client.js';
import { fields, uuid } from '../team/validation.js';
import { categoriesState } from './dto.js';

export const categoriesRouter = Router();
categoriesRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('CDN-Cache-Control', 'no-store');
  res.vary('Authorization');
  next();
});
categoriesRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) { res.locals.categoriesAuth = auth; next(); }
});
categoriesRouter.use((req, res, next) => {
  if (!req.is('application/json')) { errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.'); return; }
  next();
}, json({ limit: '5kb' }));
const messages: Record<string, [number, string]> = {
  AUTH_REQUIRED: [401, 'Entre novamente para continuar.'],
  CATEGORIES_FORBIDDEN: [403, 'Seu acesso não permite esta operação em categorias.'],
  CATEGORY_NOT_FOUND: [404, 'Categoria não encontrada.'],
  CATEGORY_CONFLICT: [409, 'A categoria mudou ou este nome já existe. Confira a lista antes de repetir.'],
  CATEGORY_IN_USE: [409, 'Esta categoria está vinculada ao histórico de serviços e não pode ser excluída. Renomeie a categoria ou escolha outra nos próximos serviços.'],
  CATEGORIES_VALIDATION: [422, 'Confira o nome, a categoria, a versão e o motivo.'],
};
async function rpc(res: Response, name: string, args: Record<string, unknown>) {
  try {
    const { client } = res.locals.categoriesAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const known = Object.hasOwn(messages, error.message) ? messages[error.message] : undefined;
      if (known && error.code === `PT${known[0]}`) errorResponse(res, known[0], error.message, known[1]);
      else errorResponse(res, 503, 'CATEGORIES_UNAVAILABLE', 'Não foi possível concluir. Tente novamente com os mesmos dados.');
      return;
    }
    res.json({ data: categoriesState(data) });
  } catch { errorResponse(res, 503, 'CATEGORIES_UNAVAILABLE', 'Não foi possível concluir. Tente novamente com os mesmos dados.'); }
}
categoriesRouter.post('/state', async (req, res) => {
  const body: unknown = req.body;
  if (Object.keys(req.query).length || !fields(body, ['office_id']) || !uuid(body.office_id)) {
    errorResponse(res, 422, 'CATEGORIES_VALIDATION', 'Confira o escritório.'); return;
  }
  await rpc(res, 'service_categories_state', { p_office_id: body.office_id });
});
categoriesRouter.post('/command', async (req, res) => {
  const body: unknown = req.body;
  if (Object.keys(req.query).length || !fields(body, ['office_id', 'command', 'idempotency_key'])
    || !uuid(body.office_id) || !uuid(body.idempotency_key) || !validCategoryCommand(body.command)) {
    errorResponse(res, 422, 'CATEGORIES_VALIDATION', 'Confira a categoria, a versão, o motivo e a chave da operação.'); return;
  }
  await rpc(res, 'service_categories_command', { p_office_id: body.office_id, p_command: body.command, p_idempotency_key: body.idempotency_key });
});
