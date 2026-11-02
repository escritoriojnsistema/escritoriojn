import {Router,json,type Response} from 'express';
import {createHash} from 'node:crypto';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
import {archivePage,archivePolicy,archiveReport,archiveResult} from './dto.js';
import {requestArchiveDays} from '../../../shared/requestArchives.js';

export const requestArchivesRouter=Router();
requestArchivesRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
requestArchivesRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.requestArchivesAuth=auth;next();}});
requestArchivesRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'4kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'REQUEST_ARCHIVES_VALIDATION','Confira os filtros, o prazo e o motivo informado.');
const messages:Record<string,[number,string]>={
 AUTH_REQUIRED:[401,'Entre novamente para continuar.'],REQUESTS_FORBIDDEN:[403,'Seu acesso não permite esta operação.'],REQUEST_ARCHIVES_FORBIDDEN:[403,'Seu acesso não permite gerenciar relatórios e arquivos de solicitações.'],
 REQUEST_NOT_FOUND:[404,'A solicitação não está disponível no seu escopo.'],REQUEST_ARCHIVES_CONFLICT:[409,'Os dados mudaram. Atualize e confira a seleção antes de tentar novamente.'],REQUEST_ARCHIVES_VALIDATION:[422,'Confira os filtros, o prazo e o motivo informado.'],REQUEST_ARCHIVES_EXPORT_LIMIT:[422,'O relatório excede 1.000 solicitações ou 3 MB. Refine o período; nenhum PDF parcial foi entregue.'],
};
async function rpc(res:Response,name:string,args:Record<string,unknown>):Promise<unknown|null>{
 try{const {client}=res.locals.requestArchivesAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const {data,error}=await client.rpc(name,args);
  if(error){const known=messages[error.message];if(known&&error.code===`PT${known[0]}`)errorResponse(res,known[0],error.message,known[1]);else errorResponse(res,503,'REQUEST_ARCHIVES_UNAVAILABLE','Não foi possível concluir. Preserve a tentativa e confira os dados antes de repetir.');return null;}return data;
 }catch{errorResponse(res,503,'REQUEST_ARCHIVES_UNAVAILABLE','Não foi possível concluir. Tente novamente com os mesmos dados.');return null;}
}
function day(v:unknown):string|null|false {
 if(v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v)||v<'1000-01-01'||v>'9998-12-31')return false;
 const d=new Date(`${v}T00:00:00Z`);return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===v?d.toISOString():false;
}
function filters(b:Record<string,unknown>){
 const from=day(b.from),until=day(b.until);
 if(!['mine','all'].includes(String(b.scope))||!['recent','archived'].includes(String(b.view))||!['','concluido','cancelado'].includes(String(b.status))||from===false||until===false||(from&&until&&from>until))return null;
 return {p_scope:b.scope,p_view:b.view,p_status:b.status,p_from:from,p_until:until?new Date(Date.parse(until)+86400000).toISOString():null};
}
async function respond(res:Response,name:string,args:Record<string,unknown>,parse:(v:unknown)=>unknown){
 const data=await rpc(res,name,args);if(data===null)return;
 try{res.json({data:parse(data)});}catch{errorResponse(res,503,'REQUEST_ARCHIVES_UNAVAILABLE','Não foi possível conferir a resposta oficial. Tente novamente.');}
}
requestArchivesRouter.post('/policy',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id'])||!uuid(b.office_id)){invalid(res);return;}await respond(res,'request_archives_policy_get',{p_office_id:b.office_id},archivePolicy);});
requestArchivesRouter.post('/policy/set',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','days','expected_version','idempotency_key'])||!uuid(b.office_id)||!uuid(b.idempotency_key)||!requestArchiveDays.includes(b.days as 30)||!Number.isInteger(b.expected_version)||Number(b.expected_version)<1||Number(b.expected_version)>2147483645){invalid(res);return;}await respond(res,'request_archives_policy_set',{p_office_id:b.office_id,p_days:b.days,p_expected_version:b.expected_version,p_idempotency_key:b.idempotency_key},archivePolicy);});
requestArchivesRouter.post('/search',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','scope','view','status','from','until','page','size'])||!uuid(b.office_id)||!Number.isInteger(b.page)||Number(b.page)<1||Number(b.page)>100000||![3,5].includes(b.size as number)){invalid(res);return;}const f=filters(b);if(!f){invalid(res);return;}await respond(res,'request_archives_page',{p_office_id:b.office_id,...f,p_page:b.page,p_size:b.size},archivePage);});
requestArchivesRouter.post('/:id/archive',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id','expected_version','reason','idempotency_key'])||!uuid(b.office_id)||!uuid(b.idempotency_key)||!Number.isInteger(b.expected_version)||Number(b.expected_version)<1||Number(b.expected_version)>2147483645||typeof b.reason!=='string'||b.reason.trim().length<3||b.reason.trim().length>500||/[\u0000-\u001f\u007f]/u.test(b.reason)){invalid(res);return;}await respond(res,'request_archives_archive',{p_office_id:b.office_id,p_request_id:req.params.id,p_expected_version:b.expected_version,p_reason:b.reason.trim(),p_idempotency_key:b.idempotency_key},archiveResult);});
requestArchivesRouter.post('/report',async(req,res)=>{
 const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','scope','view','status','from','until','idempotency_key'])||!uuid(b.office_id)||!uuid(b.idempotency_key)){invalid(res);return;}const f=filters(b);if(!f){invalid(res);return;}
 try{
  const source=await rpc(res,'request_archives_report_begin',{p_office_id:b.office_id,...f,p_idempotency_key:b.idempotency_key});if(source===null)return;
  const report=archiveReport(source);if(report.office_id!==b.office_id)throw new Error('Office mismatch');
  const {createRequestArchivePdfV1}=await import('./reportV1.js');const output=await createRequestArchivePdfV1(report);if(res.destroyed)return;
  // Every response rechecks session, capabilities, office and current request scope.
  const current=await rpc(res,'request_archives_report_get',{p_office_id:b.office_id,p_report_id:report.id});if(current===null||res.destroyed)return;
  const canonical=archiveReport(current);if(JSON.stringify(canonical)!==JSON.stringify(report))throw new Error('Snapshot mismatch');
  res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="solicitacoes-${report.id}.pdf"`);res.setHeader('X-Request-Report-Protocol',report.protocol);res.setHeader('X-Request-Report-Count',String(report.count));res.setHeader('X-Request-Report-SHA256',createHash('sha256').update(output).digest('hex'));res.send(output);
 }catch(cause){if(!res.headersSent&&!res.destroyed){if(cause instanceof Error&&cause.message==='REQUEST_ARCHIVES_EXPORT_LIMIT')errorResponse(res,422,'REQUEST_ARCHIVES_EXPORT_LIMIT',messages.REQUEST_ARCHIVES_EXPORT_LIMIT[1]);else errorResponse(res,503,'REQUEST_ARCHIVES_UNAVAILABLE','Não foi possível gerar o PDF completo. Tente novamente com a mesma seleção.');}}
});
