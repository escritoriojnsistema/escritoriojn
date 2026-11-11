import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
import {portalIdentityState,portalIdentityResult,validPortalCommand} from '../../../shared/portalIdentity.js';
export const portalIdentityRouter=Router();
portalIdentityRouter.use((_q,r,n)=>{r.setHeader('Cache-Control','private, no-store');r.setHeader('CDN-Cache-Control','no-store');r.vary('Authorization');n();});
portalIdentityRouter.use(async(q,r,n)=>{const auth=await authenticatedClient(q,r);if(auth){r.locals.portalIdentity=auth;n();}});
portalIdentityRouter.use((q,r,n)=>{if(!q.is('application/json'))return void errorResponse(r,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');n();},json({limit:'4kb',strict:true}));
portalIdentityRouter.post(['/state','/command'],async(q,r)=>{
 const b=q.body,command=q.path==='/command';
 if(Object.keys(q.query).length||!fields(b,command?['office_id','customer_id','command','key']:['office_id','customer_id'])||!uuid(b.office_id)||!(b.customer_id===null||uuid(b.customer_id))||command&&(!uuid(b.key)||!validPortalCommand(b.command)))return void errorResponse(r,422,'PORTAL_VALIDATION','Confira os dados do vínculo.');
 try{const{data,error}=await r.locals.portalIdentity.client.rpc(command?'portal_command31':'portal_state31',command?{o:b.office_id,cid:b.customer_id,c:b.command,k:b.key}:{o:b.office_id,cid:b.customer_id});
 if(error){const status=error.code==='42501'?403:Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);return void errorResponse(r,status,'PORTAL_'+status,status===409?'Vínculo ou cadastro alterado. Confira identidade e duplicidades.':status===422?'Código inválido, expirado ou já utilizado, ou dados incompatíveis.':status===503?'Resultado não confirmado. Confira o vínculo antes de repetir.':'Operação indisponível para seu acesso atual.');}
 r.json({data:command?portalIdentityResult(data):portalIdentityState(data)});
 }catch{errorResponse(r,503,'PORTAL_UNAVAILABLE','Resultado não confirmado. Confira o vínculo antes de repetir.');}
});
