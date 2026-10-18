import { Router, json, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, record, uuid } from '../team/validation.js';

export const governanceRouter=Router();
governanceRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
governanceRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.governanceAuth=auth;next();}});
governanceRouter.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'1kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'GOVERNANCE_VALIDATION','Confira os filtros e os dados da solicitação.');
const messages:Record<string,string>={AUTH_REQUIRED:'Entre novamente para continuar.',GOVERNANCE_FORBIDDEN:'Você não tem permissão para esta operação.',TEAM_FORBIDDEN:'Você não tem permissão para esta operação.',LAST_OWNER:'Mantenha ao menos um proprietário ativo.',SELF_CHANGE:'Seu próprio acesso não pode ser alterado por esta operação.',ARCHIVE_CONFLICT:'O registro já mudou. Atualize a lista.',GOVERNANCE_VALIDATION:'Confira os filtros e os dados da solicitação.',TEAM_VALIDATION:'Confira os dados da solicitação.',EXPORT_LIMIT:'Selecione um período ou filtros mais específicos. O limite é de 1000 eventos.'};
async function rpc(res:Response,name:string,args:Record<string,unknown>){
  try {
    const {client}=res.locals.governanceAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
    const {data,error}=await client.rpc(name,args);
    if(error){const status=Number(/^PT(401|403|409|422)$/.exec(error.code)?.[1]);if(status&&Object.hasOwn(messages,error.message))errorResponse(res,status,error.message,messages[error.message]);else errorResponse(res,503,'GOVERNANCE_UNAVAILABLE','Não foi possível concluir a operação. Atualize a lista antes de repetir.');return null;}
    if(!record(data))throw new Error('Provider response');return data;
  } catch {errorResponse(res,503,'GOVERNANCE_UNAVAILABLE','Não foi possível concluir a operação. Atualize a lista antes de repetir.');return null;}
}
function date(value:unknown):string|null|false {
  if(value===''||value===undefined)return null;
  if(typeof value!=='string'||!/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value))return false;
  const time=Date.parse(`${value}T00:00:00Z`);return Number.isFinite(time)&&new Date(time).toISOString().slice(0,10)===value?new Date(time).toISOString():false;
}
function filters(b:Record<string,unknown>){
  const {action='',actor_id='',from='',until=''}=b;
  const start=date(from),end=date(until);
  if(typeof action!=='string'||action.length>120||!/^[a-zA-Z0-9_.]*$/.test(action)||typeof actor_id!=='string'||(actor_id!==''&&!uuid(actor_id))||start===false||end===false||(start&&end&&start>end))return null;
  return {p_action:action,p_actor:actor_id||null,p_from:start,p_until:end?new Date(Date.parse(end)+86400000).toISOString():null};
}
function pagination(query:Record<string,unknown>){
  const {page='1',size='5'}=query;
  return typeof page==='string'&&/^[1-9]\d{0,4}$/.test(page)&&typeof size==='string'&&['3','5'].includes(size)?{p_page:Number(page),p_size:Number(size)}:null;
}
governanceRouter.get('/audit',async(req,res)=>{
  const q=req.query;const paging=pagination(q);const filter=filters(q);
  if(Object.keys(q).some(k=>!['office_id','page','size','action','actor_id','from','until'].includes(k))||!uuid(q.office_id)||!paging||!filter){invalid(res);return;}
  const data=await rpc(res,'audit_page',{p_office_id:q.office_id,...paging,...filter});if(data)res.json({data});
});
governanceRouter.post('/audit/export',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||!fields(b,['office_id','action','actor_id','from','until'])||!uuid(b.office_id)){invalid(res);return;}
  const filter=filters(b);if(!filter){invalid(res);return;}
  const data=await rpc(res,'audit_export',{p_office_id:b.office_id,...filter,p_request_id:randomUUID()});if(data)res.json({data});
});
governanceRouter.get('/archives',async(req,res)=>{
  const q=req.query,paging=pagination(q),status=q.status??'archived';
  if(Object.keys(q).some(k=>!['office_id','page','size','status'].includes(k))||!uuid(q.office_id)||!paging||typeof status!=='string'||!['archived','restored'].includes(status)){invalid(res);return;}
  const data=await rpc(res,'archives_page',{p_office_id:q.office_id,...paging,p_status:status});if(data)res.json({data});
});
for(const [path,name,target,status] of [['/members/:id/archive','archive_membership','p_membership_id',201],['/archives/:id/restore','restore_archive','p_archive_id',200]] as const){
  governanceRouter.post(path,async(req,res)=>{
    if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(req.body,['office_id'])||!uuid(req.body.office_id)){invalid(res);return;}
    const data=await rpc(res,name,{p_office_id:req.body.office_id,[target]:req.params.id,p_request_id:randomUUID()});if(data)res.status(status).json({data});
  });
}
