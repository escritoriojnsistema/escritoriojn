import {Router,json,type Response} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
import {validTemplate,templateText} from '../../../shared/templates.js';
import {templatePage,templateDetail} from './dto.js';

export const templatesRouter=Router();
templatesRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
templatesRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.templatesAuth=auth;next();}});
templatesRouter.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD'&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'160kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'TEMPLATES_VALIDATION','Confira o tipo, as variáveis, o texto, a vigência e o motivo.');
const integer=(v:unknown,min:number,max=2147483645)=>Number.isInteger(v)&&Number(v)>=min&&Number(v)<=max;
const messages:Record<string,[number,string]>={AUTH_REQUIRED:[401,'Entre novamente para continuar.'],TEMPLATES_FORBIDDEN:[403,'Seu acesso não permite esta operação nos modelos.'],TEMPLATE_NOT_FOUND:[404,'Modelo não encontrado.'],TEMPLATE_CONFLICT:[409,'O modelo mudou. Reabra e confira a versão antes de continuar.'],TEMPLATE_DUPLICATE:[409,'Este código já existe na biblioteca.'],TEMPLATES_VALIDATION:[422,'Confira o tipo, as variáveis, o texto, a vigência e o motivo.']};
async function rpc(res:Response,name:string,args:Record<string,unknown>,page=false){try{
 const {client}=res.locals.templatesAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
 const {data,error}=await client.rpc(name,args);if(error){const known=Object.hasOwn(messages,error.message)?messages[error.message]:null;if(known&&error.code===`PT${known[0]}`)errorResponse(res,known[0],error.message,known[1]);else errorResponse(res,503,'TEMPLATES_UNAVAILABLE','Biblioteca indisponível. Preserve a tentativa e tente novamente.');return;}
 res.json({data:page?templatePage(data):templateDetail(data)});
 }catch{errorResponse(res,503,'TEMPLATES_UNAVAILABLE','Biblioteca indisponível. Preserve a tentativa e tente novamente.');}}
templatesRouter.post('/search',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','query','page','size'])||!uuid(b.office_id)||typeof b.query!=='string'||Array.from(b.query).length>120||/[\u0000-\u001f\u007f]/.test(b.query)||!integer(b.page,1,100000)||![3,5].includes(Number(b.size))||typeof b.size!=='number'){invalid(res);return;}await rpc(res,'templates_page',{p_office_id:b.office_id,p_query:b.query.trim(),p_page:b.page,p_size:b.size},true);});
templatesRouter.post('/detail',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','template_id','page'])||!uuid(b.office_id)||!uuid(b.template_id)||!integer(b.page,1,100000)){invalid(res);return;}await rpc(res,'template_detail',{p_office_id:b.office_id,p_template_id:b.template_id,p_page:b.page});});
templatesRouter.post('/save',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','template_id','definition','expected_version','reason','idempotency_key'])||!uuid(b.office_id)||!(b.template_id===null||uuid(b.template_id))||!validTemplate(b.definition)||!integer(b.expected_version,b.template_id===null?0:1)||((b.template_id===null)!==(b.expected_version===0))||!templateText(b.reason,500)||!uuid(b.idempotency_key)){invalid(res);return;}await rpc(res,'template_save',{p_office_id:b.office_id,p_template_id:b.template_id,p_definition:b.definition,p_expected_version:b.expected_version,p_reason:b.reason.trim(),p_idempotency_key:b.idempotency_key});});
templatesRouter.post('/approve',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','template_id','version_id','expected_version','reason','idempotency_key'])||!uuid(b.office_id)||!uuid(b.template_id)||!uuid(b.version_id)||!integer(b.expected_version,1)||!templateText(b.reason,500)||!uuid(b.idempotency_key)){invalid(res);return;}await rpc(res,'template_approve',{p_office_id:b.office_id,p_template_id:b.template_id,p_version_id:b.version_id,p_expected_version:b.expected_version,p_reason:b.reason.trim(),p_idempotency_key:b.idempotency_key});});
