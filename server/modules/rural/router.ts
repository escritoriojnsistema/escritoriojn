import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid} from '../team/validation.js';
import {ruralState,ruralResult} from '../../../shared/rural.js';
import {ditrRouter} from './ditrRouter.js';
export const ruralRouter=Router();
ruralRouter.use((_q,r,n)=>{r.setHeader('Cache-Control','private, no-store');r.setHeader('CDN-Cache-Control','no-store');r.vary('Authorization');n();});
ruralRouter.use(async(q,r,n)=>{const a=await authenticatedClient(q,r);if(a){r.locals.rural=a;n();}});
ruralRouter.use(json({limit:'6kb'}));
ruralRouter.use(ditrRouter);
ruralRouter.post('/:operation',async(q,r)=>{
 const b=q.body;const command=q.params.operation==='command';
 if(Object.keys(q.query).length||!['state','command'].includes(q.params.operation)||!fields(b,command?['office_id','property_id','command','key']:['office_id','property_id','page'])||!uuid(b.office_id)||!(b.property_id===null||uuid(b.property_id))||(command? !uuid(b.key)||!b.command||typeof b.command!=='object':typeof b.page!=='number'||!Number.isInteger(b.page)||b.page<1||b.page>100000)){errorResponse(r,422,'RURAL_VALIDATION','Confira os campos informados.');return;}
 try{const {data,error}=await r.locals.rural.client.rpc(command?'rural_command27':'rural_state27',command?{o:b.office_id,p:b.property_id,c:b.command,k:b.key}:{o:b.office_id,p:b.property_id,page:b.page});if(error){const status=Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);errorResponse(r,status,'RURAL_'+status,status===409?'Os dados mudaram. Atualize o imóvel.':'Não foi possível concluir. Confira acesso e campos.');return;}r.json({data:command?ruralResult(data):ruralState(data)});}catch{errorResponse(r,503,'RURAL_UNAVAILABLE','Repita a mesma tentativa.');}
});
