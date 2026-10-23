import {notificationKinds} from '../../../shared/notifications.js';
import {Router,json,type Response} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
import {summary,notices} from './dto.js';
import {acknowledged} from '../checklists/dto.js';
export const notificationsRouter=Router();
notificationsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
notificationsRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.notificationsAuth=auth;next();}});
notificationsRouter.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD'&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie JSON.');return;}next();},json({limit:'2kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'REQUEST_VALIDATION','Confira a busca e os filtros.');
async function rpc(res:Response,name:string,args:Record<string,unknown>,parse:(v:unknown)=>unknown){
 try{const {client}=res.locals.notificationsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const {data,error}=await client.rpc(name,args);
  if(error){const status=error.message==='AUTH_REQUIRED'&&error.code==='PT401'?401:error.message==='REQUESTS_FORBIDDEN'&&error.code==='PT403'?403:error.message==='REQUEST_NOT_FOUND'&&error.code==='PT404'?404:error.message==='REQUEST_VALIDATION'&&error.code==='PT422'?422:503;errorResponse(res,status,status===503?'NOTIFICATIONS_UNAVAILABLE':error.message,'Não foi possível consultar ou atualizar suas notificações.');return;}
  res.json({data:parse(data)});
 }catch{errorResponse(res,503,'NOTIFICATIONS_UNAVAILABLE','Não foi possível consultar ou atualizar suas notificações.');}
}
notificationsRouter.post('/summary',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id'])||!uuid(b.office_id)){invalid(res);return;}await rpc(res,'notifications_summary',{p_office_id:b.office_id},summary);});
notificationsRouter.post('/search',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','query','read','kind','page','size'])||!uuid(b.office_id)||!requestText(b.query,120,0)||!['all','unread','read'].includes(String(b.read))||!['all',...notificationKinds].includes(String(b.kind))||!positive(b.page)||typeof b.size!=='number'||![3,5].includes(b.size)){invalid(res);return;}await rpc(res,'notifications_page',{p_office_id:b.office_id,p_query:b.query.trim(),p_read:b.read,p_kind:b.kind,p_page:b.page,p_size:b.size},notices);});
notificationsRouter.post('/read',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','id'])||!uuid(b.office_id)||!uuid(b.id)){invalid(res);return;}await rpc(res,'notifications_read',{p_office_id:b.office_id,p_id:b.id},acknowledged);});
