import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
import {requestDetail,requestMutationResult} from '../requests/dto.js';
import {validPreintake} from '../../../shared/request-levels.js';
export const requestLevelsRouter=Router();
requestLevelsRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
requestLevelsRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.auth=auth;next();}});
requestLevelsRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie JSON.');return;}next();},json({limit:'30kb'}));
requestLevelsRouter.post('/:action',async(req,res)=>{
 const b:unknown=req.body;const action=req.params.action;
 const create=action==='preintake',handoff=action==='handoff',transfer=action==='transfer-exception',update=action==='update-preintake',revoke=action==='revoke-exception';
 const keys=update?['office_id','request_id','expected_version','value']:create?['office_id','value','idempotency_key']:transfer?['office_id','request_id','expected_version','assignee_id','reason']:['office_id','request_id','expected_version','reason'];
 if(Object.keys(req.query).length||(!create&&!handoff&&!transfer&&!revoke&&!update)||!fields(b,keys)||!uuid(b.office_id)||(create?(!uuid(b.idempotency_key)||!validPreintake(b.value)):(!uuid(b.request_id)||!positive(b.expected_version,2147483645)||(!update&&!requestText(b.reason,500))||(update&&(!fields(b.value,['title','message','customer_id','internal_note'])||!requestText(b.value.title,120)||!requestText(b.value.message,2000,0,true)||!requestText(b.value.internal_note,2000,0,true)||!(b.value.customer_id===null||uuid(b.value.customer_id))))||(transfer&&!uuid(b.assignee_id))))){errorResponse(res,422,'REQUEST_VALIDATION','Confira os dados e o motivo.');return;}
 try{
  const args=update?{p_office_id:b.office_id,p_request_id:b.request_id,p_expected_version:b.expected_version,p_value:b.value}:create?{p_office_id:b.office_id,p_value:b.value,p_idempotency_key:b.idempotency_key}:{p_office_id:b.office_id,p_request_id:b.request_id,p_expected_version:b.expected_version,p_reason:b.reason,...(transfer?{p_assignee_id:b.assignee_id}:{})};
  const name=update?'request_preintake_update':create?'request_preintake_create':handoff?'request_preintake_handoff':transfer?'request_level_transfer':'request_level_revoke';
  const {data,error}=await res.locals.auth.client.rpc(name,args);
  if(error){const status=/^PT(401|403|404|409|422)$/.exec(error.code??'');if(status){errorResponse(res,Number(status[1]),`REQUEST_${status[1]}`,'Não foi possível realizar esta operação. Confira seu acesso e a versão do pedido.');return;}throw Error('Unavailable');}
  res.status(create?201:200).json({data:(transfer||handoff)?requestMutationResult(data):requestDetail(data)});
 }catch{errorResponse(res,503,'REQUESTS_UNAVAILABLE','Não foi possível confirmar. Preserve os dados e tente novamente.');}
});
