import type {PaymentsPage} from './payments.js';
import type {FinancialCondition} from './corrections.js';
import {cashInteger} from './cash.js';
export type FinanceKind='expense_paid'|'transfer_out'|'transfer_in'|'received'|'refunded'|'reversed'|'reconciled'|'closed'|'allocation_reversed'|'refund_paid';
export type FinanceEntry={id:string;kind:FinanceKind;created_at:string;amount_cents:number;cash_cents:number;applied_cents:number;protocol:string|null;request_id:string|null;charge_id:string|null;payment_method_name:string|null;account_name:string|null;reason:string;original_entry_id:string|null;refundable_cents:number;counted_cents:number|null;expected_cents:number|null};
export type FinanceSession={id:string;cash_account_id?:string;unit_id:string;unit_name:string;operator_name:string;is_self:boolean;status:'open'|'closed';version:number;opened_at:string;closed_at:string|null;opening_cents:number;cash_cents:number;received_cents:number;refunded_cents:number;digital_cents:number;can_operate:boolean;can_refund:boolean};
export type FinanceStatement={session:FinanceSession;entries:FinanceEntry[];total:number;page:number;page_size:5;can_receive:boolean;payments?:PaymentsPage};
export type FinanceOperation=({kind:'receive';charge_id:string;expected_charge_version:number;payment_method_id:string;amount_cents:number}|{kind:'refund'|'reverse';entry_id:string;amount_cents:number;reason:string}|{kind:'reconcile'|'close';counted_cents:number;reason:string})&{session_id:string;expected_version:number;idempotency_key:string};
export type FinanceCharge={id:string;request_id:string;protocol:string;version:number;due_cents:number;paid_cents:number;balance_cents:number;status:'open'|'paid'|'cancelled'|'zero';installments:{number:number;due_date:string;amount_cents:number}[];services:string[];financial_condition?:FinancialCondition;pending_refund_cents?:number};
export type FinanceCharges={items:FinanceCharge[];total:number;page:number;page_size:5;summary:{due_cents:number;paid_cents:number;balance_cents:number}};
export type ClientFinance=FinanceCharges&{history:Omit<FinanceEntry,'reason'|'account_name'|'cash_cents'|'applied_cents'|'original_entry_id'|'refundable_cents'|'counted_cents'|'expected_cents'>[];history_total:number;history_page:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const version=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<2147483646;
const reason=(v:unknown)=>typeof v==='string'&&v===v.trim()&&v.length>=5&&v.length<=500&&!/[\u0000-\u001f\u007f]/.test(v);
export function validFinanceOperation(v:unknown):v is FinanceOperation{
 if(!object(v)||!uuid(v.session_id)||!version(v.expected_version)||!uuid(v.idempotency_key))return false;
 const base=['kind','session_id','expected_version','idempotency_key'];
 const exact=(keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
 if(v.kind==='receive')return exact([...base,'charge_id','expected_charge_version','payment_method_id','amount_cents'])&&uuid(v.charge_id)&&uuid(v.payment_method_id)&&version(v.expected_charge_version)&&cashInteger(v.amount_cents,1);
 if(v.kind==='refund'||v.kind==='reverse')return exact([...base,'entry_id','amount_cents','reason'])&&uuid(v.entry_id)&&cashInteger(v.amount_cents,1)&&reason(v.reason);
 return (v.kind==='reconcile'||v.kind==='close')&&exact([...base,'counted_cents','reason'])&&cashInteger(v.counted_cents)&&reason(v.reason);
}
