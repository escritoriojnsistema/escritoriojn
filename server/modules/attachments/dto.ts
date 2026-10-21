import type {AttachmentFile,AttachmentPage,AttachmentPolicy,AttachmentRequestPage,AttachmentIntent,AttachmentDownload,AttachmentCleanupPlan,AttachmentProcessResult} from '../../../shared/attachments.js';
import {attachmentBucket,attachmentMaxBytes} from '../../../shared/attachments.js';
import {record,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
import {attachmentName,attachmentMime,attachmentHash,attachmentPath,validMimes} from './validation.js';
const count=(v:unknown,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=0&&Number(v)<=max;
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
export function attachmentFile(v:unknown):AttachmentFile {
 if(!record(v)||!uuid(v.id)||!uuid(v.request_id)||!(v.request_item_id===null||uuid(v.request_item_id))||!attachmentName(v.name)||!attachmentMime(v.mime_type)||!positive(v.size_bytes,attachmentMaxBytes)||!attachmentHash(v.sha256)||!['documento','identificacao','comprovante'].includes(String(v.classification))||!['aguardando_upload','quarentena','disponivel','rejeitado','removido'].includes(String(v.status))||!['not_configured','pending','clean','infected'].includes(String(v.scanner_status))||!(v.validation_reason===null||['hash_mismatch','type_mismatch','size_mismatch','invalid_content','object_missing','storage_error'].includes(String(v.validation_reason)))||!time(v.created_at)||!time(v.updated_at)||!['can_validate','can_download','can_copy'].every(k=>typeof v[k]==='boolean'))throw Error('Invalid attachment');
 if(!(v.intent_id===null||uuid(v.intent_id))||(v.can_download||v.can_copy)&&(v.status!=='disponivel'||v.scanner_status!=='clean')||v.can_validate&&(v.status!=='aguardando_upload'||!uuid(v.intent_id)))throw Error('Invalid attachment authority');
 return {id:v.id,request_id:v.request_id,request_item_id:v.request_item_id,name:v.name,mime_type:v.mime_type,size_bytes:v.size_bytes,sha256:v.sha256,classification:v.classification as AttachmentFile['classification'],status:v.status as AttachmentFile['status'],scanner_status:v.scanner_status as AttachmentFile['scanner_status'],validation_reason:v.validation_reason as AttachmentFile['validation_reason'],intent_id:v.intent_id,created_at:v.created_at,updated_at:v.updated_at,can_validate:v.can_validate as boolean,can_download:v.can_download as boolean,can_copy:v.can_copy as boolean};
}
export function attachmentPolicy(v:unknown):AttachmentPolicy {
 if(!record(v)||!positive(v.max_bytes,attachmentMaxBytes)||!validMimes(v.mime_types)||!positive(v.version,2147483646))throw Error('Invalid policy');
 return {max_bytes:v.max_bytes,mime_types:[...v.mime_types],version:v.version};
}
function page(v:unknown):asserts v is Record<string,unknown>&{items:unknown[];total:number;page:number;page_size:number}{if(!record(v)||!Array.isArray(v.items)||!count(v.total)||!positive(v.page)||![3,5].includes(Number(v.page_size))||typeof v.page_size!=='number'||v.items.length>v.page_size)throw Error('Invalid page');}
export function attachmentPage(v:unknown):AttachmentPage {page(v);if(typeof v.portal!=='boolean')throw Error('Invalid portal');return {items:v.items.map(attachmentFile),total:v.total,page:v.page,page_size:v.page_size,portal:v.portal};}
export function attachmentRequests(v:unknown):AttachmentRequestPage {
 page(v);return {items:v.items.map(x=>{
  if(!record(x)||!uuid(x.id)||!requestText(x.label,260)||typeof x.closed!=='boolean'||!Array.isArray(x.items)||x.items.length>10)throw Error('Invalid request');
  return {id:x.id,label:x.label,closed:x.closed,items:x.items.map(i=>{if(!record(i)||!uuid(i.id)||!uuid(i.service_id)||!requestText(i.name,120))throw Error('Invalid request item');return {id:i.id,service_id:i.service_id,name:i.name,policy:attachmentPolicy(i.policy)};})};
 }),total:v.total,page:v.page,page_size:v.page_size};
}
export function attachmentIntent(v:unknown):AttachmentIntent {
 if(!record(v)||!uuid(v.intent_id)||v.bucket!==attachmentBucket||!attachmentPath(v.object_path)||!time(v.expires_at)||typeof v.can_upload!=='boolean')throw Error('Invalid intent');
 const file=attachmentFile(v.file);if(v.can_upload&&file.status!=='aguardando_upload')throw Error('Invalid upload');
 return {file,intent_id:v.intent_id,bucket:attachmentBucket,object_path:v.object_path,expires_at:v.expires_at,can_upload:v.can_upload};
}
export function attachmentDownload(v:unknown):AttachmentDownload {
 if(!record(v)||v.bucket!==attachmentBucket||!attachmentPath(v.object_path)||!attachmentName(v.name)||!attachmentMime(v.mime_type))throw Error('Invalid download');
 return {bucket:attachmentBucket,object_path:v.object_path,name:v.name,mime_type:v.mime_type};
}
export function attachmentCleanupPlan(v:unknown):AttachmentCleanupPlan {
 if(!record(v)||!uuid(v.id)||!time(v.expires_at)||!count(v.count,20)||!count(v.orphan_count))throw Error('Invalid cleanup');
 const items=v.items??[];
 if(!Array.isArray(items)||items.length!==v.count||items.length>20||!items.every(i=>record(i)&&uuid(i.id)&&attachmentName(i.name)&&['rejeitado','aguardando_upload'].includes(String(i.status)))||new Set(items.map(i=>i.id)).size!==items.length)throw Error('Invalid cleanup objects');
 return {id:v.id,expires_at:v.expires_at,count:v.count,orphan_count:v.orphan_count,items:items.map(i=>({id:i.id as string,name:i.name as string,status:i.status as 'rejeitado'|'aguardando_upload'}))};
}
export function attachmentProcessResult(v:unknown):AttachmentProcessResult {
 if(!record(v)||!count(v.removed,20)||!count(v.pending,20))throw Error('Invalid process');
 return {file:v.file===null?null:attachmentFile(v.file),removed:v.removed,pending:v.pending};
}
