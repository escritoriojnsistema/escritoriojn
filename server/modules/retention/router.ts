import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid,record} from '../team/validation.js';
import {retentionClasses,validRetentionPolicy,type RetentionClass} from '../../../shared/retention.js';
export const retentionRouter=Router();
retentionRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
retentionRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.retentionAuth=auth;next();}});
retentionRouter.use((req,res,next)=>{if(!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'12kb'}));
retentionRouter.post('/:action',async(req,res)=>{
 const b:unknown=req.body,a=req.params.action;
 const valid=!Object.keys(req.query).length&&(a==='state'?fields(b,['office_id','page'])&&uuid(b.office_id)&&Number.isInteger(b.page)&&Number(b.page)>=1&&Number(b.page)<=100000:a==='policy'?fields(b,['office_id','input'])&&uuid(b.office_id)&&validRetentionPolicy(b.input):a==='classify'?fields(b,['office_id','input'])&&uuid(b.office_id)&&(fields(b.input,['user_id','target_kind','target_id','data_class','document_type','revision'])||fields(b.input,['user_id','target_kind','target_id','data_class','document_type','revision','verified_start_at','verified_start_reason']))&&(!Object.hasOwn(b.input,'verified_start_at')||((b.input.verified_start_at===null||(typeof b.input.verified_start_at==='string'&&Number.isFinite(Date.parse(b.input.verified_start_at))))&&(b.input.verified_start_reason===null||(typeof b.input.verified_start_reason==='string'&&b.input.verified_start_reason.length<=1000))))&&uuid(b.input.user_id)&&uuid(b.input.target_id)&&['file','document'].includes(String(b.input.target_kind))&&retentionClasses.includes(b.input.data_class as RetentionClass)&&typeof b.input.document_type==='string'&&b.input.document_type.trim().length>0&&b.input.document_type.length<=100&&Number.isInteger(b.input.revision)&&Number(b.input.revision)>=0:a==='hold'?fields(b,['office_id','input'])&&uuid(b.office_id)&&fields(b.input,['user_id','data_class','reason','release_id'])&&uuid(b.input.user_id)&&retentionClasses.includes(b.input.data_class as RetentionClass)&&typeof b.input.reason==='string'&&b.input.reason.trim().length>0&&b.input.reason.length<=1000&&(b.input.release_id===null||uuid(b.input.release_id)):a==='reserve'?fields(b,['office_id','id','revision'])&&uuid(b.office_id)&&uuid(b.id)&&Number.isInteger(b.revision)&&Number(b.revision)>=1:false);
 if(!valid){errorResponse(res,422,'RETENTION_VALIDATION','Confira a classe, o fundamento, o marco e o prazo.');return;}
 const body=b as Record<string,unknown>;
 try{const {client}=res.locals.retentionAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
 const {data,error}=await client.rpc(a==='state'?'retention_state':a==='policy'?'retention_policy_set':a==='classify'?'retention_classify':a==='hold'?'retention_hold':'retention_reserve',{p_office_id:body.office_id,...(a==='state'?{p_page:body.page}:a==='reserve'?{p_id:body.id,p_revision:body.revision}:{p_input:body.input})});
 if(error){const status=Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);errorResponse(res,status,'RETENTION_'+status,status===409?'A decisão mudou, há uma suspensão ou o prazo não venceu. Atualize a lista.':'Não foi possível concluir a decisão de retenção.');return;}
 if(!record(data))throw Error('INVALID');res.json({data});
 }catch{errorResponse(res,503,'RETENTION_UNAVAILABLE','Não foi possível consultar a retenção. Tente novamente.');}
});
