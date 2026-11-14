export type OperationsPolicy={responsible:string;currency:'USD'|'BRL';budget_cents:number|null;database_quota_bytes:number|null;storage_quota_bytes:number|null;transfer_quota_bytes:number|null;email_quota_count:number|null;execution_quota_count:number|null;recipient_public_key:string;external_folder_id:string;rpo_hours:number;rto_hours:number;daily_copies:number;weekly_copies:number;documents_per_month:number|null;average_document_bytes:number|null;retention_months:number;version_copies:number};
export const defaultOperationsPolicy:OperationsPolicy={responsible:'',currency:'USD',budget_cents:null,database_quota_bytes:null,storage_quota_bytes:null,transfer_quota_bytes:null,email_quota_count:null,execution_quota_count:null,recipient_public_key:'',external_folder_id:'',rpo_hours:24,rto_hours:8,daily_copies:7,weekly_copies:4,documents_per_month:null,average_document_bytes:null,retention_months:12,version_copies:2};
const nullable=['budget_cents','database_quota_bytes','storage_quota_bytes','transfer_quota_bytes','email_quota_count','execution_quota_count','documents_per_month','average_document_bytes'] as const;
const bounded={rpo_hours:720,rto_hours:168,daily_copies:90,weekly_copies:52,retention_months:120,version_copies:100} as const;
export function validOperationsPolicy(value:unknown):value is OperationsPolicy{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 if(Object.keys(v).sort().join()!==Object.keys(defaultOperationsPolicy).sort().join())return false;
 if(typeof v.responsible!=='string'||v.responsible!==v.responsible.trim()||Array.from(v.responsible).length>120||/[\x00-\x1f\x7f]/.test(v.responsible)||(v.currency!=='USD'&&v.currency!=='BRL'))return false;
 if(typeof v.external_folder_id!=='string'||v.external_folder_id!==''&&!/^[A-Za-z0-9_-]{10,200}$/.test(v.external_folder_id))return false;
 if(typeof v.recipient_public_key!=='string'||v.recipient_public_key!==''&&!/^-----BEGIN PUBLIC KEY-----\n[A-Za-z0-9+/=\n]{64,8000}\n-----END PUBLIC KEY-----\n?$/.test(v.recipient_public_key))return false;
 return nullable.every(k=>v[k]===null||Number.isSafeInteger(v[k])&&Number(v[k])>=0&&Number(v[k])<=9_000_000_000_000)&&Object.entries(bounded).every(([k,max])=>Number.isSafeInteger(v[k])&&Number(v[k])>=1&&Number(v[k])<=max);
}
export function quotaStatus(used:number|null,limit:number|null,fresh=true):{level:'unknown'|'ok'|'warning'|'critical'|'exceeded';percent:number|null}{
 if(!fresh||used===null||limit===null||!Number.isFinite(used)||!Number.isFinite(limit)||used<0||limit<0)return{level:'unknown',percent:null};
 if(limit===0)return{level:used>0?'exceeded':'ok',percent:used>0?null:0};
 const percent=used/limit*100;return{level:percent>=100?'exceeded':percent>=85?'critical':percent>=70?'warning':'ok',percent};
}
export function growthEstimate(documents:number|null,bytes:number|null,months:number,versions:number){
 if(documents===null||bytes===null||![documents,bytes,months,versions].every(n=>Number.isSafeInteger(n)&&n>=0))return null;
 const retained_bytes=documents*bytes*months*versions;return Number.isSafeInteger(retained_bytes)?{retained_bytes}:null;
}
export type OperationsState={revision:number;policy:OperationsPolicy|null;observed_at:string;usage:{customers:number;requests:number;files:number;declared_file_bytes:number};production_backup_verified:false;provider_usage:null};
