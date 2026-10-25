import {reportInputV5} from './reportV5.js';
import {reportInputV4} from './reportV4.js';
import {reportInputV3} from './reportV3.js';
import { Router, json, type Response } from 'express';
import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { authenticatedClient } from '../auth/client.js';
import { errorResponse } from '../../errors.js';
import { fields, record, uuid } from '../team/validation.js';
import { createAuditPdf } from './auditPdf.js';
import { reportInputV1 } from './reportV1.js';
import { reportInputV2 } from './reportV2.js';
import { auditReportMaxBytes, auditReportMaxEvents, type AuditEvent, type AuditReport } from '../../../shared/governance.js';

export const governanceRouter=Router();
governanceRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
governanceRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.governanceAuth=auth;next();}});
governanceRouter.use((req,res,next)=>{if(!['GET','HEAD'].includes(req.method)&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'1kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'GOVERNANCE_VALIDATION','Confira os filtros e os dados da solicitação.');
const messages:Record<string,string>={AUTH_REQUIRED:'Entre novamente para continuar.',GOVERNANCE_FORBIDDEN:'Você não tem permissão para esta operação.',TEAM_FORBIDDEN:'Você não tem permissão para esta operação.',LAST_OWNER:'Mantenha ao menos um proprietário ativo.',SELF_CHANGE:'Seu próprio acesso não pode ser alterado por esta operação.',ARCHIVE_CONFLICT:'O registro já mudou. Atualize a lista.',GOVERNANCE_VALIDATION:'Confira os filtros e os dados da solicitação.',TEAM_VALIDATION:'Confira os dados da solicitação.',EXPORT_LIMIT:'O relatório excede 10.000 eventos ou o tamanho suportado de 3 MB. Refine o período ou os filtros; nenhum relatório parcial foi entregue.'};
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
  const q=req.query;const paging=pagination(q);const filter=filters(q);const view=q.view??'recent';
  if(Object.keys(q).some(k=>!['office_id','page','size','action','actor_id','from','until','view'].includes(k))||!uuid(q.office_id)||!paging||!filter||!['recent','archived'].includes(String(view))||typeof view!=='string'){invalid(res);return;}
  const data=await rpc(res,'audit_history_page',{p_office_id:q.office_id,...paging,...filter,p_view:view});if(data)res.json({data});
});
async function pdf(res:Response,source:Record<string,unknown>):Promise<Buffer|null>{
  const report=source as unknown as AuditReport;
  if(!uuid(report.id)||!uuid(report.office_id)||!Number.isInteger(report.count)||report.count<0||report.count>auditReportMaxEvents)throw new Error('Invalid report');
  const events:AuditEvent[]=[];
  for(let offset=0;offset<report.count;offset+=500){
    if(res.destroyed)return null;
    const chunk=await rpc(res,'audit_report_chunk',{p_office_id:report.office_id,p_report_id:report.id,p_offset:offset});if(!chunk)return null;
    if(!Array.isArray(chunk.items)||chunk.offset!==offset||chunk.total!==report.count||chunk.items.length!==Math.min(500,report.count-offset))throw new Error('Incomplete report');
    events.push(...chunk.items as AuditEvent[]);
  }
  if(res.destroyed)return null;
  const output=Buffer.from(await createAuditPdf((report.renderer_version===5?reportInputV5:report.renderer_version===4?reportInputV4:report.renderer_version===3?reportInputV3:report.renderer_version===2?reportInputV2:reportInputV1)(report,events)));
  if(output.length>auditReportMaxBytes){errorResponse(res,422,'EXPORT_LIMIT',messages.EXPORT_LIMIT);return null;}
  if(output.subarray(0,5).toString()!=='%PDF-')throw new Error('Invalid PDF');
  return output;
}
governanceRouter.post('/audit/export',async(req,res)=>{
  const b:unknown=req.body;
  if(Object.keys(req.query).length||(!fields(b,['office_id','action','actor_id','from','until','view'])&&!fields(b,['office_id','action','actor_id','from','until']))||!uuid(b.office_id)||!['recent','archived'].includes(String(b.view??'recent'))||(b.view!==undefined&&typeof b.view!=='string')){invalid(res);return;}
  const filter=filters(b);if(!filter){invalid(res);return;}
  try{
    const data=await rpc(res,'audit_report_begin',{p_office_id:b.office_id,...filter,p_view:b.view??'recent',p_request_id:randomUUID()});if(!data)return;
    const output=await pdf(res,data);if(!output||res.destroyed)return;
    const digest=createHash('sha256').update(output).digest('hex');
    if(!await rpc(res,'audit_report_seal',{p_office_id:b.office_id,p_report_id:data.id,p_sha256:digest,p_bytes:output.length}))return;
    if(!await rpc(res,'audit_report_reference',{p_office_id:b.office_id,p_report_id:data.id})||res.destroyed)return;
    res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="auditoria-${data.id}.pdf"`);
    res.setHeader('X-Audit-Protocol',String(data.protocol));res.setHeader('X-Audit-Count',String(data.count));res.setHeader('X-Audit-SHA256',digest);res.send(output);
  }catch{if(!res.headersSent&&!res.destroyed)errorResponse(res,503,'GOVERNANCE_UNAVAILABLE','Não foi possível gerar o relatório completo. Refine o período ou tente novamente.');}
});
governanceRouter.get('/audit/policy',async(req,res)=>{
 const q=req.query;if(Object.keys(q).some(k=>k!=='office_id')||!uuid(q.office_id)){invalid(res);return;}
 const data=await rpc(res,'audit_policy_get',{p_office_id:q.office_id});if(data)res.json({data});
});
governanceRouter.post('/audit/policy',async(req,res)=>{
 const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','days','version'])||!uuid(b.office_id)||![30,60,90].includes(Number(b.days))||typeof b.days!=='number'||!Number.isInteger(b.version)||Number(b.version)<1){invalid(res);return;}
 const data=await rpc(res,'audit_policy_set',{p_office_id:b.office_id,p_days:b.days,p_version:b.version,p_request_id:randomUUID()});if(data)res.json({data});
});
governanceRouter.post('/audit/verify',async(req,res)=>{
 const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','report_id','sha256'])||!uuid(b.office_id)||!uuid(b.report_id)||typeof b.sha256!=='string'||!/^[a-f0-9]{64}$/.test(b.sha256)){invalid(res);return;}
 try {
  const data=await rpc(res,'audit_report_reference',{p_office_id:b.office_id,p_report_id:b.report_id});if(!data)return;
  const output=await pdf(res,data);if(!output||res.destroyed)return;
  const canonical=createHash('sha256').update(output).digest();
  // Never compare against an arbitrary hash registered through the authenticated seal RPC.
  if(!await rpc(res,'audit_report_reference',{p_office_id:b.office_id,p_report_id:b.report_id})||res.destroyed)return;
  res.json({data:{match:timingSafeEqual(canonical,Buffer.from(b.sha256,'hex')),protocol:data.protocol,count:data.count,created_at:data.created_at,bytes:output.length}});
 }catch{if(!res.headersSent&&!res.destroyed)errorResponse(res,503,'GOVERNANCE_UNAVAILABLE','Não foi possível verificar o PDF canônico. Tente novamente.');}
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
