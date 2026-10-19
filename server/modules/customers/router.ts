import { Router, json, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, uuid } from '../team/validation.js';
import { validCustomer } from './validation.js';
import { customerDetail, customerPage } from './dto.js';

export const customersRouter=Router();
customersRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
customersRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.customerAuth=auth;next();}});
customersRouter.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'3kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'CUSTOMERS_VALIDATION','Confira nome, CPF/CNPJ, contatos e filtros informados.');
const messages:Record<string,[number,string]>={
  AUTH_REQUIRED:[401,'Entre novamente para continuar.'],CUSTOMERS_FORBIDDEN:[403,'Você não tem permissão para consultar ou alterar esta ficha.'],
  CUSTOMER_NOT_FOUND:[404,'Ficha não encontrada no seu acesso atual.'],CUSTOMER_DUPLICATE:[409,'Já existe uma ficha com este CPF/CNPJ no escritório. Solicite revisão do cadastro.'],
  CUSTOMER_CONFLICT:[409,'Esta ficha mudou. Reabra o cadastro antes de salvar.'],CUSTOMERS_VALIDATION:[422,'Confira nome, CPF/CNPJ, contatos e filtros informados.'],
};
async function rpc(res:Response,name:string,args:Record<string,unknown>,page=false,status=200){
  try{
    const {client}=res.locals.customerAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const {data,error}=await client.rpc(name,args);
    if(error){const known=Object.hasOwn(messages,error.message)?messages[error.message]:null;if(known && error.code===`PT${known[0]}`)errorResponse(res,known[0],error.message,known[1]);else errorResponse(res,503,'CUSTOMERS_UNAVAILABLE','Não foi possível concluir. Confira sua conexão e atualize a lista antes de repetir.');return;}
    res.status(status).json({data:page?customerPage(data):customerDetail(data)});
  }catch{errorResponse(res,503,'CUSTOMERS_UNAVAILABLE','Não foi possível concluir. Confira sua conexão e atualize a lista antes de repetir.');}
}
customersRouter.post('/search',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length || !fields(b,['office_id','query','page','size']) || !uuid(b.office_id)
    || typeof b.query!=='string' || b.query.trim().length>120 || !Number.isInteger(b.page) || Number(b.page)<1 || Number(b.page)>100000 || ![3,5].includes(Number(b.size)) || typeof b.size!=='number'){invalid(res);return;}
  await rpc(res,'customers_page',{p_office_id:b.office_id,p_query:b.query.trim(),p_page:b.page,p_size:b.size},true);
});
customersRouter.post('/',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length || !fields(b,['office_id','customer']) || !uuid(b.office_id) || !validCustomer(b.customer)){invalid(res);return;}
  await rpc(res,'customer_create',{p_office_id:b.office_id,p_customer:b.customer,p_request_id:randomUUID()},false,201);
});
customersRouter.post('/:id/detail',async(req,res)=>{
  if(Object.keys(req.query).length || !uuid(req.params.id) || !fields(req.body,['office_id']) || !uuid(req.body.office_id)){invalid(res);return;}
  await rpc(res,'customer_detail',{p_office_id:req.body.office_id,p_customer_id:req.params.id});
});
customersRouter.patch('/:id',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length || !uuid(req.params.id) || !fields(b,['office_id','customer','version']) || !uuid(b.office_id)
    || !validCustomer(b.customer) || !Number.isInteger(b.version) || Number(b.version)<1 || Number(b.version)>2147483646){invalid(res);return;}
  await rpc(res,'customer_update',{p_office_id:b.office_id,p_customer_id:req.params.id,p_customer:b.customer,p_version:b.version,p_request_id:randomUUID()});
});
