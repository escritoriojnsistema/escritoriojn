import {cashInteger} from './cash.js';
import {validChargeDate} from './charges.js';
import {validAdjustment,type ServiceAdjustment,type ServiceSummary} from './services.js';
import type {FinanceStatement} from './finance.js';
export const finance19Permissions=['quick.perform','finance.reports.read','finance.reports.read_all','finance.reports.export','finance.reports.manage'] as const;
export const quickRequiredPermissions=['quick.perform','services.read','services.perform','requests.read','requests.create','requests.update','charges.read','charges.create','cash.read','cash.open'] as const;
export type QuickOperation={session_id:string;expected_session_version:number;service_id:string;expected_service_version:number;quantity:number;adjustment:ServiceAdjustment;quoted_total_cents:number;payment_method_id:string|null;presented_cents:number|null;fee_cents:number;settlement:'not_applicable'|'pending'|'settled';settled_on:string|null;external_reference:string|null;evidence:string;idempotency_key:string};
export type QuickSession={id:string;unit_id:string;unit_name:string;version:number;cash_cents:number};
export type QuickMethod={id:string;name:string;type:'cash'|'pix'|'card'|'transfer';account_name:string};
export type QuickContext={enabled:true;services:ServiceSummary[];services_total:number;page:number;page_size:5;sessions:QuickSession[];sessions_total:number;session_page:number;selected_session:QuickSession|null;methods:QuickMethod[];methods_total:number;method_page:number};
export type QuickResult={id:string;request_id:string;protocol:string;charge_id:string;payment_id:string|null;total_cents:number;completed_at:string;statement:FinanceStatement};
export const reportViews=['obligations','movements','cash'] as const;
export type ReportView=typeof reportViews[number];
export type ReportFilters={view:ReportView;scope:'own'|'all';from_date:string;until_date:string;unit_id:string|null;operator_id:string|null;service_id:string|null;payment_type:'all'|'cash'|'pix'|'card'|'transfer';account_id:string|null;status:string;customer_id:string|null};
export type ReportSettings={timezone:string;version:number;configured:boolean;can_manage:boolean};
export type ReportContext={enabled:true;settings:ReportSettings;can_read_all:boolean;can_export:boolean};
export type ReportOptionKind='units'|'operators'|'accounts'|'services'|'customers';
export type ReportOptions={kind:ReportOptionKind;items:{id:string;label:string}[];total:number;page:number;page_size:5};
export const reportSummaryKeys=['contracted_cents','allocated_cents','received_cents','balance_cents','expense_cents','reversed_cents','refund_cents','fee_cents','cash_expected_cents','cash_counted_cents','divergence_count','unknown_fee_count'] as const;
export type ReportSummary=Record<typeof reportSummaryKeys[number],number|null>&{unknown_fee_count:number};
export type ReportRow={id:string;kind:'obligation'|'received'|'reversal'|'refund'|'expense'|'fee'|'transfer_in'|'transfer_out'|'cash';occurred_at:string;reference:string;description:string;operator_name:string;unit_name:string|null;method_name:string|null;account_name:string|null;customer_label:'Cliente vinculado'|'Sem cadastro'|null;status:string;amount_cents:number|null;paid_cents:number|null;balance_cents:number|null;expected_cents:number|null;counted_cents:number|null;difference_cents:number|null};
export type ReportPage={filters:ReportFilters;timezone:string;from_utc:string;until_utc:string;generated_at:string;summary:ReportSummary;items:ReportRow[];total:number;page:number;page_size:5};
export type ReportSnapshot={id:string;protocol:string;contract_version:1;created_at:string;office_name:string;operator_name:string;timezone:string;from_utc:string;until_utc:string;filters:ReportFilters;summary:ReportSummary;total:number};
export type ReportChunk={items:ReportRow[];offset:number;total:number};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:readonly string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
const version=(v:unknown)=>Number.isInteger(v)&&Number(v)>0&&Number(v)<2147483646;
export const finance19Text=(v:unknown,min:number,max:number):v is string=>typeof v==='string'&&v===v.trim()&&Array.from(v).length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export const validReportTimezone=(v:unknown):v is string=>typeof v==='string'&&v.length<=100&&/^[A-Za-z0-9_+-]+(?:\/[A-Za-z0-9_+-]+){0,2}$/.test(v);
export function validQuickOperation(v:unknown):v is QuickOperation{
 if(!object(v)||!exact(v,['session_id','expected_session_version','service_id','expected_service_version','quantity','adjustment','quoted_total_cents','payment_method_id','presented_cents','fee_cents','settlement','settled_on','external_reference','evidence','idempotency_key'])||!uuid(v.session_id)||!uuid(v.service_id)||!uuid(v.idempotency_key)||!version(v.expected_session_version)||!version(v.expected_service_version)||!Number.isInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>100000||!validAdjustment(v.adjustment)||!cashInteger(v.quoted_total_cents)||!(v.payment_method_id===null||uuid(v.payment_method_id))||!(v.presented_cents===null||cashInteger(v.presented_cents))||!cashInteger(v.fee_cents)||!['not_applicable','pending','settled'].includes(String(v.settlement))||!(v.settled_on===null||validChargeDate(v.settled_on))||!(v.external_reference===null||finance19Text(v.external_reference,1,120))||!finance19Text(v.evidence,5,500))return false;
 if(v.quoted_total_cents===0)return v.payment_method_id===null&&v.presented_cents===null&&v.fee_cents===0&&v.settlement==='not_applicable'&&v.settled_on===null&&v.external_reference===null;
 return uuid(v.payment_method_id)&&v.fee_cents<=v.quoted_total_cents&&(v.presented_cents===null||v.presented_cents>=v.quoted_total_cents)&&(v.settlement==='settled')===(v.settled_on!==null);
}
export function validReportFilters(v:unknown):v is ReportFilters{
 if(!object(v)||!exact(v,['view','scope','from_date','until_date','unit_id','operator_id','service_id','payment_type','account_id','status','customer_id'])||!(reportViews as readonly unknown[]).includes(v.view)||!['own','all'].includes(String(v.scope))||!validChargeDate(v.from_date)||!validChargeDate(v.until_date)||!['unit_id','operator_id','service_id','account_id','customer_id'].every(k=>v[k]===null||uuid(v[k]))||!['all','cash','pix','card','transfer'].includes(String(v.payment_type)))return false;
 const days=(Date.parse(v.until_date+'T00:00:00Z')-Date.parse(v.from_date+'T00:00:00Z'))/86400000;if(days<1||days>366)return false;
 if(v.view==='obligations')return v.unit_id===null&&v.account_id===null&&v.payment_type==='all'&&['all','open','paid','cancelled','zero'].includes(String(v.status));
 if(v.view==='cash')return v.service_id===null&&v.customer_id===null&&v.payment_type==='all'&&['all','open','closed'].includes(String(v.status));
 return ['all','confirmed'].includes(String(v.status));
}
export const reportViewNames:Record<ReportView,string>={obligations:'Contratações e saldos',movements:'Movimentos financeiros',cash:'Caixas e conferências'};
export const reportCriteria:Record<ReportView,string>={obligations:'Cobranças criadas no período; valores e saldo até o fim exclusivo. Serviço seleciona a cobrança integral, sem rateio de itens.',movements:'Data de cada evento. Recebimento bruto, estorno lógico, devolução efetiva, despesa paga, taxa e transferência separados. Taxas não são rateadas por serviço ou cliente.',cash:'Caixas abertos no período; posição e fechamento original até o fim exclusivo. Numerário por sessão não é receita nem saldo bancário.'};
export const reportKindNames:Record<ReportRow['kind'],string>={obligation:'Contratação',received:'Recebimento bruto',reversal:'Estorno lógico',refund:'Devolução efetiva',expense:'Despesa paga',fee:'Taxa de cartão',transfer_in:'Transferência · entrada',transfer_out:'Transferência · saída',cash:'Caixa'};
export const reportSummaryNames:Record<typeof reportSummaryKeys[number],string>={contracted_cents:'Contratado líquido',allocated_cents:'Alocado líquido',received_cents:'Recebido bruto',balance_cents:'Saldo devido',expense_cents:'Despesas pagas',reversed_cents:'Estornos lógicos',refund_cents:'Devoluções efetivas',fee_cents:'Taxas de cartão',cash_expected_cents:'Espécie esperada',cash_counted_cents:'Espécie contada',divergence_count:'Caixas com diferença',unknown_fee_count:'Taxas não informadas'};
// Format safe integer cents exactly, including aggregates beyond floating decimal precision.
export function reportMoney(value:number|null):string{
 if(value===null)return 'Não informado';if(!Number.isSafeInteger(value))throw Error('Invalid money');
 const cents=BigInt(value),absolute=cents<0n?-cents:cents;
 return `${cents<0n?'-':''}R$ ${(absolute/100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${(absolute%100n).toString().padStart(2,'0')}`;
}
