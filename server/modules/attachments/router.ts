import {Router,json,type Response} from 'express';
import {randomUUID} from 'node:crypto';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
import {attachmentMaxBytes} from '../../../shared/attachments.js';
import {validUploadInput,validMimes,validProcessInput} from './validation.js';
import * as dto from './dto.js';

export const attachmentsRouter=Router();
attachmentsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
attachmentsRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.attachmentsAuth=auth;next();}});
attachmentsRouter.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD'&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'4kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'FILE_VALIDATION','Confira o pedido, o arquivo e os limites permitidos.');
const messages:Record<string,[number,string]>={
 AUTH_REQUIRED:[401,'Entre novamente para continuar.'],FILES_FORBIDDEN:[403,'Seu acesso não permite esta operação nos anexos.'],REQUESTS_FORBIDDEN:[403,'Seu acesso não permite este pedido.'],SERVICES_FORBIDDEN:[403,'Seu acesso não permite configurar este serviço.'],FILE_NOT_FOUND:[404,'Anexo não encontrado.'],REQUEST_NOT_FOUND:[404,'Pedido não encontrado.'],SERVICE_NOT_FOUND:[404,'Serviço não encontrado.'],
 FILE_CONFLICT:[409,'O anexo mudou. Confira a lista antes de repetir.'],FILE_IDEMPOTENCY_CONFLICT:[409,'Esta tentativa já foi registrada com outro arquivo. Confira a lista.'],FILE_POLICY_CONFLICT:[409,'A política mudou. Reabra antes de alterar.'],FILE_NOT_READY:[409,'Este arquivo ainda não está disponível para esta operação.'],FILE_VALIDATION:[422,'Confira o pedido, o arquivo e os limites permitidos.'],
};
function failure(res:Response,code:unknown,message:unknown){const known=typeof message==='string'&&Object.hasOwn(messages,message)?messages[message]:null;if(known&&code===`PT${known[0]}`)errorResponse(res,known[0],String(message),known[1]);else errorResponse(res,503,'FILES_UNAVAILABLE','Não foi possível concluir. Confira o estado do anexo antes de repetir.');}
async function rpc<T>(res:Response,name:string,args:Record<string,unknown>,project:(v:unknown)=>T,status=200){
 try{const {client}=res.locals.attachmentsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const {data,error}=await client.rpc(name,args);if(error){failure(res,error.code,error.message);return;}res.status(status).json({data:project(data)});}catch{failure(res,null,null);}
}
attachmentsRouter.post('/search',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','request_id','page','size'])||!uuid(b.office_id)||!(b.request_id===null||uuid(b.request_id))||!positive(b.page)||![3,5].includes(Number(b.size))||typeof b.size!=='number'){invalid(res);return;}await rpc(res,'files_page',{p_office_id:b.office_id,p_request_id:b.request_id,p_page:b.page,p_size:b.size},dto.attachmentPage);});
attachmentsRouter.post('/requests',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','query','page','size'])||!uuid(b.office_id)||!requestText(b.query,120,0)||!positive(b.page)||![3,5].includes(Number(b.size))||typeof b.size!=='number'){invalid(res);return;}await rpc(res,'files_requests_page',{p_office_id:b.office_id,p_query:b.query.trim(),p_page:b.page,p_size:b.size},dto.attachmentRequests);});
attachmentsRouter.post('/intents',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','input'])||!uuid(b.office_id)||!validUploadInput(b.input)){invalid(res);return;}await rpc(res,'files_begin_upload',{p_office_id:b.office_id,p_input:b.input,p_event_id:randomUUID()},dto.attachmentIntent,201);});
attachmentsRouter.post('/policy',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','service_id'])||!uuid(b.office_id)||!uuid(b.service_id)){invalid(res);return;}await rpc(res,'files_policy_get',{p_office_id:b.office_id,p_service_id:b.service_id},dto.attachmentPolicy);});
attachmentsRouter.post('/policy/update',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','service_id','expected_version','max_bytes','mime_types','reason'])||!uuid(b.office_id)||!uuid(b.service_id)||!positive(b.expected_version,2147483645)||!positive(b.max_bytes,attachmentMaxBytes)||!validMimes(b.mime_types)||!requestText(b.reason,500,5)){invalid(res);return;}await rpc(res,'files_policy_set',{p_office_id:b.office_id,p_service_id:b.service_id,p_expected_version:b.expected_version,p_max_bytes:b.max_bytes,p_mime_types:b.mime_types,p_reason:b.reason.trim(),p_event_id:randomUUID()},dto.attachmentPolicy);});
attachmentsRouter.post('/cleanup-plan',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id'])||!uuid(b.office_id)){invalid(res);return;}await rpc(res,'files_cleanup_plan',{p_office_id:b.office_id,p_event_id:randomUUID()},dto.attachmentCleanupPlan);});
attachmentsRouter.post('/process',async(req,res)=>{
 const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','action','args'])||!uuid(b.office_id)||!validProcessInput({action:b.action,args:b.args})){invalid(res);return;}
 try{
  const auth=res.locals.attachmentsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
  const response=await fetch(`${auth.url}/functions/v1/private-attachments`,{method:'POST',headers:{Authorization:`Bearer ${auth.token}`,apikey:auth.key,'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(45_000),cache:'no-store'});
  const value:unknown=await response.json();
  if(!response.ok){const e=value&&typeof value==='object'&&'error'in value?value.error:null;const message=e&&typeof e==='object'&&'code'in e?e.code:null;failure(res,`PT${response.status}`,message);return;}
  if(!value||typeof value!=='object'||!('data'in value))throw Error('Invalid worker');res.json({data:dto.attachmentProcessResult(value.data)});
 }catch{failure(res,null,null);}
});
attachmentsRouter.post('/:id/download',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!uuid(req.params.id)||!fields(b,['office_id'])||!uuid(b.office_id)){invalid(res);return;}await rpc(res,'files_download',{p_office_id:b.office_id,p_file_id:req.params.id,p_event_id:randomUUID()},dto.attachmentDownload);});
