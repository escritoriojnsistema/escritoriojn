import {createClient} from '@supabase/supabase-js';
import {validateAttachmentBytes} from './validation.ts';
import type {AttachmentLease,AttachmentLeaseObject} from '../../../shared/attachments.ts';
export type PrivateAttachmentsConfig={url:string;anonKey:string;serviceRoleKey:string};
const maxBytes=10*1024*1024;
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const fields=(v:unknown,keys:string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==='string'&&uuid.test(v);
const path=(v:unknown,office:string):v is string=>typeof v==='string'&&v.split('/').length===3&&v.split('/').every(id)&&v.split('/')[0]===office;
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',Vary:'Authorization','X-Content-Type-Options':'nosniff'}});
const error=(status:number,code:string)=>json({error:{code}},status);
const safeErrors:Record<string,number>={AUTH_REQUIRED:401,FILES_FORBIDDEN:403,REQUESTS_FORBIDDEN:403,FILE_NOT_FOUND:404,REQUEST_NOT_FOUND:404,FILE_CONFLICT:409,FILE_IDEMPOTENCY_CONFLICT:409,FILE_POLICY_CONFLICT:409,FILE_NOT_READY:409,FILE_VALIDATION:422};
function rpcError(e:{code?:string;message?:string}){const status=e.message&&Object.hasOwn(safeErrors,e.message)?safeErrors[e.message]:0;return error(status&&e.code===`PT${status}`?status:503,status&&e.code===`PT${status}`?e.message!:'FILES_UNAVAILABLE');}
function validBody(v:unknown):v is {office_id:string;action:'validate'|'copy'|'cleanup';args:Record<string,unknown>}{
 if(!fields(v,['office_id','action','args'])||!id(v.office_id))return false;
 if(v.action==='validate')return fields(v.args,['intent_id'])&&id(v.args.intent_id);
 if(v.action==='cleanup')return fields(v.args,['plan_id'])&&id(v.args.plan_id);
 return v.action==='copy'&&fields(v.args,['source_file_id','target_request_id','target_item_id','idempotency_key'])&&id(v.args.source_file_id)&&id(v.args.target_request_id)&&(v.args.target_item_id===null||id(v.args.target_item_id))&&id(v.args.idempotency_key);
}
function validLease(v:unknown,body:{office_id:string;action:string}):v is AttachmentLease {
 return object(v)&&id(v.lease_id)&&typeof v.lease_token==='string'&&/^[A-Za-z0-9_-]{32,128}$/.test(v.lease_token)&&v.action===body.action&&typeof v.expires_at==='string'&&Number.isFinite(Date.parse(v.expires_at))&&(v.result!=null||Date.parse(v.expires_at)>Date.now())&&Array.isArray(v.objects)&&v.objects.length<=(body.action==='cleanup'?20:1)&&(body.action==='cleanup'||v.objects.length===1)&&v.objects.every(o=>object(o)&&id(o.file_id)&&id(o.intent_id)&&o.bucket==='request-attachments'&&path(o.object_path,body.office_id)&&typeof o.name==='string'&&o.name.length<=180&&['application/pdf','image/png','image/jpeg'].includes(String(o.mime_type))&&Number.isSafeInteger(o.size_bytes)&&Number(o.size_bytes)>0&&Number(o.size_bytes)<=maxBytes&&typeof o.sha256==='string'&&/^[a-f0-9]{64}$/.test(o.sha256)&&(body.action!=='copy'||path(o.source_path,body.office_id)));
}
function projectResult(v:unknown){
 if(!object(v)||!Number.isSafeInteger(v.removed)||Number(v.removed)<0||Number(v.removed)>20||!Number.isSafeInteger(v.pending)||Number(v.pending)<0||Number(v.pending)>20)throw Error('Invalid completion');
 let file:Record<string,unknown>|null=null;
 if(v.file!==null){
  if(!object(v.file)||!id(v.file.id)||!id(v.file.request_id)||!['aguardando_upload','quarentena','disponivel','rejeitado','removido'].includes(String(v.file.status))||(v.file.can_download||v.file.can_copy)&&(v.file.status!=='disponivel'||v.file.scanner_status!=='clean'))throw Error('Invalid file completion');
  file={};for(const key of ['id','request_id','request_item_id','name','mime_type','size_bytes','sha256','classification','status','scanner_status','validation_reason','intent_id','created_at','updated_at','can_validate','can_download','can_copy'])file[key]=v.file[key];
 }
 return {file,removed:v.removed,pending:v.pending};
}
async function boundedBytes(response:Pick<Response,'headers'|'body'>,limit=maxBytes){
 if(Number(response.headers.get('Content-Length'))>limit){await response.body?.cancel();throw Error('size_mismatch');}
 if(!response.body)throw Error('storage_error');const reader=response.body.getReader(),parts:Uint8Array[]=[];let total=0;
 try{for(;;){const {done,value}=await reader.read();if(done)break;total+=value.length;if(total>limit){await reader.cancel();throw Error('size_mismatch');}parts.push(value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(total);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}return bytes;
}
/** Only a current scoped database lease determines what this privileged worker can touch. */
export function createPrivateAttachmentsHandler(config:PrivateAttachmentsConfig){
 return async(request:Request):Promise<Response>=>{
  if(request.method!=='POST')return error(405,'METHOD_NOT_ALLOWED');
  const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(request.headers.get('Authorization')??'')?.[1];if(!token)return error(401,'AUTH_REQUIRED');
  if(!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type')??''))return error(415,'UNSUPPORTED_MEDIA_TYPE');
  let body:unknown;try{body=JSON.parse(new TextDecoder().decode(await boundedBytes(request,2048)));}catch(cause){return error(cause instanceof Error&&cause.message==='size_mismatch'?413:400,cause instanceof Error&&cause.message==='size_mismatch'?'PAYLOAD_TOO_LARGE':'INVALID_JSON');}
  if(!validBody(body))return error(422,'FILE_VALIDATION');if(!config.url||!config.anonKey||!config.serviceRoleKey)return error(503,'FILES_UNAVAILABLE');
  const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{...init,signal:AbortSignal.any([AbortSignal.timeout(12_000),...(init?.signal?[init.signal]:[])])})}};
  try{
   const caller=createClient(config.url,config.anonKey,{...options,global:{...options.global,headers:{Authorization:`Bearer ${token}`}}});
   const identity=await caller.auth.getUser(token);if(identity.error||!identity.data.user)return error(identity.error?.status&&identity.error.status<429?401:503,identity.error?.status&&identity.error.status<429?'AUTH_REQUIRED':'FILES_UNAVAILABLE');
   const claimed=await caller.rpc('files_process_claim',{p_office_id:body.office_id,p_action:body.action,p_args:body.args,p_event_id:crypto.randomUUID()});if(claimed.error)return rpcError(claimed.error);if(!validLease(claimed.data,body))return error(503,'FILES_UNAVAILABLE');
   const lease=claimed.data;
   if(lease.result!=null)return json({data:projectResult(lease.result)});
   const admin=createClient(config.url,config.serviceRoleKey,options);
   const finish=async(result:Record<string,unknown>)=>{const completed=await admin.rpc('files_process_complete',{p_lease_id:lease.lease_id,p_lease_token:lease.lease_token,p_result:result,p_event_id:crypto.randomUUID()});if(completed.error)return rpcError(completed.error);return json({data:projectResult(completed.data)});};
   if(body.action==='cleanup'){
    const removed_ids:string[]=[];
    // Bounded batches; a failure never marks an undeleted object as removed.
    for(let offset=0;offset<lease.objects.length;offset+=4){await Promise.all(lease.objects.slice(offset,offset+4).map(async o=>{const deleted=await admin.storage.from(o.bucket).remove([o.object_path]);if(!deleted.error)removed_ids.push(o.file_id);}));}
    return finish({outcome:'removed',removed_ids});
   }
   const file=lease.objects[0];
   if(body.action==='copy'){
    const copied=await admin.storage.from(file.bucket).copy(file.source_path!,file.object_path);
    if(copied.error){
     // A prior successful copy can precede a failed DB response. Retry reads and
     // verifies the same random destination; it never overwrites another object.
     const exists=await admin.storage.from(file.bucket).exists(file.object_path);
     if(exists.error||!exists.data)return finish({outcome:'storage_error',reason:'storage_error'});
    }
   }
   return await validateStored(file,config,options.global.fetch,finish);
  }catch{return error(503,'FILES_UNAVAILABLE');}
 };
}
async function validateStored(file:AttachmentLeaseObject,config:PrivateAttachmentsConfig,fetcher:(input:RequestInfo|URL,init?:RequestInit)=>Promise<Response>,finish:(result:Record<string,unknown>)=>Promise<Response>){
 let response:Response;
 try{response=await fetcher(`${config.url}/storage/v1/object/authenticated/${file.bucket}/${file.object_path}`,{headers:{Authorization:`Bearer ${config.serviceRoleKey}`,apikey:config.serviceRoleKey},cache:'no-store'});}catch{return finish({outcome:'storage_error',reason:'storage_error'});}
 if(!response.ok){await response.body?.cancel();return finish(response.status===404||response.status===400?{outcome:'missing',reason:'object_missing'}:{outcome:'storage_error',reason:'storage_error'});}
 try{return finish(await validateAttachmentBytes(await boundedBytes(response),file));}catch(cause){return finish(cause instanceof Error&&cause.message==='size_mismatch'?{outcome:'rejected',reason:'size_mismatch'}:{outcome:'storage_error',reason:'storage_error'});}
}
