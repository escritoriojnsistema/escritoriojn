import {Router,json} from 'express';
import {randomUUID} from 'node:crypto';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {validAccountInput} from '../../../shared/account.js';
import {accountData} from './dto.js';
import {requestDetail} from '../requests/dto.js';

export const accountRouter=Router();
accountRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
accountRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.accountAuth=auth;next();}});
accountRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'5kb'}));
const errors:Record<string,number>={AUTH_REQUIRED:401,REQUESTS_FORBIDDEN:403,ACCOUNT_FORBIDDEN:403,REQUEST_NOT_FOUND:404,ACCOUNT_CONFLICT:409,REQUEST_CONFLICT:409,REQUEST_IDEMPOTENCY_CONFLICT:409,ACCOUNT_DUPLICATE:409,ACCOUNT_VALIDATION:422,REQUEST_VALIDATION:422};
accountRouter.post('/:action',async(req,res)=>{
 const b:unknown=req.body,action=req.params.action;
 const common=Object.keys(req.query).length===0;
 const valid=common&&(action==='read'?fields(b,['office_id'])&&uuid(b.office_id)
  :action==='save'?fields(b,['office_id','expected_version','input'])&&uuid(b.office_id)&&typeof b.expected_version==='string'&&/^[a-f0-9]{64}$/.test(b.expected_version)&&validAccountInput(b.input)
  :action==='corrections'?fields(b,['office_id','expected_version','input','idempotency_key'])&&uuid(b.office_id)&&typeof b.expected_version==='string'&&/^[a-f0-9]{64}$/.test(b.expected_version)&&uuid(b.idempotency_key)&&validAccountInput(b.input)
  :action==='apply'?fields(b,['office_id','request_id','expected_version','input'])&&uuid(b.office_id)&&uuid(b.request_id)&&Number.isSafeInteger(b.expected_version)&&Number(b.expected_version)>0&&Number(b.expected_version)<2147483646&&validAccountInput(b.input):false);
 if(!valid){errorResponse(res,422,'ACCOUNT_VALIDATION','Confira nome, CPF e e-mail.');return;}
 const body=b as Record<string,unknown>;
 const args={p_office_id:body.office_id,...(action==='read'?{}:{p_expected_version:body.expected_version,p_input:body.input,p_event_id:randomUUID()}),...(action==='corrections'?{p_idempotency_key:body.idempotency_key}:{}),...(action==='apply'?{p_request_id:body.request_id}:{})};
 try{
  const {client}=res.locals.accountAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
  const {data,error}=await client.rpc(action==='read'?'account_read':action==='save'?'account_save':action==='corrections'?'account_correction_create':'account_correction_apply',args);
  if(error){const status=Object.hasOwn(errors,error.message)&&error.code===`PT${errors[error.message]}`?errors[error.message]:503;errorResponse(res,status,status===503?'ACCOUNT_UNAVAILABLE':error.message,status===403?'Seu acesso não permite alterar estes dados.':status===409?'Os dados mudaram ou já estão em uso. Reabra e confira antes de enviar.':'Não foi possível concluir. Confira os dados e tente novamente.');return;}
  res.status(action==='corrections'?201:200).json({data:action==='read'||action==='save'?accountData(data):requestDetail(data)});
 }catch{errorResponse(res,503,'ACCOUNT_UNAVAILABLE','Não foi possível concluir. Confira sua conexão e tente novamente.');}
});
