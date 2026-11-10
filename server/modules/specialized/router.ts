import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
import {specializedState,specializedResult,validSpecializedCommand} from '../../../shared/specialized.js';
export const specializedRouter=Router();
specializedRouter.use((_q,r,n)=>{r.setHeader('Cache-Control','private, no-store');r.setHeader('CDN-Cache-Control','no-store');r.vary('Authorization');n();});
specializedRouter.use(async(q,r,n)=>{const a=await authenticatedClient(q,r);if(a){r.locals.specialized=a;n();}});
specializedRouter.use(json({limit:'16kb'}));
specializedRouter.post(['/state','/command'],async(q,r)=>{
 const b=q.body,command=q.path==='/command';
 if(Object.keys(q.query).length||!fields(b,command?['office_id','request_id','command','key']:['office_id','request_id','page'])||!uuid(b.office_id)||!uuid(b.request_id)||(command?!uuid(b.key)||!validSpecializedCommand(b.command):typeof b.page!=='number'||!Number.isInteger(b.page)||b.page<1||b.page>100000))return void errorResponse(r,422,'SPECIALIZED_VALIDATION','Confira os campos do caso.');
 try{
  const {data,error}=await r.locals.specialized.client.rpc(command?'specialized_command30':'specialized_state30',command?{o:b.office_id,rid:b.request_id,c:b.command,k:b.key}:{o:b.office_id,rid:b.request_id,page:b.page});
  if(error){const status=Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);return void errorResponse(r,status,'SPECIALIZED_'+status,status===409?'Os dados mudaram. Atualize e confira o caso.':status===503?'Resultado não confirmado. Repita a mesma tentativa.':'Não foi possível concluir. Confira acesso, checklist e campos.');}
  r.json({data:command?specializedResult(data):specializedState(data)});
 }catch{errorResponse(r,503,'SPECIALIZED_UNAVAILABLE','Resultado não confirmado. Repita a mesma tentativa.');}
});
