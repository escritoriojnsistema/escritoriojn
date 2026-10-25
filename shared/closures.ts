import {cashInteger} from './cash.js';
import type {FinanceStatement} from './finance.js';
export const closurePermissions=['cash.closure.approve','cash.closure.adjust'] as const;
export type ClosureGroup={key:string;account_id:string;account_name:string;payment_type:'cash'|'pix'|'card'|'transfer';expected_cents:number;received_cents:number;returned_cents:number;fee_cents:number|null;net_cents:number|null;settled_cents:number|null;pending_cents:number|null};
export type ClosureLine=ClosureGroup&{counted_cents:number;difference_cents:number};
export type ClosureReview={decision:'approve'|'reject';reason:string;actor_name:string;created_at:string};
export type ClosureRecord={id:string;session_id:string;source_id:string|null;kind:'reconcile'|'close'|'adjust';version:1|2;created_at:string;actor_name:string;reason:string;groups:ClosureLine[];has_difference:boolean;differences_count:number;absolute_difference_cents:number;review:ClosureReview|null;can_review:boolean};
export type ClosureSource=Pick<ClosureRecord,'id'|'session_id'|'created_at'|'actor_name'|'has_difference'|'absolute_difference_cents'>;
export type ClosureState={session_id:string;session_version:number;status:'open'|'closed';can_record:boolean;can_adjust:boolean;groups:ClosureGroup[];records:ClosureRecord[];total:number;page:number;page_size:5;sources:ClosureSource[];sources_total:number;source_page:number};
export type ClosureCount={key:string;counted_cents:number};
type Command={session_id:string;expected_version:number;idempotency_key:string;reason:string};
export type ClosureOperation=Command&({kind:'reconcile'|'close';counts:ClosureCount[]}|{kind:'adjust';source_id:string;counts:ClosureCount[]}|{kind:'review';record_id:string;expected_record_version:1;decision:'approve'|'reject'});
export type ClosureResult={statement:FinanceStatement;record:ClosureRecord};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const closureKey=(v:unknown):v is string=>typeof v==='string'&&/^(cash|pix|card|transfer):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validClosureOperation(v:unknown):v is ClosureOperation{
 if(!object(v)||!uuid(v.session_id)||!uuid(v.idempotency_key)||!Number.isInteger(v.expected_version)||Number(v.expected_version)<1||Number(v.expected_version)>=2147483646||typeof v.reason!=='string'||v.reason!==v.reason.trim()||Array.from(v.reason).length<5||Array.from(v.reason).length>500||/[\u0000-\u001f\u007f]/.test(v.reason))return false;
 const base=['kind','session_id','expected_version','idempotency_key','reason'];
 if(v.kind==='review')return exact(v,[...base,'record_id','expected_record_version','decision'])&&uuid(v.record_id)&&v.expected_record_version===1&&['approve','reject'].includes(String(v.decision));
 if(!['reconcile','close','adjust'].includes(String(v.kind))||!exact(v,[...base,'counts',...(v.kind==='adjust'?['source_id']:[])])||v.kind==='adjust'&&!uuid(v.source_id)||!Array.isArray(v.counts)||!v.counts.length||v.counts.length>100)return false;
 const keys=new Set<string>();
 return v.counts.every(c=>{if(!object(c)||!exact(c,['key','counted_cents'])||!closureKey(c.key)||!cashInteger(c.counted_cents,c.key.startsWith('cash:')?0:-1e12)||keys.has(c.key))return false;keys.add(c.key);return true;});
}
