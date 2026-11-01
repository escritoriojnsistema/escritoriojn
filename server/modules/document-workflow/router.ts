import {Router,json,type Response} from 'express';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {documentExact as exact,documentObject as object,documentUuid as uuid} from '../../../shared/documents.js';
import {validWorkflowCommand,projectWorkflowState,projectPortalDocuments} from '../../../shared/documentWorkflowValidation.js';
export const workflowRouter=Router();
workflowRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
workflowRouter.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.workflowAuth=auth;next();}});
workflowRouter.use((req,res,next)=>{if(req.method!=='GET'&&req.method!=='HEAD'&&!req.is('application/json')){errorResponse(res,415,'UNSUPPORTED_MEDIA_TYPE','Envie um corpo JSON.');return;}next();},json({limit:'4kb'}));
const invalid=(res:Response)=>errorResponse(res,422,'WORKFLOW_VALIDATION','Confira a versão, a ação e o motivo.');
const failure=(res:Response,status:number)=>errorResponse(res,status,'WORKFLOW_'+status,({'401':'Entre novamente para continuar.','403':'Seu acesso não permite esta operação ou o documento ainda não está liberado.','404':'Documento não encontrado.','409':'O documento mudou. Atualize antes de continuar.','422':'Confira as pendências, a revisão e a assinatura.'} as Record<string,string>)[status]??'Operação indisponível. Preserve a tentativa e repita.');
const integer=(v:unknown)=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=100000;
function cashQueue(v:unknown){
 if(!object(v)||!Array.isArray(v.items)||v.items.length>5||typeof v.total!=='number'||!Number.isSafeInteger(v.total)||v.total<0||!integer(v.page)||v.page_size!==5)throw Error('Invalid cash queue');
 const items=v.items.map(i=>{if(!object(i)||!uuid(i.publication_id)||!uuid(i.request_id)||typeof i.protocol!=='string'||i.protocol.length>120||typeof i.title!=='string'||i.title.length>240||!(i.claimed===null||typeof i.claimed==='boolean')||typeof i.has_charge!=='boolean')throw Error('Invalid cash task');return {publication_id:i.publication_id,request_id:i.request_id,protocol:i.protocol,title:i.title,claimed:i.claimed===true,has_charge:i.has_charge};});
 return {items,total:v.total,page:v.page,page_size:5};
}
async function rpc(res:Response,name:string,args:Record<string,unknown>,project:(v:unknown)=>unknown){try{const {client}=res.locals.workflowAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;const {data,error}=await client.rpc(name,args);if(error){failure(res,Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503));return;}res.json({data:project(data)});}catch{failure(res,503);}}
workflowRouter.post('/state',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!exact(b,['office_id','document_id'])||!uuid(b.office_id)||!uuid(b.document_id)){invalid(res);return;}await rpc(res,'document_workflow_state',{p_office_id:b.office_id,p_document_id:b.document_id},projectWorkflowState);});
workflowRouter.post('/command',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!exact(b,['office_id','document_id','command','idempotency_key'])||!uuid(b.office_id)||!uuid(b.document_id)||!uuid(b.idempotency_key)||!validWorkflowCommand(b.command)){invalid(res);return;}await rpc(res,'document_workflow_command',{p_office_id:b.office_id,p_document_id:b.document_id,p_command:b.command,p_idempotency_key:b.idempotency_key},projectWorkflowState);});
workflowRouter.post('/portal',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!exact(b,['office_id','page'])||!uuid(b.office_id)||!integer(b.page)){invalid(res);return;}await rpc(res,'portal_documents_page',{p_office_id:b.office_id,p_page:b.page},projectPortalDocuments);});
workflowRouter.post('/cash-queue',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!exact(b,['office_id','page'])||!uuid(b.office_id)||!integer(b.page)){invalid(res);return;}await rpc(res,'document_cash_queue',{p_office_id:b.office_id,p_page:b.page},cashQueue);});
workflowRouter.post('/cash-claim',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!exact(b,['office_id','publication_id','idempotency_key'])||!uuid(b.office_id)||!uuid(b.publication_id)||!uuid(b.idempotency_key)){invalid(res);return;}await rpc(res,'document_cash_claim',{p_office_id:b.office_id,p_publication_id:b.publication_id,p_idempotency_key:b.idempotency_key},cashQueue);});
workflowRouter.post('/artifact',async(req,res)=>{const b:unknown=req.body;if(Object.keys(req.query).length||!exact(b,['office_id','publication_id','action'])||!uuid(b.office_id)||!uuid(b.publication_id)||!['generate','download'].includes(String(b.action))){invalid(res);return;}
 const {url,key,token}=res.locals.workflowAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
 try{const response=await fetch(url+'/functions/v1/document-artifacts',{method:'POST',headers:{Authorization:'Bearer '+token,apikey:key,'Content-Type':'application/json'},body:JSON.stringify(b),signal:AbortSignal.timeout(35000),cache:'no-store'});
 if(!response.ok){await response.body?.cancel();failure(res,[401,403,404,409,422].includes(response.status)?response.status:503);return;}
 if(b.action==='generate'){const v:unknown=await response.json();if(!object(v)||!object(v.data)||v.data.publication_id!==b.publication_id||v.data.ready!==true){failure(res,503);return;}res.json({data:{publication_id:b.publication_id,ready:true}});return;}
 if(!response.headers.get('Content-Type')?.startsWith('application/pdf')||Number(response.headers.get('Content-Length'))>3145728||!response.body){await response.body?.cancel();failure(res,503);return;}
 const parts:Uint8Array[]=[];let size=0;const reader=response.body.getReader();try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>3145728){await reader.cancel();failure(res,503);return;}parts.push(value);}}finally{reader.releaseLock();}
 if(size<8){failure(res,503);return;}res.setHeader('Content-Type','application/pdf');res.setHeader('Content-Disposition',`attachment; filename="documento-${b.publication_id}.pdf"`);res.send(Buffer.concat(parts));
 }catch{failure(res,503);}
});
