import {cashInteger} from './cash.js';
export type CorrectionKind='reverse'|'refund';
export type CorrectionOperation=({kind:'reverse';allocation_id:string;refund_now:boolean}|{kind:'refund';reversal_id:string})&{session_id:string;expected_version:number;idempotency_key:string;amount_cents:number;reason:string;evidence:string};
export type CorrectionSource={allocation_id:string;reversal_id:string|null;payment_id:string;reference:string;original_entry_id:string;request_id:string;protocol:string;created_at:string;payment_type:'cash'|'pix'|'card'|'transfer';method_name:string;account_name:string;original_cents:number;reversed_cents:number;refunded_cents:number;pending_refund_cents:number;available_cents:number;reversal_cents:number|null;legacy:boolean};
export type CorrectionSources={items:CorrectionSource[];total:number;page:number;page_size:5;kind:CorrectionKind};
export type FinancialCondition={settlement_required:boolean;blocked:boolean};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const text=(v:unknown)=>typeof v==='string'&&v===v.trim()&&v.length>=5&&v.length<=500&&!/[\u0000-\u001f\u007f]/.test(v);
export function validCorrectionOperation(v:unknown):v is CorrectionOperation{
 if(!object(v)||!uuid(v.session_id)||!Number.isInteger(v.expected_version)||Number(v.expected_version)<1||Number(v.expected_version)>2147483645||!uuid(v.idempotency_key)||!cashInteger(v.amount_cents,1)||!text(v.reason)||!text(v.evidence))return false;
 const keys=['kind','session_id','expected_version','idempotency_key','amount_cents','reason','evidence'];
 if(v.kind==='reverse'){keys.push('allocation_id','refund_now');if(!uuid(v.allocation_id)||typeof v.refund_now!=='boolean')return false;}
 else if(v.kind==='refund'){keys.push('reversal_id');if(!uuid(v.reversal_id))return false;}else return false;
 return Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
}
