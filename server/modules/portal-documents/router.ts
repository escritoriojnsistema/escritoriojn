import {Router,json} from 'express';
import {authenticatedClient} from '../auth/client.js';import {fields,uuid} from '../team/validation.js';import {errorResponse} from '../../errors.js';
import {portalPage32,portalState32,portalShares32,portalCommandResult32,validPortalShare32} from '../../../shared/portalDocuments.js';
export const portalDocumentsRouter=Router();
portalDocumentsRouter.use((_q,r,n)=>{r.setHeader('Cache-Control','private, no-store');r.setHeader('CDN-Cache-Control','no-store');r.vary('Authorization');n();});
portalDocumentsRouter.use(async(q,r,n)=>{const auth=await authenticatedClient(q,r);if(auth){r.locals.portal32=auth;n();}});
portalDocumentsRouter.use((q,r,n)=>{if(!q.is('application/json'))return void errorResponse(r,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');n();},json({limit:'4kb',strict:true}));
const page=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=100000;
portalDocumentsRouter.post(['/page','/state','/shares','/command'],async(q,r)=>{
 const b=q.body,path=q.path;
 const keys=path==='/page'?['office_id','query','page','size']:path==='/state'?['office_id','publication_id','page','size']:path==='/shares'?['office_id','publication_id','page']:['office_id','publication_id','command','key'];
 if(Object.keys(q.query).length||!fields(b,keys)||!uuid(b.office_id)||(path!=='/page'&&!uuid(b.publication_id))||(path==='/command'?(!uuid(b.key)||!validPortalShare32(b.command)):!page(b.page))||(['/page','/state'].includes(path)&&(typeof b.size!=='number'||![3,5].includes(b.size)))||path==='/page'&&(typeof b.query!=='string'||[...b.query].length>120||/[\u0000-\u001f\u007f]/.test(b.query)))return void errorResponse(r,422,'PORTAL_VALIDATION','Confira a publicação, a pessoa, o prazo e a página.');
 const method=path==='/page'?'portal_documents_page32':path==='/state'?'portal_document_state32':path==='/shares'?'portal_shares_state32':'portal_share_command32';
 const args=path==='/page'?{o:b.office_id,q:String(b.query).trim(),page:b.page,size:b.size}:path==='/state'?{o:b.office_id,pid:b.publication_id,page:b.page,size:b.size}:path==='/shares'?{o:b.office_id,pid:b.publication_id,page:b.page}:{o:b.office_id,pid:b.publication_id,c:b.command,k:b.key};
 try{const{data,error}=await r.locals.portal32.client.rpc(method,args);if(error){const status=error.code==='42501'?403:Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);return void errorResponse(r,status,'PORTAL_'+status,status===409?'A versão ou autorização mudou. Confira o estado atual.':status===503?'Resultado não confirmado. Preserve a tentativa e repita.':'Documento ou autorização indisponível no seu acesso atual.');}r.json({data:path==='/page'?portalPage32(data):path==='/state'?portalState32(data):path==='/shares'?portalShares32(data):portalCommandResult32(data)});}catch{errorResponse(r,503,'PORTAL_UNAVAILABLE','Resultado não confirmado. Preserve a tentativa e repita.');}
});
