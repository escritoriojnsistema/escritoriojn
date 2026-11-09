import {documentObject as object,documentUuid as uuid} from './documents.js';
export type DitrRequestOption = {id:string;protocol:string;taxpayer_id:string;taxpayer_name:string};
export type DitrService = {charge_id:string;total_cents:number;paid_cents:number;balance_cents:number};
export type DitrCase = {id:string;property_id:string;exercise:number;taxpayer_id:string;taxpayer_name:string;request_id:string;internal_protocol:string;responsible_name:string;modality:'original'|'rectifying';previous_case_id:string|null;root_case_id:string;revision:number;version:number;created_at:string;can_work:boolean;service:DitrService|null};
export type DitrEvidence = {id:string;case_id:string;kind:'receipt'|'tax_guide'|'tax_payment';file_id:string;external_reference:string;amount_cents:number|null;external_date:string;actor_name:string;created_at:string};
export type DitrCalendar = {id:string;exercise:number;starts_on:string;due_on:string;source_url:string;checked_on:string;responsible_name:string;created_at:string};
export type DitrState = {items:DitrCase[];total:number;page:number;page_size:5;selected:DitrCase|null;evidence:DitrEvidence[];evidence_total:number;calendar:DitrCalendar|null;requests:DitrRequestOption[];requests_total:number};
export type DitrCommand = {kind:'create';exercise:number;request_id:string;modality:'original'|'rectifying';previous_case_id:string|null}|{kind:'evidence';case_id:string;expected_version:number;evidence_kind:DitrEvidence['kind'];file_id:string;external_reference:string;amount_cents:number|null;external_date:string}|{kind:'calendar';exercise:number;starts_on:string;due_on:string;source_url:string;checked_on:string;expected_calendar_id:string|null};

const integer=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const text=(v:unknown,max=120,min=0):v is string=>typeof v==='string'&&Array.from(v).length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const nullableUuid=(v:unknown):v is string|null=>v===null||uuid(v);
const money=(v:unknown):v is number=>integer(v,0,1000000000000);
const year=(v:unknown):v is number=>integer(v,1900,2200);
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const instant=(v:unknown):v is string=>text(v,40,20)&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
const shape=(v:Record<string,unknown>,keys:string[])=>keys.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>keys.includes(k));
export function officialDitrSource(v:unknown):v is string{
 if(!text(v,1000,1))return false;
 try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&(u.hostname==='gov.br'||u.hostname.endsWith('.gov.br'));}catch{return false;}
}
export function validDitrCommand(v:unknown):v is DitrCommand{
 if(!object(v))return false;
 if(v.kind==='create')return shape(v,['kind','exercise','request_id','modality','previous_case_id'])&&year(v.exercise)&&uuid(v.request_id)&&(v.modality==='original'&&v.previous_case_id===null||v.modality==='rectifying'&&uuid(v.previous_case_id));
 if(v.kind==='evidence')return shape(v,['kind','case_id','expected_version','evidence_kind','file_id','external_reference','amount_cents','external_date'])&&uuid(v.case_id)&&integer(v.expected_version,1,2147483646)&&uuid(v.file_id)&&date(v.external_date)&&text(v.external_reference,120)&&(v.evidence_kind==='receipt'?v.amount_cents===null&&v.external_reference.trim().length>0:(v.evidence_kind==='tax_guide'||v.evidence_kind==='tax_payment')&&money(v.amount_cents));
 if(v.kind==='calendar')return shape(v,['kind','exercise','starts_on','due_on','source_url','checked_on','expected_calendar_id'])&&year(v.exercise)&&date(v.starts_on)&&date(v.due_on)&&v.starts_on<=v.due_on&&date(v.checked_on)&&officialDitrSource(v.source_url)&&nullableUuid(v.expected_calendar_id);
 return false;
}
function service(v:unknown):DitrService|null{
 if(v===null)return null;
 if(!object(v)||!uuid(v.charge_id)||!money(v.total_cents)||!money(v.paid_cents)||!money(v.balance_cents))throw Error('Invalid DITR service');
 return {charge_id:v.charge_id,total_cents:v.total_cents,paid_cents:v.paid_cents,balance_cents:v.balance_cents};
}
function caseRecord(v:unknown):DitrCase{
 if(!object(v)||!uuid(v.id)||!uuid(v.property_id)||!year(v.exercise)||!uuid(v.taxpayer_id)||!text(v.taxpayer_name)||!uuid(v.request_id)||!text(v.internal_protocol)||!text(v.responsible_name)||!uuid(v.root_case_id)||!integer(v.revision,1,2147483646)||!integer(v.version,1,2147483646)||!instant(v.created_at)||typeof v.can_work!=='boolean'||!(v.modality==='original'&&v.previous_case_id===null&&v.revision===1&&v.root_case_id===v.id||v.modality==='rectifying'&&uuid(v.previous_case_id)&&v.revision>=2))throw Error('Invalid DITR case');
 return {id:v.id,property_id:v.property_id,exercise:v.exercise,taxpayer_id:v.taxpayer_id,taxpayer_name:v.taxpayer_name,request_id:v.request_id,internal_protocol:v.internal_protocol,responsible_name:v.responsible_name,modality:v.modality,previous_case_id:v.previous_case_id,root_case_id:v.root_case_id,revision:v.revision,version:v.version,created_at:v.created_at,can_work:v.can_work,service:service(v.service)};
}
function evidence(v:unknown):DitrEvidence{
 if(!object(v)||!uuid(v.id)||!uuid(v.case_id)||!uuid(v.file_id)||!text(v.external_reference)||!date(v.external_date)||!text(v.actor_name)||!instant(v.created_at)||!(v.kind==='receipt'&&v.amount_cents===null&&v.external_reference.trim().length>0||(v.kind==='tax_guide'||v.kind==='tax_payment')&&money(v.amount_cents)))throw Error('Invalid DITR evidence');
 return {id:v.id,case_id:v.case_id,kind:v.kind,file_id:v.file_id,external_reference:v.external_reference,amount_cents:v.amount_cents,external_date:v.external_date,actor_name:v.actor_name,created_at:v.created_at};
}
function calendar(v:unknown):DitrCalendar|null{
 if(v===null)return null;
 if(!object(v)||!uuid(v.id)||!year(v.exercise)||!date(v.starts_on)||!date(v.due_on)||v.starts_on>v.due_on||!officialDitrSource(v.source_url)||!date(v.checked_on)||!text(v.responsible_name)||!instant(v.created_at))throw Error('Invalid DITR calendar');
 return {id:v.id,exercise:v.exercise,starts_on:v.starts_on,due_on:v.due_on,source_url:v.source_url,checked_on:v.checked_on,responsible_name:v.responsible_name,created_at:v.created_at};
}
export function ditrState(v:unknown):DitrState{
 if(!object(v)||!Array.isArray(v.items)||v.items.length>5||!integer(v.total)||!integer(v.page,1,100000)||v.page_size!==5||!Array.isArray(v.evidence)||v.evidence.length>5||!integer(v.evidence_total)||!Array.isArray(v.requests)||v.requests.length>5||!integer(v.requests_total))throw Error('Invalid DITR state');
 return {items:v.items.map(caseRecord),total:v.total,page:v.page,page_size:5,selected:v.selected===null?null:caseRecord(v.selected),evidence:v.evidence.map(evidence),evidence_total:v.evidence_total,calendar:calendar(v.calendar),requests:v.requests.map(a=>{if(!object(a)||!uuid(a.id)||!text(a.protocol)||!uuid(a.taxpayer_id)||!text(a.taxpayer_name))throw Error('Invalid DITR request');return {id:a.id,protocol:a.protocol,taxpayer_id:a.taxpayer_id,taxpayer_name:a.taxpayer_name};}),requests_total:v.requests_total};
}
export function ditrResult(v:unknown):{id:string|null}{
 if(!object(v)||!nullableUuid(v.id))throw Error('Invalid DITR result');return {id:v.id};
}
