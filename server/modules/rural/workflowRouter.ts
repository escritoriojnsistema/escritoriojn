import {Router} from 'express';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
import {ruralWorkflowState,ruralWorkflowResult,validRuralWorkflowCommand} from '../../../shared/ruralWorkflow.js';
export const ruralWorkflowRouter=Router();
ruralWorkflowRouter.post(['/workflow-state','/workflow-command'],async(q,r)=>{
 const b=q.body,command=q.path==='/workflow-command';
 if(Object.keys(q.query).length||!fields(b,command?['office_id','request_id','command','key']:['office_id','request_id','page'])||!uuid(b.office_id)||!uuid(b.request_id)||(command?!uuid(b.key)||!validRuralWorkflowCommand(b.command):typeof b.page!=='number'||!Number.isInteger(b.page)||b.page<1||b.page>100000))return void errorResponse(r,422,'RURAL_WORKFLOW_VALIDATION','Confira os campos do encaminhamento.');
 try{
  const {data,error}=await r.locals.rural.client.rpc(command?'rural_workflow_command29':'rural_workflow_state29',command?{o:b.office_id,rid:b.request_id,c:b.command,k:b.key}:{o:b.office_id,rid:b.request_id,page:b.page});
  if(error){const status=Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);return void errorResponse(r,status,'RURAL_WORKFLOW_'+status,status===409?'Os dados mudaram. Atualize e confira o encaminhamento.':status===503?'Resultado não confirmado. Repita a mesma tentativa.':'Não foi possível concluir. Confira acesso, checklist e campos.');}
  r.json({data:command?ruralWorkflowResult(data):ruralWorkflowState(data)});
 }catch{errorResponse(r,503,'RURAL_WORKFLOW_UNAVAILABLE','Resultado não confirmado. Repita a mesma tentativa.');}
});
