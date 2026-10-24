import {cashInteger} from './cash.js';
import {validChargeDate} from './charges.js';
export type PaymentAllocation={charge_id:string;expected_charge_version:number;amount_cents:number};
export type PaymentOperation=({kind:'record';payment_method_id:string;status:'pending'|'confirmed';allocations:PaymentAllocation[];presented_cents:number|null;fee_cents:number;settlement:'not_applicable'|'pending'|'settled';settled_on:string|null;external_reference:string|null}|{kind:'confirm'|'reject';payment_id:string}|{kind:'settle';payment_id:string;settled_on:string})&{session_id:string;expected_version:number;idempotency_key:string;evidence:string};
export type Payment={id:string;reference:string;created_at:string;amount_cents:number;presented_cents:number|null;change_cents:number|null;fee_cents:number|null;net_cents:number|null;payment_type:'cash'|'pix'|'card'|'transfer';method_name:string;account_name:string;legacy:boolean;status:'pending'|'confirmed'|'rejected'|'partially_reversed'|'reversed';settlement:'not_applicable'|'pending'|'settled'|'unknown';settled_on:string|null;evidence:string|null;external_reference:string|null;reversed_cents?:number;refunded_cents?:number;pending_refund_cents?:number;allocations:{id?:string;charge_id:string;protocol:string;amount_cents:number;reversed_cents?:number;refunded_cents?:number;pending_refund_cents?:number}[]};
export type PaymentDestination={account_name:string;payment_type:Payment['payment_type'];received_cents:number;returned_cents:number;fee_cents:number|null;net_cents:number|null;settled_cents:number|null};
export type PaymentsPage={items:Payment[];total:number;page:number;destinations?:PaymentDestination[]};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const version=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<2147483646;
const text=(v:unknown,min:number,max:number)=>typeof v==='string'&&v===v.trim()&&v.length>=min&&v.length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function validPaymentOperation(v:unknown):v is PaymentOperation{
 if(!object(v)||!uuid(v.session_id)||!version(v.expected_version)||!uuid(v.idempotency_key)||!text(v.evidence,5,500))return false;
 const base=['kind','session_id','expected_version','idempotency_key','evidence'];const exact=(keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(v.kind==='confirm'||v.kind==='reject')return exact([...base,'payment_id'])&&uuid(v.payment_id);
 if(v.kind==='settle')return exact([...base,'payment_id','settled_on'])&&uuid(v.payment_id)&&validChargeDate(v.settled_on);
 if(v.kind!=='record'||!exact([...base,'payment_method_id','status','allocations','presented_cents','fee_cents','settlement','settled_on','external_reference'])||!uuid(v.payment_method_id)||!['pending','confirmed'].includes(String(v.status))||!Array.isArray(v.allocations)||v.allocations.length<1||v.allocations.length>10||!cashInteger(v.fee_cents)||!(v.presented_cents===null||cashInteger(v.presented_cents,1))||!['not_applicable','pending','settled'].includes(String(v.settlement))||!(v.settled_on===null||validChargeDate(v.settled_on))||!(v.external_reference===null||text(v.external_reference,1,120)))return false;
 const seen=new Set<string>();let total=0;
 for(const a of v.allocations){if(!object(a)||Object.keys(a).length!==3||!uuid(a.charge_id)||!version(a.expected_charge_version)||!cashInteger(a.amount_cents,1)||seen.has(String(a.charge_id).toLowerCase()))return false;seen.add(String(a.charge_id).toLowerCase());total+=Number(a.amount_cents);}
 return cashInteger(total,1)&&Number(v.fee_cents)<=total&&(v.presented_cents===null||Number(v.presented_cents)>=total)&&(v.settlement==='settled')===(v.settled_on!==null);
}
