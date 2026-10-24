import type {CorrectionSource,CorrectionSources} from '../../../shared/corrections.js';
import {cashInteger} from '../../../shared/cash.js';
import {record,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
const invalid=():never=>{throw Error('Invalid correction response');};
export function correctionSources(v:unknown):CorrectionSources{
 if(!record(v)||!Array.isArray(v.items)||v.items.length>5||!Number.isSafeInteger(v.total)||Number(v.total)<0||!positive(v.page,100000)||v.page_size!==5||!['reverse','refund'].includes(String(v.kind)))return invalid();
 const items=v.items.map(x=>{
  if(!record(x)||['allocation_id','payment_id','original_entry_id','request_id'].some(k=>!uuid(x[k]))||!(x.reversal_id===null||uuid(x.reversal_id))||x.reference!==`JN-PAG-${x.payment_id}`||!requestText(x.protocol,80)||!requestText(x.method_name,120)||!requestText(x.account_name,120)||typeof x.created_at!=='string'||!Number.isFinite(Date.parse(x.created_at))||!['cash','pix','card','transfer'].includes(String(x.payment_type))||typeof x.legacy!=='boolean'||['original_cents','reversed_cents','refunded_cents','pending_refund_cents','available_cents'].some(k=>!cashInteger(x[k]))||!(x.reversal_cents===null||cashInteger(x.reversal_cents,1))||Number(x.reversed_cents)>Number(x.original_cents)||Number(x.refunded_cents)>Number(x.reversed_cents)||Number(x.reversed_cents)-Number(x.refunded_cents)!==x.pending_refund_cents||Number(x.available_cents)<=0)return invalid();
  if(v.kind==='reverse'&&(x.reversal_id!==null||x.reversal_cents!==null||Number(x.original_cents)-Number(x.reversed_cents)!==x.available_cents)||v.kind==='refund'&&(!x.reversal_id||x.reversal_cents===null||Number(x.available_cents)>Number(x.reversal_cents)))return invalid();
  return {allocation_id:x.allocation_id,reversal_id:x.reversal_id,payment_id:x.payment_id,reference:x.reference,original_entry_id:x.original_entry_id,request_id:x.request_id,protocol:x.protocol,created_at:x.created_at,payment_type:x.payment_type,method_name:x.method_name,account_name:x.account_name,original_cents:x.original_cents,reversed_cents:x.reversed_cents,refunded_cents:x.refunded_cents,pending_refund_cents:x.pending_refund_cents,available_cents:x.available_cents,reversal_cents:x.reversal_cents,legacy:x.legacy} as CorrectionSource;
 });return {items,total:v.total as number,page:v.page,page_size:5,kind:v.kind as CorrectionSources['kind']};
}
