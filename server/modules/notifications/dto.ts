import type {AccountNotices,NotificationKind} from '../../../shared/notifications.js';
import {record,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
export function summary(v:unknown):{unread:number}{if(!record(v)||!int(v.unread))throw Error('Invalid summary');return {unread:v.unread};}
export function notices(v:unknown):AccountNotices{
 if(!record(v)||!Array.isArray(v.items)||!int(v.total)||!int(v.unread)||!positive(v.page)||typeof v.page_size!=='number'||![3,5].includes(v.page_size)||v.items.length>v.page_size)throw Error('Invalid inbox');
 return {total:v.total,unread:v.unread,page:v.page,page_size:v.page_size,items:v.items.map(n=>{
  if(!record(n)||!uuid(n.id)||!['handoff','pending','assignee_changed'].includes(String(n.kind))||!time(n.created_at)||!(n.read_at===null||time(n.read_at))||typeof n.can_open!=='boolean'||!(n.request_id===null||uuid(n.request_id))||!(n.protocol===null||requestText(n.protocol,80))||!(n.attendant_name===null||requestText(n.attendant_name,120))||(n.can_open&&(!n.request_id||!n.protocol))||(n.kind==='assignee_changed'?!n.attendant_name:n.attendant_name!==null))throw Error('Invalid notice');
  return {id:n.id,kind:n.kind as NotificationKind,created_at:n.created_at,read_at:n.read_at,can_open:n.can_open,request_id:n.can_open?n.request_id:null,protocol:n.can_open?n.protocol:null,attendant_name:n.kind==='assignee_changed'?n.attendant_name:null};
 })};
}
