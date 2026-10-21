import type {AttachmentMime,AttachmentProcessInput,AttachmentUploadInput} from '../../../shared/attachments.js';
import {attachmentMaxBytes,attachmentMimeTypes} from '../../../shared/attachments.js';
import {fields,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
export const attachmentMime=(v:unknown):v is AttachmentMime=>typeof v==='string'&&(attachmentMimeTypes as readonly string[]).includes(v);
export const attachmentHash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const attachmentName=(v:unknown):v is string=>requestText(v,180)&&!/[<>:"/\\|?*\u202a-\u202e\u2066-\u2069]/.test(v)&&v===v.trim()&&!v.startsWith('.');
export function filenameMatches(name:string,mime:string){const extension=name.split('.').at(-1)?.toLowerCase();return mime==='application/pdf'?extension==='pdf':mime==='image/png'?extension==='png':mime==='image/jpeg'&&['jpg','jpeg'].includes(extension??'');}
export const validMimes=(v:unknown):v is AttachmentMime[]=>Array.isArray(v)&&v.length>=1&&v.length<=3&&new Set(v).size===v.length&&v.every(attachmentMime);
export function validUploadInput(v:unknown):v is AttachmentUploadInput {
 return fields(v,['request_id','request_item_id','name','mime_type','size_bytes','sha256','classification','idempotency_key'])&&uuid(v.request_id)&&(v.request_item_id===null||uuid(v.request_item_id))&&attachmentName(v.name)&&attachmentMime(v.mime_type)&&filenameMatches(v.name,v.mime_type)&&positive(v.size_bytes,attachmentMaxBytes)&&attachmentHash(v.sha256)&&['documento','identificacao','comprovante'].includes(String(v.classification))&&uuid(v.idempotency_key);
}
export function validProcessInput(v:unknown):v is AttachmentProcessInput {
 if(!fields(v,['action','args']))return false;
 if(v.action==='validate')return fields(v.args,['intent_id'])&&uuid(v.args.intent_id);
 if(v.action==='cleanup')return fields(v.args,['plan_id'])&&uuid(v.args.plan_id);
 return v.action==='copy'&&fields(v.args,['source_file_id','target_request_id','target_item_id','idempotency_key'])&&uuid(v.args.source_file_id)&&uuid(v.args.target_request_id)&&(v.args.target_item_id===null||uuid(v.args.target_item_id))&&uuid(v.args.idempotency_key);
}
export const attachmentPath=(v:unknown,office?:string):v is string=>typeof v==='string'&&v.split('/').length===3&&v.split('/').every(uuid)&&(!office||v.split('/')[0]===office);
