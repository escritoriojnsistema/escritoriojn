import {cashInteger} from './cash.js';
import {validChargeDate} from './charges.js';
export const expensePermissions=['expenses.read','expenses.create','expenses.approve','expenses.pay','cash.transfer','receipts.read','receipts.issue'] as const;
export type Expense={id:string;category:string;payee:string;description:string;due_date:string;amount_cents:number;status:'pending'|'approved'|'paid';version:number;evidence:string;approval_evidence:string|null;payment_evidence:string|null;created_at:string;created_by:string;approved_at:string|null;approved_by:string|null;paid_at:string|null;session_id:string|null;account_id:string|null};
type Command={idempotency_key:string;evidence:string};
export type ExpenseOperation=Command&({kind:'create';category:string;payee:string;description:string;due_date:string;amount_cents:number}|{kind:'approve';expense_id:string;expected_version:number}|{kind:'pay';expense_id:string;expected_version:number;session_id:string;expected_session_version:number;account_id:string});
export type TransferOperation=Command&{kind:'transfer'|'sangria'|'reforco';session_id:string;expected_session_version:number;source_account_id:string;destination_account_id:string;amount_cents:number;reason:string};
export type FinancialTransfer={id:string;kind:TransferOperation['kind'];amount_cents:number;source_account_id:string;destination_account_id:string;source_account_name:string;destination_account_name:string;reason:string;evidence:string;created_at:string;session_id:string};
export type Finance17Page={page:number;page_size:5;total:number;expenses:Expense[];transfers:FinancialTransfer[];transfers_total:number;accounts:{id:string;unit_id:string;name:string;type:'cash'|'bank'|'digital'}[];accounts_total:number;can_create:boolean;can_approve:boolean;can_pay:boolean;can_transfer:boolean;can_issue_receipt:boolean};
export type PaymentReceipt={id:string;number:string;version:1;issued_at:string;payment_id:string;snapshot:{office_name:string;operator_name:string;payer_name:string|null;description:string;payment_reference:string;amount_cents:number;payment_type:'cash'|'pix'|'card'|'transfer';method_name:string;confirmed_at:string;allocations:{protocol:string;amount_cents:number}[]}};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const version=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<2147483646;
export const expenseText=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v===v.trim()&&Array.from(v).length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validExpenseOperation(v:unknown):v is ExpenseOperation{
 if(!object(v)||!uuid(v.idempotency_key)||!expenseText(v.evidence,5,500))return false;
 const base=['kind','idempotency_key','evidence'];
 if(v.kind==='create')return exact(v,[...base,'category','payee','description','due_date','amount_cents'])&&expenseText(v.category,2,120)&&expenseText(v.payee,2,120)&&expenseText(v.description,5,300)&&validChargeDate(v.due_date)&&String(v.due_date)>='1900-01-01'&&cashInteger(v.amount_cents,1);
 if(!uuid(v.expense_id)||!version(v.expected_version))return false;
 if(v.kind==='approve')return exact(v,[...base,'expense_id','expected_version']);
 return v.kind==='pay'&&exact(v,[...base,'expense_id','expected_version','session_id','expected_session_version','account_id'])&&uuid(v.session_id)&&uuid(v.account_id)&&version(v.expected_session_version);
}
export function validTransferOperation(v:unknown):v is TransferOperation{
 return object(v)&&exact(v,['kind','idempotency_key','evidence','session_id','expected_session_version','source_account_id','destination_account_id','amount_cents','reason'])&&['transfer','sangria','reforco'].includes(String(v.kind))&&uuid(v.idempotency_key)&&uuid(v.session_id)&&version(v.expected_session_version)&&uuid(v.source_account_id)&&uuid(v.destination_account_id)&&String(v.source_account_id).toLowerCase()!==String(v.destination_account_id).toLowerCase()&&cashInteger(v.amount_cents,1)&&expenseText(v.reason,5,500)&&expenseText(v.evidence,5,500);
}
