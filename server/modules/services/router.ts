import { Router, json, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import { validService, validAdjustment, validServiceReason } from './validation.js';
import { servicePage, serviceDetail, serviceQuote } from './dto.js';

export const servicesRouter=Router();
servicesRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
servicesRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.servicesAuth=auth;next();}});
servicesRouter.use((req,res,next)=>{if(req.method!=='GET' && req.method!=='HEAD' && !req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'10kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'SERVICES_VALIDATION','Confira os dados, regras, vigência e motivo informados.');
const messages:Record<string,[number,string]>={AUTH_REQUIRED:[401,'Entre novamente para continuar.'],SERVICES_FORBIDDEN:[403,'Seu acesso não permite esta operação no catálogo.'],SERVICE_NOT_FOUND:[404,'Serviço não encontrado.'],SERVICE_CONFLICT:[409,'O catálogo mudou. Reabra o serviço antes de publicar.'],SERVICE_DUPLICATE:[409,'Este código já existe no escritório.'],SERVICE_NOT_EFFECTIVE:[409,'O serviço ainda não possui versão vigente.'],SERVICES_VALIDATION:[422,'Confira os dados, vigência e limites da política.']};
async function rpc(res:Response,name:string,args:Record<string,unknown>,kind:'page'|'detail'|'quote'='detail',status=200){
  try{
    const {client}=res.locals.servicesAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const {data,error}=await client.rpc(name,args);
    if(error){const known=Object.hasOwn(messages,error.message)?messages[error.message]:null;if(known&&error.code===`PT${known[0]}`)errorResponse(res,known[0],error.message,known[1]);else errorResponse(res,503,'SERVICES_UNAVAILABLE','Não foi possível concluir. Atualize o catálogo antes de repetir.');return;}
    const dto=kind==='page'?servicePage(data):kind==='quote'?serviceQuote(data):serviceDetail(data);
    res.status(status).json({data:dto});
  }catch{errorResponse(res,503,'SERVICES_UNAVAILABLE','Não foi possível concluir. Atualize o catálogo antes de repetir.');}
}
servicesRouter.post('/search',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||!fields(b,['office_id','query','page','size'])||!uuid(b.office_id)||typeof b.query!=='string'||b.query.length>120||/[\u0000-\u001f\u007f]/.test(b.query)||!Number.isInteger(b.page)||Number(b.page)<1||Number(b.page)>100000||typeof b.size!=='number'||![3,5].includes(b.size)){invalid(res);return;}
  await rpc(res,'services_page',{p_office_id:b.office_id,p_query:b.query.trim(),p_page:b.page,p_size:b.size},'page');
});
servicesRouter.post('/',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||!fields(b,['office_id','service','reason'])||!uuid(b.office_id)||!validService(b.service)||!validServiceReason(b.reason)){invalid(res);return;}
  await rpc(res,'service_create',{p_office_id:b.office_id,p_service:b.service,p_reason:b.reason.trim(),p_request_id:randomUUID()},'detail',201);
});
servicesRouter.post('/:id/detail',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id','page'])||!uuid(b.office_id)||!Number.isInteger(b.page)||Number(b.page)<1||Number(b.page)>100000){invalid(res);return;}
  await rpc(res,'service_detail',{p_office_id:b.office_id,p_service_id:req.params.id,p_page:b.page});
});
servicesRouter.post('/:id/versions',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id','service','reason','expected_version'])||!uuid(b.office_id)||!validService(b.service)||!validServiceReason(b.reason)||!Number.isInteger(b.expected_version)||Number(b.expected_version)<1||Number(b.expected_version)>2147483645){invalid(res);return;}
  await rpc(res,'service_publish',{p_office_id:b.office_id,p_service_id:req.params.id,p_service:b.service,p_expected_version:b.expected_version,p_reason:b.reason.trim(),p_request_id:randomUUID()},'detail',201);
});
servicesRouter.post('/:id/quote',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id','quantity','adjustment'])||!uuid(b.office_id)||!Number.isInteger(b.quantity)||Number(b.quantity)<1||Number(b.quantity)>100000||!validAdjustment(b.adjustment)){invalid(res);return;}
  await rpc(res,'service_quote',{p_office_id:b.office_id,p_service_id:req.params.id,p_quantity:b.quantity,p_adjustment:b.adjustment},'quote');
});
