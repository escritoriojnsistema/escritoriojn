import {Router,json} from 'express';
import {createHash} from 'node:crypto';
import {authenticatedClient} from '../auth/client.js';
import {errorResponse} from '../../errors.js';
import {fields,uuid,record} from '../team/validation.js';
import {validClosure} from '../../../shared/accountClosure.js';
import {zipDocuments} from './zip.js';
export const accountClosureRouter=Router();
accountClosureRouter.use((_req,res,next)=>{res.setHeader('Cache-Control','private, no-store');res.setHeader('CDN-Cache-Control','no-store');res.vary('Authorization');next();});
accountClosureRouter.use(async(req,res,next)=>{const a=await authenticatedClient(req,res);if(a){res.locals.closureAuth=a;next();}});
accountClosureRouter.use(json({limit:'5kb'}));
accountClosureRouter.post('/:action',async(req,res)=>{
 const b:unknown=req.body,action=req.params.action;
 const valid=!Object.keys(req.query).length&&(action==='close'?fields(b,['office_id','input'])&&uuid(b.office_id)&&validClosure(b.input):action==='export'?fields(b,['office_id'])&&uuid(b.office_id):action==='archives'?fields(b,['office_id','query','page'])&&uuid(b.office_id)&&typeof b.query==='string'&&b.query.length<=120&&Number.isInteger(b.page)&&Number(b.page)>0&&Number(b.page)<=100000:action==='documents'?fields(b,['office_id','user_id'])&&uuid(b.office_id)&&uuid(b.user_id):false);
 if(!valid){errorResponse(res,422,'ACCOUNT_VALIDATION','Confira os campos e a ciência do aviso.');return;}
 const body=b as Record<string,unknown>,auth=res.locals.closureAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
 const fail=(status=503)=>errorResponse(res,status,'ACCOUNT_CLOSURE_'+status,status===409?'O acervo mudou. Repita a exportação.':'Não foi possível concluir a operação.');
 try{
 const rpc=action==='close'?'account_close':action==='export'?'account_export_manifest':action==='archives'?'deleted_accounts_page':'deleted_account_documents';
 const args={p_office_id:body.office_id,...(action==='close'?{p_input:body.input}:action==='archives'?{p_query:body.query,p_page:body.page}:action==='documents'?{p_user_id:body.user_id}:{})};
 const {data,error}=await auth.client.rpc(rpc,args);if(error){fail(Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503));return;}
 if(action!=='export'){
  if(action==='close'){if(data?.closed!==true)throw Error('INVALID');let providerDisabled=false;try{const worker=await fetch(auth.url+'/functions/v1/account-closure',{method:'POST',headers:{Authorization:'Bearer '+auth.token,apikey:auth.key,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});if(worker.ok){const status:unknown=await worker.json();providerDisabled=record(status)&&record(status.data)&&status.data.pending===0&&status.data.processed===1;}}catch{/* The outbox remains pending for the scheduled worker. */}let providerRevoked=providerDisabled;if(!providerRevoked)try{const ended=await fetch(auth.url+'/auth/v1/logout?scope=global',{method:'POST',headers:{Authorization:'Bearer '+auth.token,apikey:auth.key},signal:AbortSignal.timeout(8000)});providerRevoked=ended.ok;}catch{/* The committed database denial remains authoritative. */}res.json({data:{closed:true,provider_sessions_revoked:providerRevoked,provider_disabled:providerDisabled}});return;}
  if(!data||!Array.isArray(data.items)||data.items.length>(action==='archives'?5:1000))throw Error('INVALID');
  if(action==='archives'){if(!Number.isSafeInteger(data.total)||data.total<0||data.page!==body.page)throw Error('INVALID');res.json({data:{items:data.items.map((x:Record<string,unknown>)=>{if(!uuid(x.id)||typeof x.name!=='string'||typeof x.closed_at!=='string')throw Error('INVALID');return{id:x.id,name:x.name,closed_at:x.closed_at};}),total:data.total,page:data.page}});}
  else res.json({data:{items:data.items.map((x:Record<string,unknown>)=>{if(!uuid(x.id)||typeof x.title!=='string'||typeof x.ready!=='boolean')throw Error('INVALID');return{id:x.id,title:x.title,ready:x.ready};})}});return;
 }
 if(!data||!Array.isArray(data.ids)||data.ids.length>1000||!data.ids.every(uuid))throw Error('INVALID');
 const ids=data.ids as string[];if(!ids.length){res.status(204).end();return;}
 const files:Buffer[]=[];let total=0;
 for(const id of ids){const response=await fetch(auth.url+'/functions/v1/document-artifacts',{method:'POST',headers:{Authorization:'Bearer '+auth.token,apikey:auth.key,'Content-Type':'application/json'},body:JSON.stringify({office_id:body.office_id,publication_id:id,action:'download'}),signal:AbortSignal.timeout(35000),cache:'no-store'});
 if(!response.ok){await response.body?.cancel();fail([401,403,404,409,422].includes(response.status)?response.status:503);return;}
 const sha=response.headers.get('X-Document-SHA256');if(response.headers.get('X-Document-Publication')!==id||!response.headers.get('Content-Type')?.startsWith('application/pdf')||!sha||!/^[a-f0-9]{64}$/.test(sha)||!response.body)throw Error('INVALID');
 const reader=response.body.getReader(),parts:Uint8Array[]=[];let size=0;try{for(;;){const{done,value}=await reader.read();if(done)break;size+=value.length;total+=value.length;if(size>3145728||total>33554432){await reader.cancel();throw Error('LIMIT');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=Buffer.concat(parts);if(bytes.subarray(0,5).toString()!=='%PDF-'||createHash('sha256').update(bytes).digest('hex')!==sha)throw Error('INVALID');files.push(bytes);
 }
 // Revalidate the full official manifest before releasing any buffered bytes.
 const again=await auth.client.rpc('account_export_manifest',{p_office_id:body.office_id});if(again.error||JSON.stringify(again.data?.ids)!==JSON.stringify(ids)){fail(409);return;}
 res.setHeader('Content-Type',files.length===1?'application/pdf':'application/zip');res.setHeader('Content-Disposition',`attachment; filename="Meus Documentos.${files.length===1?'pdf':'zip'}"`);res.setHeader('X-Content-Type-Options','nosniff');res.send(files.length===1?files[0]:zipDocuments(files));
 }catch{fail();}
});
