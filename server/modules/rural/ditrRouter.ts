import {Router} from 'express';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
import {ditrState,ditrResult,validDitrCommand} from '../../../shared/ditr.js';

// Authentication, bounded JSON and private no-store headers are inherited from ruralRouter.
export const ditrRouter=Router();
ditrRouter.post(['/ditr-state','/ditr-command'],async(q,r)=>{
 const b=q.body;const command=q.path==='/ditr-command';
 if(Object.keys(q.query).length||!fields(b,command?['office_id','property_id','command','key']:['office_id','property_id','exercise','case_id','page'])||!uuid(b.office_id)||!uuid(b.property_id)||(command?!uuid(b.key)||!validDitrCommand(b.command):typeof b.exercise!=='number'||!Number.isInteger(b.exercise)||b.exercise<1900||b.exercise>2200||!(b.case_id===null||uuid(b.case_id))||typeof b.page!=='number'||!Number.isInteger(b.page)||b.page<1||b.page>100000)){
  errorResponse(r,422,'DITR_VALIDATION','Confira os campos da declaração.');return;
 }
 try{
  const {data,error}=await r.locals.rural.client.rpc(command?'ditr_command28':'ditr_state28',command?{o:b.office_id,p:b.property_id,c:b.command,k:b.key}:{o:b.office_id,p:b.property_id,y:b.exercise,cid:b.case_id,page:b.page});
  if(error){const status=Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);errorResponse(r,status,'DITR_'+status,status===409?'Os dados mudaram. Atualize e confira a declaração.':status===503?'Resultado não confirmado. Repita a mesma tentativa.':'Não foi possível concluir. Confira acesso, vínculo e campos.');return;}
  r.json({data:command?ditrResult(data):ditrState(data)});
 }catch{errorResponse(r,503,'DITR_UNAVAILABLE','Resultado não confirmado. Repita a mesma tentativa.');}
});
