import {accountCorrection} from '../account/dto.js';
import type {RequestSummary,StaffRequestSummary,RequestPage,RequestDetail,RequestHistory,StoredRequestItem,RequestOptions,RequestMutationResult} from '../../../shared/requests.js';
import {publicRequestStatusLabels} from '../../../shared/requests.js';
import {validService} from '../../../shared/services.js';
import {serviceQuote} from '../services/dto.js';
import {record,uuid} from '../team/validation.js';
import {positive,requestStatus,requestText} from './validation.js';

const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=max;
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const nullableId=(v:unknown):v is string|null=>v===null||uuid(v);
const nullableName=(v:unknown):v is string|null=>v===null||requestText(v,120);
function summary(v:unknown):RequestSummary {
 if(!record(v)||!uuid(v.id)||!requestText(v.protocol,80)||!requestText(v.title,120)||typeof v.public_status!=='string'||!Object.hasOwn(publicRequestStatusLabels,v.public_status)||!time(v.created_at)||!time(v.updated_at))throw Error('Invalid request summary');
 return {id:v.id,protocol:v.protocol,title:v.title,public_status:v.public_status as RequestSummary['public_status'],created_at:v.created_at,updated_at:v.updated_at};
}
function staffSummary(v:unknown):StaffRequestSummary {
 const base=summary(v);
 if(!record(v)||!requestStatus(v.status)||!['presencial','whatsapp','portal'].includes(String(v.origin))||!['normal','urgent'].includes(String(v.priority))||!uuid(v.created_by)||!(v.created_by_name===undefined||nullableName(v.created_by_name))||!nullableId(v.assignee_id)||!nullableName(v.assignee_name)||!nullableName(v.customer_name)||!positive(v.version,2147483646))throw Error('Invalid staff summary');
 return {...base,status:v.status as StaffRequestSummary['status'],origin:v.origin as StaffRequestSummary['origin'],priority:v.priority as StaffRequestSummary['priority'],created_by:v.created_by,created_by_name:v.created_by_name??null,assignee_id:v.assignee_id,assignee_name:v.assignee_name,customer_name:v.customer_name,version:v.version};
}
export function requestPage(v:unknown):RequestPage {
 if(!record(v)||typeof v.portal!=='boolean'||!Array.isArray(v.items)||!int(v.total)||!positive(v.page)||!int(v.page_size)||![3,5].includes(v.page_size)||v.items.length>v.page_size)throw Error('Invalid requests page');
 return {portal:v.portal,items:v.items.map(v.portal?summary:staffSummary),total:v.total,page:v.page,page_size:v.page_size};
}
function history(v:unknown):RequestHistory {
 if(!record(v)||!uuid(v.id)||!['created','status','transfer','note','triage'].includes(String(v.kind))||!uuid(v.actor_id)||!nullableName(v.actor_name)||!requestText(v.reason,2000,0,true)
  ||!(v.from_status===null||requestStatus(v.from_status))||!(v.to_status===null||requestStatus(v.to_status))||!nullableId(v.from_assignee)||!nullableId(v.to_assignee)||!time(v.created_at))throw Error('Invalid request history');
 return {id:v.id,kind:v.kind as RequestHistory['kind'],actor_id:v.actor_id,actor_name:v.actor_name,reason:v.reason,from_status:v.from_status as RequestHistory['from_status'],to_status:v.to_status as RequestHistory['to_status'],from_assignee:v.from_assignee,to_assignee:v.to_assignee,created_at:v.created_at};
}
function item(v:unknown):StoredRequestItem {
 if(!record(v)||!uuid(v.id)||!record(v.fields)||Object.keys(v.fields).length>12||!Object.entries(v.fields).every(([k,x])=>/^[a-z][a-z0-9_]{0,31}$/.test(k)&&requestText(x,500,0))||!Array.isArray(v.participant_ids)||v.participant_ids.length>20||!v.participant_ids.every(uuid)||new Set(v.participant_ids).size!==v.participant_ids.length||!Array.isArray(v.checklist)||v.checklist.length>12||!v.checklist.every(x=>requestText(x,120))||new Set(v.checklist).size!==v.checklist.length)throw Error('Invalid request item');
 return {id:v.id,snapshot:serviceQuote(v.snapshot),fields:Object.fromEntries(Object.entries(v.fields)) as Record<string,string>,participant_ids:[...v.participant_ids],checklist:[...v.checklist]};
}
export function requestDetail(v:unknown):RequestDetail {
 const base=summary(v);
 if(!record(v)||typeof v.portal!=='boolean'||!requestText(v.message,2000,0,true))throw Error('Invalid request detail');
 if(v.portal){
  if(!Array.isArray(v.services)||v.services.length>10||!v.services.every(x=>requestText(x,120)))throw Error('Invalid portal services');
  if(v.assignee_name!==undefined&&!nullableName(v.assignee_name))throw Error('Invalid attendant');
  return {...base,portal:true,message:v.message,services:[...v.services],assignee_name:v.assignee_name??null,...(v.correction==null?{}:{correction:accountCorrection(v.correction)})};
 }
 for(const k of ['can_reclaim','following_only'])if(v[k]!==undefined&&typeof v[k]!=='boolean')throw Error('Invalid authority');
 const staff=staffSummary(v);
 if(!nullableId(v.customer_id)||!requestText(v.priority_reason,500,0)||!Array.isArray(v.items)||v.items.length>10||!Array.isArray(v.history)||v.history.length>3||!positive(v.history_page)||!int(v.history_total,1)||!['can_update','can_transfer','can_cancel'].every(k=>typeof v[k]==='boolean'))throw Error('Invalid staff detail');
 return {...staff,portal:false,customer_id:v.customer_id,message:v.message,priority_reason:v.priority_reason,items:v.items.map(item),history:v.history.map(history),history_page:v.history_page,history_total:v.history_total,can_update:v.can_update as boolean,can_transfer:v.can_transfer as boolean,can_cancel:v.can_cancel as boolean,can_reclaim:v.can_reclaim===true,following_only:v.following_only===true,...(v.correction==null?{}:{correction:accountCorrection(v.correction)})};
}
export function requestMutationResult(v:unknown):RequestMutationResult {
 if(record(v)&&v.access_lost===true)return {access_lost:true};
 return requestDetail(v);
}
export function requestOptions(v:unknown):RequestOptions {
 if(!record(v)||!Array.isArray(v.items)||!int(v.total)||!positive(v.page)||!int(v.page_size)||![3,5].includes(v.page_size)||v.items.length>v.page_size)throw Error('Invalid request options');
 const items=v.items.map(x=>{
  if(!record(x)||!uuid(x.id)||!requestText(x.label,200))throw Error('Invalid option');
  if(x.role_code!==undefined&&!['owner','admin','employee'].includes(String(x.role_code)))throw Error('Invalid assignee role');
  if(x.corrections_eligible!==undefined&&typeof x.corrections_eligible!=='boolean')throw Error('Invalid correction eligibility');
  if(x.is_self!==undefined&&typeof x.is_self!=='boolean')throw Error('Invalid self option');
  if(x.eligible!==undefined&&typeof x.eligible!=='boolean')throw Error('Invalid eligibility');
  if(x.definition!==undefined&&!validService(x.definition))throw Error('Invalid service option');
  return {id:x.id,label:x.label,...(x.corrections_eligible===undefined?{}:{corrections_eligible:x.corrections_eligible as boolean}),...(x.is_self===undefined?{}:{is_self:x.is_self as boolean}),...(x.role_code===undefined?{}:{role_code:x.role_code as 'owner'|'admin'|'employee'}),...(x.eligible===undefined?{}:{eligible:x.eligible as boolean}),...(x.definition===undefined?{}:{definition:x.definition})};
 });
 return {items,total:v.total,page:v.page,page_size:v.page_size};
}
