import type {AccountCorrection} from './account.js';
import type { ServiceAdjustment, ServiceInput, ServiceQuote } from './services.js';

export const requestPermissions = ['requests.read','requests.create','requests.update','requests.transfer','requests.cancel','requests.read_all','requests.reclaim'] as const;
export const requestStatuses = ['aberto','em_atendimento','aguardando_cliente','aguardando_responsavel','concluido','cancelado'] as const;
export type RequestStatus = typeof requestStatuses[number];
export const requestStatusLabels: Record<RequestStatus,string> = {aberto:'Aberto',em_atendimento:'Em atendimento',aguardando_cliente:'Aguardando cliente',aguardando_responsavel:'Aguardando responsável',concluido:'Concluído',cancelado:'Cancelado'};
export type PublicRequestStatus = 'recebido'|'em_analise'|'aguardando_cliente'|'concluido'|'cancelado';
export type RequestFilterStatus = RequestStatus|PublicRequestStatus|'';
export const publicRequestStatusLabels: Record<PublicRequestStatus,string> = {recebido:'Recebido para triagem',em_analise:'Em análise',aguardando_cliente:'Aguardando você',concluido:'Concluído',cancelado:'Cancelado'};
export type RequestItemInput = {service_id:string;quantity:number;adjustment:ServiceAdjustment;fields:Record<string,string>;participant_ids:string[];checklist:string[]};
export type StaffRequestInput = {origin:'presencial'|'whatsapp';title:string;customer_id:string|null;assignee_id:string|null;priority:'normal'|'urgent';priority_reason:string;items:RequestItemInput[];internal_note:string};
export type PortalRequestInput = {origin:'portal';title:string;message:string};
export type CreateRequestInput = StaffRequestInput|PortalRequestInput;
export type CancellationReview = {charges_reviewed:true;refunds_reviewed:true;deliveries_reviewed:true;external_reviewed:true};
export type RequestMutation =
 | {kind:'status';status:RequestStatus;reason:string;cancellation_review?:CancellationReview}
 | {kind:'reclaim';reason:string}
 | {kind:'transfer';assignee_id:string;reason:string}
 | {kind:'note';note:string}
 | {kind:'triage';customer_id:string|null;items:RequestItemInput[];reason:string};
export type RequestSummary = {id:string;protocol:string;title:string;public_status:PublicRequestStatus;created_at:string;updated_at:string};
export type StaffRequestSummary = RequestSummary & {status:RequestStatus;origin:'presencial'|'whatsapp'|'portal';priority:'normal'|'urgent';created_by:string;created_by_name?:string|null;assignee_id:string|null;assignee_name:string|null;customer_name:string|null;version:number};
export type RequestPage = {items:(RequestSummary|StaffRequestSummary)[];total:number;page:number;page_size:number;portal:boolean};
export type RequestHistory = {id:string;kind:'created'|'status'|'transfer'|'note'|'triage';actor_id:string;actor_name:string|null;reason:string;from_status:RequestStatus|null;to_status:RequestStatus|null;from_assignee:string|null;to_assignee:string|null;created_at:string};
export type StoredRequestItem = {id:string;snapshot:ServiceQuote;fields:Record<string,string>;participant_ids:string[];checklist:string[]};
export type PortalRequestDetail = RequestSummary & {portal:true;message:string;services:string[];assignee_name:string|null;correction?:AccountCorrection};
export type StaffRequestDetail = StaffRequestSummary & {portal:false;customer_id:string|null;message:string;priority_reason:string;items:StoredRequestItem[];history:RequestHistory[];history_page:number;history_total:number;can_update:boolean;can_transfer:boolean;can_cancel:boolean;can_reclaim:boolean;following_only:boolean;correction?:AccountCorrection};
export type RequestDetail = PortalRequestDetail|StaffRequestDetail;
export type RequestMutationResult = RequestDetail|{access_lost:true};
export type RequestOption = {id:string;label:string;role_code?:'owner'|'admin'|'employee';eligible?:boolean;is_self?:boolean;corrections_eligible?:boolean;definition?:ServiceInput};
export type RequestOptions = {items:RequestOption[];total:number;page:number;page_size:number};
export type RequestOptionKind = 'services'|'customers'|'assignees';
