import {Router,json,type Response} from 'express';
import {accessPolicyState,validIdleMinutes} from '../../../shared/sessionActivity.js';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
export const accessSettingsRouter=Router();
accessSettingsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
accessSettingsRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.accessAuth=auth;next();}});
accessSettingsRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'4kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'ACCESS_VALIDATION','Confira o público e o prazo entre 5 e 1440 minutos.');
async function rpc(res:Response,name:string,args:Record<string,unknown>){
 try{const {client}=res.locals.accessAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const {data,error}=await client.rpc(name,args);
  if(error){const codes:Record<string,number>={AUTH_REQUIRED:401,ACCESS_FORBIDDEN:403,ACCESS_NOT_FOUND:404,ACCESS_CONFLICT:409,ACCESS_VALIDATION:422};const status=codes[error.message];if(status&&error.code===`PT${status}`){errorResponse(res,status,error.message,status===401?'Entre novamente para continuar.':status===403?'Seu acesso não permite gerenciar estas políticas.':status===409?'A política mudou. Atualize antes de salvar novamente.':'Confira a política informada.');return;}throw error;}
  res.json({data:accessPolicyState(data)});
 }catch{errorResponse(res,503,'ACCESS_UNAVAILABLE','Não foi possível consultar ou salvar a política. Tente novamente.');}
}
accessSettingsRouter.post('/state',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id'])||!uuid(b.office_id)){invalid(res);return;}await rpc(res,'access_policies_state',{p_office_id:b.office_id});});
accessSettingsRouter.post('/policy',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!fields(b,['office_id','audience','idle_minutes','expected_revision','idempotency_key'])||!uuid(b.office_id)||!['team','client'].includes(String(b.audience))||!validIdleMinutes(b.idle_minutes)||!Number.isInteger(b.expected_revision)||Number(b.expected_revision)<1||Number(b.expected_revision)>2147483645||!uuid(b.idempotency_key)){invalid(res);return;}await rpc(res,'access_policies_set',{p_office_id:b.office_id,p_audience:b.audience,p_idle_minutes:b.idle_minutes,p_expected_revision:b.expected_revision,p_idempotency_key:b.idempotency_key});});
