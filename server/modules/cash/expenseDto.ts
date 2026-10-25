import type {Expense,Finance17Page,FinancialTransfer,PaymentReceipt} from '../../../shared/expenses.js';
import {expenseText} from '../../../shared/expenses.js';
import {cashInteger} from '../../../shared/cash.js';
import {validChargeDate} from '../../../shared/charges.js';
import {record,uuid} from '../team/validation.js';
import {positive} from '../requests/validation.js';
const invalid=():never=>{throw Error('Invalid expense response');};
const total=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<41&&Number.isFinite(Date.parse(v));
const nullableTime=(v:unknown)=>v===null||time(v);
const nullableId=(v:unknown)=>v===null||uuid(v);
function expense(v:unknown):Expense{
 if(!record(v)||!uuid(v.id)||!expenseText(v.category,2,120)||!expenseText(v.payee,2,120)||!expenseText(v.description,5,300)||!validChargeDate(v.due_date)||!cashInteger(v.amount_cents,1)||!['pending','approved','paid'].includes(String(v.status))||!positive(v.version,2147483646)||!expenseText(v.evidence,5,500)||!(v.approval_evidence===null||expenseText(v.approval_evidence,5,500))||!(v.payment_evidence===null||expenseText(v.payment_evidence,5,500))||!time(v.created_at)||!uuid(v.created_by)||!nullableTime(v.approved_at)||!nullableTime(v.paid_at)||!nullableId(v.approved_by)||!nullableId(v.session_id)||!nullableId(v.account_id))return invalid();
 if((v.status==='pending')!==(v.approved_at===null)||((v.approved_at===null)!==(v.approved_by===null))||((v.approved_at===null)!==(v.approval_evidence===null))||(v.status==='paid')!==(v.paid_at!==null)||(v.status==='paid')!==(v.payment_evidence!==null)||(v.status==='paid')!==(v.session_id!==null)||(v.status==='paid')!==(v.account_id!==null))return invalid();
 return {id:v.id,category:v.category,payee:v.payee,description:v.description,due_date:v.due_date,amount_cents:v.amount_cents,status:v.status as Expense['status'],version:v.version,evidence:v.evidence,approval_evidence:v.approval_evidence,payment_evidence:v.payment_evidence,created_at:v.created_at,created_by:v.created_by,approved_at:v.approved_at as string|null,approved_by:v.approved_by as string|null,paid_at:v.paid_at as string|null,session_id:v.session_id as string|null,account_id:v.account_id as string|null};
}
function transfer(v:unknown):FinancialTransfer{
 if(!record(v)||!uuid(v.id)||!['transfer','sangria','reforco'].includes(String(v.kind))||!cashInteger(v.amount_cents,1)||!uuid(v.source_account_id)||!uuid(v.destination_account_id)||v.source_account_id===v.destination_account_id||!expenseText(v.source_account_name,2,120)||!expenseText(v.destination_account_name,2,120)||!expenseText(v.reason,5,500)||!expenseText(v.evidence,5,500)||!time(v.created_at)||!uuid(v.session_id))return invalid();
 return {id:v.id,kind:v.kind as FinancialTransfer['kind'],amount_cents:v.amount_cents,source_account_id:v.source_account_id,destination_account_id:v.destination_account_id,source_account_name:v.source_account_name,destination_account_name:v.destination_account_name,reason:v.reason,evidence:v.evidence,created_at:v.created_at,session_id:v.session_id};
}
export function expenseResult(v:unknown):{expense:Expense}{if(!record(v))return invalid();return {expense:expense(v.expense)};}
export function transferResult(v:unknown):{transfer:FinancialTransfer}{if(!record(v))return invalid();return {transfer:transfer(v.transfer)};}
export function finance17Page(v:unknown):Finance17Page{
 if(!record(v)||!positive(v.page,100000)||v.page_size!==5||!total(v.total)||!total(v.transfers_total)||!total(v.accounts_total)||!Array.isArray(v.expenses)||v.expenses.length>5||!Array.isArray(v.transfers)||v.transfers.length>5||!Array.isArray(v.accounts)||v.accounts.length>100||['can_create','can_approve','can_pay','can_transfer','can_issue_receipt'].some(k=>typeof v[k]!=='boolean'))return invalid();
 return {page:v.page,page_size:5,total:v.total,transfers_total:v.transfers_total,expenses:v.expenses.map(expense),transfers:v.transfers.map(transfer),accounts_total:v.accounts_total,accounts:v.accounts.map(a=>{if(!record(a)||!uuid(a.id)||!uuid(a.unit_id)||!expenseText(a.name,2,120)||!['cash','bank','digital'].includes(String(a.type)))return invalid();return {id:a.id,unit_id:a.unit_id,name:a.name,type:a.type as 'cash'|'bank'|'digital'};}),can_create:v.can_create as boolean,can_approve:v.can_approve as boolean,can_pay:v.can_pay as boolean,can_transfer:v.can_transfer as boolean,can_issue_receipt:v.can_issue_receipt as boolean};
}
export function receipt(v:unknown):PaymentReceipt{
 if(!record(v)||!uuid(v.id)||!expenseText(v.number,1,100)||v.version!==1||!time(v.issued_at)||!uuid(v.payment_id)||!record(v.snapshot))return invalid();const s=v.snapshot;
 if(!expenseText(s.office_name,1,120)||!expenseText(s.operator_name,1,120)||!(s.payer_name===null||expenseText(s.payer_name,1,160))||!expenseText(s.description,1,500)||s.payment_reference!==`JN-PAG-${v.payment_id}`||!cashInteger(s.amount_cents,1)||!['cash','pix','card','transfer'].includes(String(s.payment_type))||!expenseText(s.method_name,1,120)||!time(s.confirmed_at)||!Array.isArray(s.allocations)||s.allocations.length<1||s.allocations.length>10)return invalid();
 const allocations=s.allocations.map(a=>{if(!record(a)||!expenseText(a.protocol,1,80)||!cashInteger(a.amount_cents,1))return invalid();return {protocol:a.protocol,amount_cents:a.amount_cents};});
 if(allocations.reduce((sum,a)=>sum+a.amount_cents,0)!==s.amount_cents)return invalid();
 return {id:v.id,number:v.number,version:1,issued_at:v.issued_at,payment_id:v.payment_id,snapshot:{office_name:s.office_name,operator_name:s.operator_name,payer_name:s.payer_name,description:s.description,payment_reference:s.payment_reference,amount_cents:s.amount_cents,payment_type:s.payment_type as PaymentReceipt['snapshot']['payment_type'],method_name:s.method_name,confirmed_at:s.confirmed_at,allocations}};
}
