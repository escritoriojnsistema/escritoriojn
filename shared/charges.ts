import type {ServiceAdjustment} from './services.js';
export const chargePermissions=['charges.read','charges.create','charges.adjust','charges.cancel'] as const;
export const MAX_CHARGE_CENTS=1_000_000_000_000;
export type InstallmentInput={due_date:string;amount_cents:number};
export type ChargeMutation={kind:'adjust';delta_cents:number;reason:string;installments:InstallmentInput[]}|{kind:'cancel';reason:string};
export type ChargeItem={request_item_id:string;name:string;quantity:string;unit_price_cents:number;total_cents:number;adjustment:ServiceAdjustment};
export type ChargeInstallment=InstallmentInput&{number:number};
export type ChargeEvent={id:string;kind:'created'|'adjusted'|'cancelled';delta_cents:number;reason:string;actor_name:string|null;created_at:string;version:number};
export type Charge={id:string;version:number;currency:'BRL';status:'aberta'|'cancelada'|'sem_valor';original_cents:number;due_cents:number;allocated_cents:0;balance_cents:number;can_adjust:boolean;can_discount:boolean;can_surcharge:boolean;can_cancel:boolean;installments:ChargeInstallment[];history:ChargeEvent[];history_page:number;history_total:number};
export type ChargeView={request_id:string;protocol:string;closed:boolean;following_only:boolean;can_create:boolean;items:ChargeItem[];charge:Charge|null};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:unknown,keys:string[]):v is Record<string,unknown>=>object(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const chargeInteger=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min&&Number(v)<=MAX_CHARGE_CENTS;
export const validChargeDate=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&v>='0001-01-01'&&Number.isFinite(Date.parse(`${v}T00:00:00Z`))&&new Date(`${v}T00:00:00Z`).toISOString().slice(0,10)===v;
export function validInstallments(v:unknown):v is InstallmentInput[]{return Array.isArray(v)&&v.length>=1&&v.length<=12&&v.every((x,i)=>exact(x,['due_date','amount_cents'])&&validChargeDate(x.due_date)&&chargeInteger(x.amount_cents,v.length===1?0:1)&&(i===0||v[i-1].due_date<x.due_date))&&v.reduce((s,x)=>s+x.amount_cents,0)<=MAX_CHARGE_CENTS;}
export function validChargeMutation(v:unknown):v is ChargeMutation{if(!object(v)||typeof v.reason!=='string'||v.reason.trim().length<5||v.reason.length>500||/[\u0000-\u001f\u007f]/.test(v.reason))return false;return v.kind==='cancel'?exact(v,['kind','reason']):v.kind==='adjust'&&exact(v,['kind','delta_cents','reason','installments'])&&chargeInteger(v.delta_cents,-MAX_CHARGE_CENTS)&&v.delta_cents!==0&&validInstallments(v.installments);}
export function chargeAmountToCents(value:string):number|null{const s=value.trim();if(!/^\d{1,11}([,.]\d{1,2})?$/.test(s))return null;const [whole,fraction='']=s.replace(',','.').split('.');const cents=Number(whole)*100+Number(fraction.padEnd(2,'0'));return chargeInteger(cents)?cents:null;}
