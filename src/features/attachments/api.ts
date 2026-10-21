import { createClient, type Session } from '@supabase/supabase-js';
import { attachmentBucket, attachmentMaxBytes, attachmentMimeTypes, type AttachmentCleanupPlan, type AttachmentDownload, type AttachmentIntent, type AttachmentPage, type AttachmentPolicy, type AttachmentProcessInput, type AttachmentProcessResult, type AttachmentRequestPage, type AttachmentUploadInput } from '../../../shared/attachments';
import { supabase } from '../auth/browser';
import { authenticatedFetch } from '../auth/authenticatedFetch';
import { sessionScope } from '../auth/sessionScope';

export class AttachmentsError extends Error {
 constructor(public status:number,public code?:string){
  super(status===401?'Sua sessão expirou ou foi encerrada. Entre novamente para continuar.':status===403?'Seu acesso não permite esta operação. Verifique com o proprietário.':status===404?'Este arquivo ou atendimento não está disponível no seu escopo.':code==='FILE_NOT_READY'?'O arquivo ainda não está disponível para esta ação.':code==='FILE_POLICY_CONFLICT'?'A política mudou. Consulte a versão atual antes de publicar novamente.':code==='FILE_IDEMPOTENCY_CONFLICT'?'Esta tentativa já foi registrada com outros dados. Confira os arquivos antes de repetir.':status===409?'O arquivo mudou ou já possui uma operação em andamento. Confira os arquivos e tente novamente.':status===422?'Confira o arquivo, seu formato, tamanho, classificação e item do atendimento.':'Anexos indisponíveis no momento. Confira sua conexão e tente novamente.');
 }
}
export const attachmentsError=(cause:unknown)=>cause instanceof AttachmentsError?cause:new AttachmentsError(503);

function privateStorage(session:Session,signal:AbortSignal){
 // This isolated client never adopts or stores an Auth session. Its Storage
 // requests always use the JWT captured by the enclosing operation guard.
 const storageFetch:typeof fetch=(input,init)=>{
  signal.throwIfAborted();const headers=new Headers(init?.headers);headers.set('Authorization',`Bearer ${session.access_token}`);
  return fetch(input,{...init,headers,cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(60_000),...(init?.signal?[init.signal]:[])])});
 };
 return createClient(import.meta.env.VITE_SUPABASE_URL,import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false,storageKey:`jn-files-${crypto.randomUUID()}`},global:{headers:{Authorization:`Bearer ${session.access_token}`},fetch:storageFetch}}).storage;
}

// One guard covers the whole operation, including the SDK network operation.
// The workspace signal also aborts when its office/authority key is discarded.
async function guarded<T>(work:(session:Session,signal:AbortSignal,check:()=>Promise<void>)=>Promise<T>,signal?:AbortSignal):Promise<T>{
 if(!supabase)throw new AttachmentsError(503);
 const provider=supabase,controller=new AbortController();let changed=false,unsubscribe:(()=>void)|undefined;
 const operationSignal=AbortSignal.any([controller.signal,...(signal?[signal]:[])]);
 try{
  operationSignal.throwIfAborted();const initial=await provider.auth.getSession();operationSignal.throwIfAborted();
  if(initial.error||!initial.data.session)throw new AttachmentsError(401);
  const session=initial.data.session,scope=sessionScope(session);
  const subscription=provider.auth.onAuthStateChange((_event,next)=>{if(!next||next.user.id!==session.user.id||sessionScope(next)!==scope){changed=true;controller.abort();}});
  unsubscribe=()=>subscription.data.subscription.unsubscribe();
  const check=async()=>{operationSignal.throwIfAborted();const current=await provider.auth.getSession();operationSignal.throwIfAborted();if(current.error||!current.data.session||current.data.session.user.id!==session.user.id||sessionScope(current.data.session)!==scope)throw new AttachmentsError(401);};
  await check();const result=await work(session,operationSignal,check);await check();return result;
 }catch(cause){if(signal?.aborted)throw cause;if(changed)throw new AttachmentsError(401);throw attachmentsError(cause);}
 finally{unsubscribe?.();}
}
async function request<T>(path:string,body:unknown,signal?:AbortSignal):Promise<T>{
 return guarded(async(session,operationSignal,check)=>{
  const response=await authenticatedFetch(`/api/attachments${path}`,{method:'POST',cache:'no-store',body:JSON.stringify(body),headers:{Authorization:`Bearer ${session.access_token}`,'Content-Type':'application/json'},signal:AbortSignal.any([operationSignal,AbortSignal.timeout(path==='/process'?60_000:25_000)])},session);
  const result:unknown=await response.json();await check();
  if(!response.ok){const code=result&&typeof result==='object'&&'error'in result&&result.error&&typeof result.error==='object'&&'code'in result.error?String(result.error.code):undefined;throw new AttachmentsError(response.status,code);}
  if(!result||typeof result!=='object'||!('data'in result)||!result.data||typeof result.data!=='object')throw new AttachmentsError(503);
  return result.data as T;
 },signal);
}
export const attachmentsApi={
 search:(office_id:string,request_id:string|null,page:number,size:number,signal?:AbortSignal)=>request<AttachmentPage>('/search',{office_id,request_id,page,size},signal),
 requests:(office_id:string,query:string,page:number,size:number,signal?:AbortSignal)=>request<AttachmentRequestPage>('/requests',{office_id,query,page,size},signal),
 intent:(office_id:string,input:AttachmentUploadInput,signal?:AbortSignal)=>request<AttachmentIntent>('/intents',{office_id,input},signal),
 download:(office_id:string,id:string,signal?:AbortSignal)=>request<AttachmentDownload>(`/${id}/download`,{office_id},signal),
 policy:(office_id:string,service_id:string,signal?:AbortSignal)=>request<AttachmentPolicy>('/policy',{office_id,service_id},signal),
 updatePolicy:(office_id:string,service_id:string,policy:AttachmentPolicy,reason:string,signal?:AbortSignal)=>request<AttachmentPolicy>('/policy/update',{office_id,service_id,expected_version:policy.version,max_bytes:policy.max_bytes,mime_types:policy.mime_types,reason},signal),
 cleanupPlan:(office_id:string,signal?:AbortSignal)=>request<AttachmentCleanupPlan>('/cleanup-plan',{office_id},signal),
 process:(office_id:string,input:AttachmentProcessInput,signal?:AbortSignal)=>request<AttachmentProcessResult>('/process',{office_id,...input},signal),
};
export async function uploadAttachment(office:string,file:File,input:Omit<AttachmentUploadInput,'name'|'mime_type'|'size_bytes'|'sha256'>,policy:AttachmentPolicy,signal:AbortSignal):Promise<AttachmentProcessResult>{
 const extension=file.name.split('.').at(-1)?.toLowerCase(),mime=file.type;
 const allowed=extension==='pdf'?'application/pdf':extension==='png'?'image/png':extension==='jpg'||extension==='jpeg'?'image/jpeg':'';
 if(!file.size||file.size>Math.min(policy.max_bytes,attachmentMaxBytes)||!attachmentMimeTypes.includes(mime as typeof attachmentMimeTypes[number])||mime!==allowed||!policy.mime_types.includes(mime as typeof attachmentMimeTypes[number]))throw new AttachmentsError(422,'FILE_VALIDATION');
 return guarded(async(session,operationSignal,check)=>{
  const buffer=await file.arrayBuffer();await check();
  const digest=await crypto.subtle.digest('SHA-256',buffer);await check();
  const sha256=Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
  const intent=await attachmentsApi.intent(office,{...input,name:file.name,mime_type:mime as AttachmentUploadInput['mime_type'],size_bytes:file.size,sha256},operationSignal);await check();
  if(intent.bucket!==attachmentBucket||!intent.object_path)throw new AttachmentsError(503);
  if(!intent.can_upload&&intent.file.status!=='aguardando_upload')return {file:intent.file,removed:0,pending:0};
  if(intent.can_upload){
   await check();
   const uploaded=await privateStorage(session,operationSignal).from(intent.bucket).upload(intent.object_path,file,{upsert:false,contentType:mime});
   await check();
   if(uploaded.error&&Number('statusCode'in uploaded.error?uploaded.error.statusCode:0)!==409)throw new AttachmentsError(503);
  }
  await check();return attachmentsApi.process(office,{action:'validate',args:{intent_id:intent.intent_id}},operationSignal);
 },signal);
}
export async function downloadAttachment(office:string,id:string,signal:AbortSignal):Promise<void>{
 await guarded(async(session,operationSignal,check)=>{
  const metadata=await attachmentsApi.download(office,id,operationSignal);await check();
  if(metadata.bucket!==attachmentBucket||!metadata.object_path)throw new AttachmentsError(503);
  const result=await privateStorage(session,operationSignal).from(metadata.bucket).download(metadata.object_path,{}, {signal:operationSignal,cache:'no-store'});await check();
  if(result.error||!result.data)throw new AttachmentsError(503);
  const url=URL.createObjectURL(result.data),link=document.createElement('a');
  try{await check();link.href=url;link.download=metadata.name;link.click();}finally{URL.revokeObjectURL(url);}
 },signal);
}
