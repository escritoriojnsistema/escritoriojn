export const retentionClasses=['registration','request','signed_document','financial','tax','audit','optional'] as const;
export type RetentionClass=typeof retentionClasses[number];
export const retentionClassLabels:Record<RetentionClass,string>={registration:'Cadastro',request:'Atendimento',signed_document:'Documento assinado',financial:'Financeiro',tax:'Fiscal',audit:'Auditoria',optional:'Dados opcionais'};
export type RetentionPolicyInput={data_class:RetentionClass;document_type:string;legal_basis:string;justification:string;start_event:'account_closed'|'request_closed'|'verified_event';period_days:number;review_at:string;backup_disposition:string;revision:number;approved:true};
export type RetentionPolicy=RetentionPolicyInput&{approved_by:string;approved_at:string};
export type RetentionItem={id:string;title?:string;user_id:string;target_kind:'file'|'document';target_id:string;data_class:RetentionClass;document_type:string;revision:number;verified_start_at:string|null;verified_start_reason:string|null;deadline:string|null;review_due_at:string;status:'pending_review'|'review_overdue'|'retained'|'due'|'held'|'reserved'|'purged';attempts:number};
export type RetentionCandidate={user_id:string;target_kind:'file'|'document';target_id:string;title:string;review_due_at:string};
export type RetentionHold={id:string;user_id:string;data_class:RetentionClass;reason:string;created_at:string};
export type RetentionState={policies:RetentionPolicy[];items:RetentionItem[];holds:RetentionHold[];candidates:RetentionCandidate[];candidate_total:number;total:number;page:number;scope:'document_and_physical_artifacts'};
export function validRetentionPolicy(v:unknown):v is RetentionPolicyInput{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;const p=v as Record<string,unknown>;
 const keys=['data_class','document_type','legal_basis','justification','start_event','period_days','review_at','backup_disposition','revision','approved'];
 return Object.keys(p).length===keys.length&&keys.every(k=>Object.hasOwn(p,k))&&retentionClasses.includes(p.data_class as RetentionClass)&&['account_closed','request_closed','verified_event'].includes(String(p.start_event))&&['document_type','legal_basis','justification','backup_disposition'].every(k=>typeof p[k]==='string'&&(p[k] as string).trim().length>0&&(p[k] as string).length<=(k==='document_type'?100:2000))&&Number.isInteger(p.period_days)&&Number(p.period_days)>=0&&Number(p.period_days)<=36525&&Number.isInteger(p.revision)&&Number(p.revision)>=0&&p.approved===true&&typeof p.review_at==='string'&&Number.isFinite(Date.parse(p.review_at));
}
