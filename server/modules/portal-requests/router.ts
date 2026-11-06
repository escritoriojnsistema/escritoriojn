import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {positive} from '../requests/validation.js';
import {portalRequestState,validPortalCommand} from './dto.js';
export const portalRequestsRouter=Router();
portalRequestsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
portalRequestsRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.portalAuth=auth;next();}});
portalRequestsRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie JSON.');return;}next();},json({limit:'180kb'}));
portalRequestsRouter.post('/:id/:operation',async(req,res)=>{
 const b:unknown=req.body,op=req.params.operation;
 if(Object.keys(req.query).length||!uuid(req.params.id)||!['state','command'].includes(String(op))||!fields(b,op==='state'?['office_id']:['office_id','expected_version','command','idempotency_key'])||!uuid(b.office_id)||(op==='command'&&(!positive(b.expected_version,2147483645)||!uuid(b.idempotency_key)||!validPortalCommand(b.command)))){errorResponse(res,422,'REQUEST_VALIDATION','Confira os dados da solicitação.');return;}
 try{const {client}=res.locals.portalAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const {data,error}=await client.rpc(op==='state'?'portal_request_state':'portal_request_command',{p_office_id:b.office_id,p_request_id:req.params.id,...(op==='command'?{p_expected_version:b.expected_version,p_command:b.command,p_idempotency_key:b.idempotency_key}:{})});
 if(error){const known:Record<string,number>={AUTH_REQUIRED:401,REQUESTS_FORBIDDEN:403,REQUEST_NOT_FOUND:404,REQUEST_CONFLICT:409,REQUEST_IDEMPOTENCY_CONFLICT:409,REQUEST_VALIDATION:422};const status=known[error.message];errorResponse(res,status&&error.code===`PT${status}`?status:503,status?error.message:'REQUESTS_UNAVAILABLE','Não foi possível concluir. Confira a solicitação e repita a mesma tentativa.');return;}res.json({data:portalRequestState(data)});
 }catch{errorResponse(res,503,'REQUESTS_UNAVAILABLE','Não foi possível concluir a solicitação.');}
});
