import {chargeAmountToCents,chargeInteger,MAX_CHARGE_CENTS} from './charges.js';
export const cashPermissions=['cash.read','cash.open','cash.read_all','cash.manage'] as const;
export const MAX_CASH_CENTS=MAX_CHARGE_CENTS;
export const cashAmountToCents=chargeAmountToCents;
export type CashAccountType='cash'|'bank'|'digital';
export type CashPaymentType='cash'|'pix'|'card'|'transfer';
export type CashUnit={id:string;name:string;active:boolean;version:number};
export type CashAccount=CashUnit&{unit_id:string;type:CashAccountType};
export type CashPaymentMethod=CashUnit&{unit_id:string;type:CashPaymentType;destination_account_id:string};
export type CashConfiguration={units:CashUnit[];accounts:CashAccount[];payment_methods:CashPaymentMethod[];units_total:number;accounts_total:number;payment_methods_total:number;page:number;page_size:number;unit_id:string|null};
export type CashConfigure=({kind:'unit'}|{kind:'account';unit_id:string;type:CashAccountType}|{kind:'payment_method';unit_id:string;type:CashPaymentType;destination_account_id:string})&{id:string|null;expected_version:number|null;name:string;active:boolean};
export type CashConfigurationResult={resource:CashUnit|CashAccount|CashPaymentMethod;configuration:CashConfiguration};
export type CashSession={id:string;unit_id:string;unit_name:string;cash_account_id:string;account_name:string;operator_name:string;is_self:boolean;status:'open'|'closed';opened_at:string;opening_cents:number;numerario_cents:number;received_cents:number};
export type CashDashboard={sessions:CashSession[];total:number;page:number;page_size:number;scope:'own'|'all';can_open:boolean;can_manage:boolean;can_read_all:boolean;summary?:{open:number;closed:number;numerario_cents:number;received_cents:number}};
export type CashOpen={unit_id:string;cash_account_id:string;opening_cents:number;idempotency_key:string};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const cashInteger=chargeInteger;
export function validCashConfigure(v:unknown):v is CashConfigure{if(!object(v)||typeof v.name!=='string'||v.name!==v.name.trim()||v.name.length<2||v.name.length>120||/[\u0000-\u001f\u007f]/.test(v.name)||typeof v.active!=='boolean'||!(v.id===null? v.expected_version===null:uuid(v.id)&&Number.isInteger(v.expected_version)&&Number(v.expected_version)>0&&Number(v.expected_version)<2147483646))return false;const keys=['kind','id','expected_version','name','active'];if(v.kind==='unit')return exact(v,keys);if(!uuid(v.unit_id))return false;if(v.kind==='account')return exact(v,[...keys,'unit_id','type'])&&['cash','bank','digital'].includes(String(v.type));return v.kind==='payment_method'&&exact(v,[...keys,'unit_id','type','destination_account_id'])&&['cash','pix','card','transfer'].includes(String(v.type))&&uuid(v.destination_account_id);}
export function validCashOpen(v:unknown):v is CashOpen{return object(v)&&exact(v,['unit_id','cash_account_id','opening_cents','idempotency_key'])&&uuid(v.unit_id)&&uuid(v.cash_account_id)&&uuid(v.idempotency_key)&&cashInteger(v.opening_cents);}

export type CashFilters={unit_id:string|null;status:'all'|'open'|'closed';query:string};
