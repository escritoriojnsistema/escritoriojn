import type {ChecklistDefinition,ChecklistEntry,ChecklistHistory,ChecklistInstance,ChecklistModel,ChecklistNotices,ChecklistView} from '../../../shared/checklists.js';
import {checklistStates,validChecklistDefinition} from '../../../shared/checklists.js';
import {record,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
const int=(x:unknown)=>Number.isSafeInteger(x)&&Number(x)>=0;
const time=(x:unknown):x is string=>typeof x==='string'&&x.length<=40&&Number.isFinite(Date.parse(x));
const nullableId=(x:unknown):x is string|null=>x===null||uuid(x);
const name=(x:unknown):x is string|null=>x===null||requestText(x,120);
const status=(x:unknown)=>typeof x==='string'&&(checklistStates as readonly string[]).includes(x);
function definition(x:unknown):ChecklistDefinition{if(!validChecklistDefinition(x))throw Error('Invalid model');return {name:x.name,items:x.items.map(i=>({key:i.key,label:i.label,requirement:i.requirement,condition:i.condition?{field:i.condition.field,equals:i.condition.equals}:null}))};}
export function model(x:unknown):ChecklistModel{
 if(!record(x)||!uuid(x.service_id)||!int(x.version)||!Array.isArray(x.history)||x.history.length>5)throw Error('Invalid model');
 return {service_id:x.service_id,version:x.version as number,definition:x.definition===null?null:definition(x.definition),history:x.history.map(h=>{if(!record(h)||!positive(h.version)||!requestText(h.name,80)||!requestText(h.reason,500)||!name(h.actor_name)||!time(h.created_at))throw Error('Invalid history');return {version:h.version,name:h.name,reason:h.reason,actor_name:h.actor_name,created_at:h.created_at};})};
}
function entry(x:unknown):ChecklistEntry{
 if(!record(x)||!uuid(x.id)||!validChecklistDefinition({name:'Checklist',items:[{key:x.key,label:x.label,requirement:x.requirement,condition:x.condition}]})||typeof x.applicable!=='boolean'||!status(x.status)||!nullableId(x.file_id)||!positive(x.version)||!requestText(x.reason,500)||!name(x.actor_name)||!time(x.updated_at)||!(x.file_status===null||['quarentena','disponivel','rejeitado','removido','aguardando_upload'].includes(String(x.file_status))))throw Error('Invalid entry');
 return {id:x.id,key:x.key as string,label:x.label as string,requirement:x.requirement as ChecklistEntry['requirement'],condition:x.condition as ChecklistEntry['condition'],applicable:x.applicable,status:x.status as ChecklistEntry['status'],file_id:x.file_id,version:x.version,reason:x.reason,actor_name:x.actor_name,updated_at:x.updated_at,file_status:x.file_status as string|null};
}
function history(x:unknown):ChecklistHistory{if(!record(x)||!uuid(x.id)||!uuid(x.entry_id)||!status(x.status)||!requestText(x.reason,500)||!name(x.actor_name)||!time(x.created_at)||!nullableId(x.file_id))throw Error('Invalid history');return {id:x.id,entry_id:x.entry_id,status:x.status as ChecklistHistory['status'],reason:x.reason,actor_name:x.actor_name,created_at:x.created_at,file_id:x.file_id};}
function instance(x:unknown):ChecklistInstance{
 if(!record(x)||!uuid(x.id)||!requestText(x.source,80)||!requestText(x.name,80)||!Array.isArray(x.entries)||x.entries.length>12||!Array.isArray(x.history)||x.history.length>5||!int(x.pending)||!int(x.received)||typeof x.can_update!=='boolean'||typeof x.can_waive!=='boolean')throw Error('Invalid checklist');
 return {id:x.id,source:x.source,name:x.name,entries:x.entries.map(entry),history:x.history.map(history),pending:x.pending as number,received:x.received as number,can_update:x.can_update,can_waive:x.can_waive};
}
export function view(x:unknown):ChecklistView{
 if(!record(x)||!uuid(x.request_id)||!positive(x.request_version)||!requestText(x.protocol,80)||typeof x.closed!=='boolean'||(x.following_only!==undefined&&typeof x.following_only!=='boolean')||!nullableId(x.assignee_id)||typeof x.can_transfer!=='boolean'||!Array.isArray(x.items)||x.items.length>10||!nullableId(x.selected_item_id))throw Error('Invalid view');
 return {request_id:x.request_id,request_version:x.request_version,protocol:x.protocol,closed:x.closed,following_only:x.following_only===true,assignee_id:x.assignee_id,can_transfer:x.can_transfer,selected_item_id:x.selected_item_id,items:x.items.map(i=>{if(!record(i)||!uuid(i.id)||!uuid(i.service_id)||!requestText(i.name,120))throw Error('Invalid item');return {id:i.id,service_id:i.service_id,name:i.name};}),instance:x.instance===null?null:instance(x.instance)};
}
export function notices(x:unknown):ChecklistNotices{
 if(!record(x)||!Array.isArray(x.items)||!int(x.total)||!int(x.unread)||!positive(x.page)||![3,5].includes(Number(x.page_size))||x.items.length>Number(x.page_size))throw Error('Invalid notices');
 return {total:x.total as number,unread:x.unread as number,page:x.page,page_size:x.page_size as number,items:x.items.map(n=>{if(!record(n)||!uuid(n.id)||!['handoff','pending'].includes(String(n.kind))||!time(n.created_at)||!(n.read_at===null||time(n.read_at))||!nullableId(n.request_id)||!(n.protocol===null||requestText(n.protocol,80))||typeof n.can_open!=='boolean'||(n.can_open&&(!n.request_id||!n.protocol)))throw Error('Invalid notice');return {id:n.id,kind:n.kind as 'handoff'|'pending',created_at:n.created_at,read_at:n.read_at,request_id:n.can_open?n.request_id:null,protocol:n.can_open?n.protocol:null,can_open:n.can_open};})};
}
export function acknowledged(x:unknown):{ok:true}{if(!record(x)||x.ok!==true)throw Error('Invalid acknowledgement');return {ok:true};}
