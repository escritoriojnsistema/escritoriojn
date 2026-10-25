import {paymentsPage} from './paymentDto.js';
import type {ClientFinance,FinanceCharge,FinanceCharges,FinanceEntry,FinanceSession,FinanceStatement} from '../../../shared/finance.js';
import {cashInteger} from '../../../shared/cash.js';
import {validChargeDate} from '../../../shared/charges.js';
import {record,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
const total=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
const invalid=():never=>{throw Error('Invalid financial response');};
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<41&&Number.isFinite(Date.parse(v));
// PostgreSQL char_length counts Unicode codepoints, rather than UTF-16 units.
const entryReason=(v:unknown):v is string=>{
 if(!requestText(v,1000,5))return false;
 const length=Array.from(v).length;return length>=5&&length<=500;
};
function entry(v:unknown,client:boolean):FinanceEntry|ClientFinance['history'][number]{
 if(!record(v)||!uuid(v.id)||!['expense_paid','transfer_out','transfer_in','received','refunded','reversed','reconciled','closed','allocation_reversed','refund_paid'].includes(String(v.kind))||!time(v.created_at)||!cashInteger(v.amount_cents)||!(v.request_id===null||uuid(v.request_id))||!(v.charge_id===null||uuid(v.charge_id))||!(v.protocol===null||requestText(v.protocol,80))||!(v.payment_method_name===null||requestText(v.payment_method_name,120)))return invalid();
 const base={id:v.id,kind:v.kind as FinanceEntry['kind'],created_at:v.created_at,amount_cents:v.amount_cents,request_id:v.request_id,charge_id:v.charge_id,protocol:v.protocol,payment_method_name:v.payment_method_name};
 if(client){if(!['received','refunded','reversed','allocation_reversed','refund_paid'].includes(base.kind)||!base.request_id||!base.charge_id||!base.protocol)return invalid();return base;}
 if(!cashInteger(v.cash_cents,-1e12)||!cashInteger(v.applied_cents,-1e12)||!entryReason(v.reason)||!(v.account_name===null||requestText(v.account_name,120))||!(v.original_entry_id===null||uuid(v.original_entry_id))||!cashInteger(v.refundable_cents)||!(v.counted_cents===null||cashInteger(v.counted_cents))||!(v.expected_cents===null||cashInteger(v.expected_cents)))return invalid();
 return {...base,cash_cents:v.cash_cents,applied_cents:v.applied_cents,reason:v.reason,account_name:v.account_name,original_entry_id:v.original_entry_id,refundable_cents:v.refundable_cents,counted_cents:v.counted_cents,expected_cents:v.expected_cents};
}
export function statement(v:unknown):FinanceStatement{
 if(!record(v)||!record(v.session)||!Array.isArray(v.entries)||v.entries.length>5||!total(v.total)||!positive(v.page,100000)||v.page_size!==5||typeof v.can_receive!=='boolean')return invalid();const s=v.session;
 if((s.cash_account_id!==undefined&&!uuid(s.cash_account_id))||!uuid(s.id)||!uuid(s.unit_id)||!requestText(s.unit_name,120)||!requestText(s.operator_name,120)||!positive(s.version,2147483646)||!['open','closed'].includes(String(s.status))||!time(s.opened_at)||!(s.closed_at===null||time(s.closed_at))||!cashInteger(s.opening_cents)||!cashInteger(s.cash_cents)||!total(s.received_cents)||!total(s.refunded_cents)||!total(s.digital_cents,-Number.MAX_SAFE_INTEGER)||['is_self','can_operate','can_refund'].some(k=>typeof s[k]!=='boolean')||(!s.is_self&&(s.can_operate||s.can_refund||v.can_receive)))return invalid();
 const session:FinanceSession={...(typeof s.cash_account_id==='string'?{cash_account_id:s.cash_account_id}:{}),id:s.id,unit_id:s.unit_id,unit_name:s.unit_name,operator_name:s.operator_name,is_self:s.is_self as boolean,status:s.status as FinanceSession['status'],version:s.version,opened_at:s.opened_at,closed_at:s.closed_at,opening_cents:s.opening_cents as number,cash_cents:s.cash_cents as number,received_cents:s.received_cents as number,refunded_cents:s.refunded_cents as number,digital_cents:s.digital_cents,can_operate:s.can_operate as boolean,can_refund:s.can_refund as boolean};
 return {session,entries:v.entries.map(e=>entry(e,false) as FinanceEntry),total:v.total,page:v.page,page_size:5,can_receive:v.can_receive,...(v.payments===undefined?{}:{payments:paymentsPage(v.payments)})};
}
function charge(v:unknown):FinanceCharge{
 if(!record(v)||!uuid(v.id)||!uuid(v.request_id)||!requestText(v.protocol,80)||!positive(v.version,2147483646)||!['open','paid','cancelled','zero'].includes(String(v.status))||['due_cents','paid_cents','balance_cents'].some(k=>!cashInteger(v[k]))||Number(v.due_cents)-Number(v.paid_cents)!==v.balance_cents||!Array.isArray(v.services)||v.services.length>10||v.services.some(x=>!requestText(x,120))||!Array.isArray(v.installments)||v.installments.length>12)return invalid();
 if(v.financial_condition!==undefined&&(!record(v.financial_condition)||typeof v.financial_condition.settlement_required!=='boolean'||typeof v.financial_condition.blocked!=='boolean'||v.financial_condition.blocked&&(!v.financial_condition.settlement_required||Number(v.balance_cents)<=0||v.status==='cancelled')))return invalid();
 if(v.pending_refund_cents!==undefined&&!total(v.pending_refund_cents))return invalid();
 return {...(v.financial_condition===undefined?{}:{financial_condition:v.financial_condition as FinanceCharge['financial_condition']}),...(v.pending_refund_cents===undefined?{}:{pending_refund_cents:v.pending_refund_cents as number}),id:v.id,request_id:v.request_id,protocol:v.protocol,version:v.version,due_cents:v.due_cents as number,paid_cents:v.paid_cents as number,balance_cents:v.balance_cents as number,status:v.status as FinanceCharge['status'],services:v.services as string[],installments:v.installments.map((x,i)=>{if(!record(x)||x.number!==i+1||!validChargeDate(x.due_date)||!cashInteger(x.amount_cents))return invalid();return {number:x.number as number,due_date:x.due_date,amount_cents:x.amount_cents};})};
}
export function financialCharges(v:unknown):FinanceCharges{
 if(!record(v)||!Array.isArray(v.items)||v.items.length>5||!total(v.total)||!positive(v.page,100000)||v.page_size!==5||!record(v.summary)||['due_cents','paid_cents','balance_cents'].some(k=>!Number.isSafeInteger(v.summary && (v.summary as Record<string,unknown>)[k])||Number((v.summary as Record<string,unknown>)[k])<0)||Number(v.summary.due_cents)-Number(v.summary.paid_cents)!==v.summary.balance_cents)return invalid();
 return {items:v.items.map(charge),total:v.total,page:v.page,page_size:5,summary:{due_cents:v.summary.due_cents as number,paid_cents:v.summary.paid_cents as number,balance_cents:v.summary.balance_cents as number}};
}
export function clientFinance(v:unknown):ClientFinance{
 const base=financialCharges(v);if(!record(v)||!Array.isArray(v.history)||v.history.length>5||!total(v.history_total)||!positive(v.history_page,100000))return invalid();return {...base,history:v.history.map(e=>entry(e,true) as ClientFinance['history'][number]),history_total:v.history_total,history_page:v.history_page};
}
