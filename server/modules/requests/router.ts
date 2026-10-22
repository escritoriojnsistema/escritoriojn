import {Router,json,type Response} from 'express';
import {randomUUID} from 'node:crypto';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {positive,requestStatus,requestText,validCreateRequest,validRequestMutation} from './validation.js';
import {requestPage,requestDetail,requestOptions,requestMutationResult} from './dto.js';
import {publicRequestStatusLabels} from '../../../shared/requests.js';

export const requestsRouter=Router();
requestsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
requestsRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.requestsAuth=auth;next();}});
requestsRouter.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD'&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'90kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'REQUEST_VALIDATION','Confira os dados, os itens e o motivo informado.');
const messages:Record<string,[number,string]>={
 CHARGE_CONFLICT:[409,'Cancele a cobrança ativa antes de cancelar o atendimento.'],AUTH_REQUIRED:[401,'Entre novamente para continuar.'],REQUESTS_FORBIDDEN:[403,'Seu acesso não permite esta operação nos atendimentos.'],REQUEST_NOT_FOUND:[404,'Atendimento não encontrado.'],REQUEST_CONFLICT:[409,'O atendimento mudou. Reabra antes de alterar.'],REQUEST_IDEMPOTENCY_CONFLICT:[409,'Esta abertura já foi enviada com dados diferentes. Confira a lista antes de abrir outro pedido.'],REQUEST_VALIDATION:[422,'Confira os dados, os itens e o motivo informado.'],REQUESTS_VALIDATION:[422,'Confira os dados, os itens e o motivo informado.'],
 SERVICES_FORBIDDEN:[403,'Seu acesso não permite executar este serviço ou ajuste.'],SERVICES_VALIDATION:[422,'Confira os campos, as quantidades e a política do serviço.'],SERVICE_NOT_FOUND:[404,'Serviço não encontrado.'],SERVICE_NOT_EFFECTIVE:[409,'O serviço ainda não possui versão vigente.'],CUSTOMERS_FORBIDDEN:[403,'Seu acesso não permite usar esta ficha.'],CUSTOMER_NOT_FOUND:[404,'Ficha não encontrada.'],
};
async function rpc(res:Response,name:string,args:Record<string,unknown>,kind:'page'|'detail'|'options'|'mutation',status=200){
 try{
  const {client}=res.locals.requestsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
  const {data,error}=await client.rpc(name,args);
  if(error){const known=Object.hasOwn(messages,error.message)?messages[error.message]:null;if(known&&error.code===`PT${known[0]}`)errorResponse(res,known[0],error.message,known[1]);else errorResponse(res,503,'REQUESTS_UNAVAILABLE','Não foi possível concluir. Confira a lista antes de repetir a abertura.');return;}
  const result=kind==='page'?requestPage(data):kind==='options'?requestOptions(data):kind==='mutation'?requestMutationResult(data):requestDetail(data);
  res.status(status).json({data:result});
 }catch{errorResponse(res,503,'REQUESTS_UNAVAILABLE','Não foi possível concluir. Confira a lista antes de repetir a abertura.');}
}
requestsRouter.post('/search',async(req,res)=>{
 const b:unknown=req.body;
 if(Object.keys(req.query).length||!fields(b,['office_id','query','scope','status','page','size'])||!uuid(b.office_id)||!requestText(b.query,120,0)||!['mine','queue'].includes(String(b.scope))||!(b.status===''||requestStatus(b.status)||(typeof b.status==='string'&&Object.hasOwn(publicRequestStatusLabels,b.status)))||!positive(b.page)||![3,5].includes(Number(b.size))||typeof b.size!=='number'){invalid(res);return;}
 await rpc(res,'requests_page',{p_office_id:b.office_id,p_query:b.query.trim(),p_scope:b.scope,p_status:b.status,p_page:b.page,p_size:b.size},'page');
});
requestsRouter.post('/options',async(req,res)=>{
 const b:unknown=req.body;
 if(Object.keys(req.query).length||!fields(b,['office_id','kind','query','page','size'])||!uuid(b.office_id)||!['services','customers','assignees'].includes(String(b.kind))||!requestText(b.query,120,0)||!positive(b.page)||![3,5].includes(Number(b.size))||typeof b.size!=='number'){invalid(res);return;}
 await rpc(res,'request_options',{p_office_id:b.office_id,p_kind:b.kind,p_query:b.query.trim(),p_page:b.page,p_size:b.size},'options');
});
requestsRouter.post('/',async(req,res)=>{
 const b:unknown=req.body;
 if(Object.keys(req.query).length||!fields(b,['office_id','request','idempotency_key'])||!uuid(b.office_id)||!uuid(b.idempotency_key)||!validCreateRequest(b.request)){invalid(res);return;}
 await rpc(res,'request_create',{p_office_id:b.office_id,p_request:b.request,p_idempotency_key:b.idempotency_key,p_request_id:randomUUID()},'detail',201);
});
requestsRouter.post('/:id/detail',async(req,res)=>{
 const b:unknown=req.body;
 if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id','page'])||!uuid(b.office_id)||!positive(b.page)){invalid(res);return;}
 await rpc(res,'request_detail',{p_office_id:b.office_id,p_request_id:req.params.id,p_page:b.page},'detail');
});
requestsRouter.post('/:id/actions',async(req,res)=>{
 const b:unknown=req.body;
 if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id','expected_version','mutation'])||!uuid(b.office_id)||!positive(b.expected_version,2147483645)||!validRequestMutation(b.mutation)){invalid(res);return;}
 await rpc(res,'request_mutate',{p_office_id:b.office_id,p_request_id:req.params.id,p_expected_version:b.expected_version,p_mutation:b.mutation,p_event_id:randomUUID()},'mutation');
});
