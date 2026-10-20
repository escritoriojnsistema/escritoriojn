import { Router, json, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import * as validation from './validation.js';
import * as dto from './dto.js';

export const customerRelationsRouter = Router();
customerRelationsRouter.use((_req, res, next) => {
  res.setHeader('Cache-Control', 'private, no-store'); res.setHeader('CDN-Cache-Control', 'no-store'); res.vary('Authorization'); next();
});
customerRelationsRouter.use(async (req, res, next) => {
  const auth = await authenticatedClient(req, res);
  if (auth) { res.locals.relationsAuth = auth; next(); }
});
customerRelationsRouter.use((req, res, next) => {
  if (!['GET', 'HEAD'].includes(req.method) && !req.is('application/json')) { errorResponse(res, 415, 'UNSUPPORTED_MEDIA_TYPE', 'Envie um corpo JSON.'); return; }
  next();
}, json({ limit: '4kb', strict: true }));
const invalid = (res: Response) => errorResponse(res, 422, 'CUSTOMERS_VALIDATION', 'Confira os dados, evidências, prazos e versões informados.');
const messages: Record<string, [number, string]> = {
  AUTH_REQUIRED: [401, 'Entre novamente para continuar.'],
  CUSTOMERS_FORBIDDEN: [403, 'Você não tem permissão para esta operação.'],
  CUSTOMER_NOT_FOUND: [404, 'Ficha ou vínculo não encontrado no seu acesso atual.'],
  CUSTOMER_CONFLICT: [409, 'Os dados ou vínculos mudaram ou são incompatíveis. Confira o estado atual antes de confirmar.'],
  CUSTOMER_DUPLICATE: [409, 'Já existe uma ficha com este CPF/CNPJ no escritório. Solicite revisão do cadastro.'],
  CUSTOMERS_VALIDATION: [422, 'Confira os dados, evidências, prazos e versões informados.'],
};
async function rpc(res: Response, name: string, args: Record<string, unknown>, decode: (value: unknown) => unknown) {
  try {
    const { client } = res.locals.relationsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const known = Object.hasOwn(messages, error.message) ? messages[error.message] : null;
      if (error.code === '42501') errorResponse(res, 403, 'CUSTOMERS_FORBIDDEN', messages.CUSTOMERS_FORBIDDEN[1]);
      else if (known && error.code === `PT${known[0]}`) errorResponse(res, known[0], error.message, known[1]);
      else unavailable(res);
      return;
    }
    res.json({ data: decode(data) });
  } catch { unavailable(res); }
}
function unavailable(res: Response) { errorResponse(res, 503, 'CUSTOMER_RELATIONS_UNAVAILABLE', 'Não foi possível concluir a operação. Confira o estado atual antes de repetir.'); }
function sameId(a: string, b: string) { if (a.toLowerCase() !== b.toLowerCase()) throw new Error('Invalid customer relations reference'); }
customerRelationsRouter.post('/state', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !validation.relationsRequest(b)) { invalid(res); return; }
  await rpc(res, 'customer_relations_state', { p_office_id: b.office_id, p_customer_id: b.customer_id }, value => {
    const state = dto.relationsState(value); sameId(state.customer.id, b.customer_id); if (state.access_lost) throw new Error('Invalid read state'); return state;
  });
});
customerRelationsRouter.post('/candidates', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !validation.candidatesRequest(b)) { invalid(res); return; }
  await rpc(res, 'customer_relation_candidates', { p_office_id: b.office_id, p_kind: b.kind, p_query: b.query.trim() }, value => {
    const candidates = dto.relationCandidates(value); if (candidates.kind !== b.kind) throw new Error('Invalid candidate kind'); return candidates;
  });
});
customerRelationsRouter.post('/command', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !validation.commandRequest(b)) { invalid(res); return; }
  const payload = { ...b.payload, ...('evidence' in b.payload ? { evidence: b.payload.evidence.trim() } : {}) };
  await rpc(res, 'customer_relation_command', { p_office_id: b.office_id, p_customer_id: b.customer_id, p_action: b.action, p_payload: payload, p_request_id: randomUUID() }, value => {
    const state = dto.relationsState(value); sameId(state.customer.id, b.customer_id);
    if (state.access_lost && b.action !== 'assignment.revoke') throw new Error('Invalid terminal state'); return state;
  });
});
customerRelationsRouter.post('/merge/preview', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !validation.previewRequest(b)) { invalid(res); return; }
  await rpc(res, 'customer_merge_preview', { p_office_id: b.office_id, p_source_id: b.source_id, p_target_id: b.target_id }, value => {
    const preview = dto.mergePreview(value); sameId(preview.source.id, b.source_id); sameId(preview.target.id, b.target_id); return preview;
  });
});
customerRelationsRouter.post('/merge', async (req, res) => {
  const b: unknown = req.body;
  if (Object.keys(req.query).length || !validation.mergeRequest(b)) { invalid(res); return; }
  await rpc(res, 'customer_merge', { p_office_id: b.office_id, p_source_id: b.source_id, p_target_id: b.target_id, p_source_version: b.source_version, p_target_version: b.target_version, p_evidence: b.evidence.trim(), p_confirm: b.confirm, p_request_id: randomUUID() }, value => {
    const result = dto.mergeResult(value); sameId(result.source_id, b.source_id); sameId(result.target_id, b.target_id); return result;
  });
});
