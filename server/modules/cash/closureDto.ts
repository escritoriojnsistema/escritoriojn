import type {ClosureGroup,ClosureLine,ClosureRecord,ClosureResult,ClosureSource,ClosureState} from '../../../shared/closures.js';
import {closureKey} from '../../../shared/closures.js';
import {cashInteger} from '../../../shared/cash.js';
import {record,uuid} from '../team/validation.js';
import {positive} from '../requests/validation.js';
import {storedFinancialText as text} from './text.js';
import {statement} from './financeDto.js';
const integer=(v:unknown,min=-Number.MAX_SAFE_INTEGER):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<41&&Number.isFinite(Date.parse(v));
const bad=():never=>{throw Error('Invalid closure response');};
function group(v:unknown,line:boolean):ClosureGroup|ClosureLine{
 if(!record(v)||!uuid(v.account_id)||!text(v.account_name,1,120)||!closureKey(v.key)||v.key!==`${v.payment_type}:${v.account_id}`||!integer(v.expected_cents)||!integer(v.received_cents,0)||!integer(v.returned_cents,0)||!(v.fee_cents===null||integer(v.fee_cents,0))||!(v.net_cents===null||integer(v.net_cents))||!(v.settled_cents===null||integer(v.settled_cents,0))||!(v.pending_cents===null||integer(v.pending_cents,0))||v.payment_type==='cash'&&Number(v.expected_cents)<0)return bad();
 if((v.fee_cents===null)!==(v.net_cents===null)||v.fee_cents!==null&&v.expected_cents-Number(v.fee_cents)!==v.net_cents)return bad();
 const base:ClosureGroup={key:v.key,account_id:v.account_id,account_name:v.account_name,payment_type:v.payment_type as ClosureGroup['payment_type'],expected_cents:v.expected_cents,received_cents:v.received_cents,returned_cents:v.returned_cents,fee_cents:v.fee_cents as number|null,net_cents:v.net_cents as number|null,settled_cents:v.settled_cents as number|null,pending_cents:v.pending_cents as number|null};
 if(!line)return base;
 if(!cashInteger(v.counted_cents,v.payment_type==='cash'?0:-1e12)||!integer(v.difference_cents)||v.counted_cents-v.expected_cents!==v.difference_cents)return bad();
 return {...base,counted_cents:v.counted_cents,difference_cents:v.difference_cents};
}
function groups(v:unknown,line:false):ClosureGroup[];
function groups(v:unknown,line:true):ClosureLine[];
function groups(v:unknown,line:boolean):(ClosureGroup|ClosureLine)[]{
 if(!Array.isArray(v)||v.length<1||v.length>100)return bad();const result=v.map(x=>group(x,line));if(new Set(result.map(g=>g.key)).size!==result.length)return bad();return result;
}
export function closureRecord(v:unknown):ClosureRecord{
 if(!record(v)||!uuid(v.id)||!uuid(v.session_id)||!(v.source_id===null||uuid(v.source_id))||!['reconcile','close','adjust'].includes(String(v.kind))||(v.kind==='adjust')!==(v.source_id!==null)||![1,2].includes(Number(v.version))||!time(v.created_at)||!text(v.actor_name,1,120)||!text(v.reason,5,500)||typeof v.has_difference!=='boolean'||!integer(v.differences_count,0)||!integer(v.absolute_difference_cents,0)||typeof v.can_review!=='boolean')return bad();
 const lines=groups(v.groups,true),count=lines.filter(g=>g.difference_cents!==0).length,absolute=lines.reduce((n,g)=>n+Math.abs(g.difference_cents),0);
 if(!Number.isSafeInteger(absolute)||v.has_difference!==(count>0)||v.differences_count!==count||v.absolute_difference_cents!==absolute)return bad();
 let review:ClosureRecord['review']=null;
 if(v.review!==null){const r=v.review;if(!record(r)||!['approve','reject'].includes(String(r.decision))||!text(r.reason,5,500)||!text(r.actor_name,1,120)||!time(r.created_at)||!v.has_difference)return bad();review={decision:r.decision as 'approve'|'reject',reason:r.reason,actor_name:r.actor_name,created_at:r.created_at};}
 if(v.version!==(review?2:1)||v.can_review&&(!v.has_difference||review))return bad();
 return {id:v.id,session_id:v.session_id,source_id:v.source_id as string|null,kind:v.kind as ClosureRecord['kind'],version:v.version as 1|2,created_at:v.created_at,actor_name:v.actor_name,reason:v.reason,groups:lines,has_difference:v.has_difference,differences_count:v.differences_count,absolute_difference_cents:v.absolute_difference_cents,review,can_review:v.can_review};
}
function source(v:unknown):ClosureSource{
 if(!record(v)||!uuid(v.id)||!uuid(v.session_id)||!time(v.created_at)||!text(v.actor_name,1,120)||typeof v.has_difference!=='boolean'||!integer(v.absolute_difference_cents,0)||v.has_difference!==(v.absolute_difference_cents>0))return bad();return {id:v.id,session_id:v.session_id,created_at:v.created_at,actor_name:v.actor_name,has_difference:v.has_difference,absolute_difference_cents:v.absolute_difference_cents};
}
export function closureState(v:unknown):ClosureState{
 if(!record(v)||!uuid(v.session_id)||!positive(v.session_version,2147483646)||!['open','closed'].includes(String(v.status))||typeof v.can_record!=='boolean'||typeof v.can_adjust!=='boolean'||(v.can_record||v.can_adjust)&&v.status!=='open'||!Array.isArray(v.records)||v.records.length>5||!integer(v.total,0)||!positive(v.page,100000)||v.page_size!==5||!Array.isArray(v.sources)||v.sources.length>5||!integer(v.sources_total,0)||!positive(v.source_page,100000))return bad();
 const records=v.records.map(closureRecord),sources=v.sources.map(source);if(records.some(r=>r.session_id!==v.session_id)||new Set(records.map(r=>r.id)).size!==records.length||new Set(sources.map(r=>r.id)).size!==sources.length||records.length>v.total||sources.length>v.sources_total)return bad();
 return {session_id:v.session_id,session_version:v.session_version,status:v.status as 'open'|'closed',can_record:v.can_record,can_adjust:v.can_adjust,groups:groups(v.groups,false),records,total:v.total,page:v.page,page_size:5,sources,sources_total:v.sources_total,source_page:v.source_page};
}
export function closureResult(v:unknown):ClosureResult{if(!record(v))return bad();return {statement:statement(v.statement),record:closureRecord(v.record)};}
