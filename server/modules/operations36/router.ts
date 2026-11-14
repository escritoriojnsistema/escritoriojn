import {Router,json} from 'express';
import {createPublicKey} from 'node:crypto';
import {validOperationsPolicy,type OperationsState} from '../../../shared/operations36.js';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
export const operations36Router=Router();
operations36Router.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.operationsAuth=auth;next();}});
operations36Router.use((req,res,next)=>{if(!req.is('application/json'))return void errorResponse(res,415,'OPERATIONS_VALIDATION','Envie JSON.');next();},json({limit:'12kb'}));
operations36Router.post('/:action',async(req,res)=>{
 const b=req.body,save=req.params.action==='save';
 if(Object.keys(req.query).length||!uuid(b?.office_id)||!(save?fields(b,['office_id','expected_revision','policy','key'])&&Number.isSafeInteger(b.expected_revision)&&Number(b.expected_revision)>=0&&uuid(b.key)&&validOperationsPolicy(b.policy):req.params.action==='state'&&fields(b,['office_id']))){errorResponse(res,422,'OPERATIONS_VALIDATION','Confira a configuração de continuidade.');return;}
 if(save&&b.policy.recipient_public_key){try{const key=createPublicKey(b.policy.recipient_public_key);if(key.asymmetricKeyType!=='rsa'||(key.asymmetricKeyDetails?.modulusLength??0)<3072)throw Error();}catch{errorResponse(res,422,'OPERATIONS_PUBLIC_KEY','Use uma chave pública RSA de pelo menos3072bits; nunca informe chave privada.');return;}}
 try{
  const auth=res.locals.operationsAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
  const {data,error}=await auth.client.rpc(save?'operations36_save':'operations36_state',{p_office_id:b.office_id,...(save?{p_expected_revision:b.expected_revision,p_policy:b.policy,p_key:b.key}:{})});
  if(error){const status=Number(/^PT(401|403|409|422)$/.exec(error.code??'')?.[1]??503);errorResponse(res,status,'OPERATIONS_'+status,status===409?'A configuração mudou. Confira antes de salvar novamente.':'Não foi possível acessar a continuidade.');return;}
  const s=data as OperationsState;
  if(!s||!Number.isSafeInteger(s.revision)||s.revision<0||(s.revision===0)!==(s.policy===null)||s.policy!==null&&!validOperationsPolicy(s.policy)||!s.usage||![s.usage.customers,s.usage.requests,s.usage.files,s.usage.declared_file_bytes].every(n=>Number.isSafeInteger(n)&&n>=0)||s.production_backup_verified!==false||s.provider_usage!==null||!Number.isFinite(Date.parse(s.observed_at)))throw Error();
  res.json({data:{revision:s.revision,policy:s.policy,usage:{customers:s.usage.customers,requests:s.usage.requests,files:s.usage.files,declared_file_bytes:s.usage.declared_file_bytes},observed_at:s.observed_at,production_backup_verified:false,provider_usage:null}});
 }catch{errorResponse(res,503,'OPERATIONS_UNAVAILABLE','Continuidade indisponível. Preserve a tentativa e confira a conexão.');}
});
