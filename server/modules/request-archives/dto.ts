import {record, uuid} from '../team/validation.js';
import {requestArchiveDays, requestArchiveReportMaxRows, type RequestArchiveItem, type RequestArchivePage, type RequestArchivePolicy, type RequestArchiveReport} from '../../../shared/requestArchives.js';

const text = (v:unknown,max:number):v is string => typeof v==='string' && v.length>0 && v.length<=max && !/[\u0000-\u001f\u007f]/u.test(v);
const date = (v:unknown):v is string => typeof v==='string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(v) && Number.isFinite(Date.parse(v));
const integer = (v:unknown,min=1,max=2147483645):v is number => Number.isSafeInteger(v) && Number(v)>=min && Number(v)<=max;
const invalid = ():never => {throw new Error('Invalid request archive response');};
export function archivePolicy(v:unknown):RequestArchivePolicy {
 if(!record(v)||!requestArchiveDays.includes(v.days as 30)||!integer(v.version)||!date(v.cutoff))return invalid();
 return {days:v.days as RequestArchivePolicy['days'],version:v.version,cutoff:v.cutoff};
}
export function archiveItem(v:unknown):RequestArchiveItem {
 if(!record(v)||!uuid(v.id)||!text(v.protocol,80)||!text(v.title,120)||!['concluido','cancelado'].includes(String(v.status))||!integer(v.version)||!date(v.closed_at)||typeof v.archived!=='boolean'||!(v.archived_at===null||date(v.archived_at)))return invalid();
 return {id:v.id,protocol:v.protocol,title:v.title,status:v.status as RequestArchiveItem['status'],version:v.version,closed_at:v.closed_at,archived:v.archived,archived_at:v.archived_at};
}
export function archivePage(v:unknown):RequestArchivePage {
 if(!record(v)||!Array.isArray(v.items)||!integer(v.page,1,100000)||!integer(v.page_size,3,5)||![3,5].includes(v.page_size)||!integer(v.total,0,Number.MAX_SAFE_INTEGER)||v.items.length>v.page_size||typeof v.can_read_all!=='boolean')return invalid();
 return {items:v.items.map(archiveItem),page:v.page,page_size:v.page_size as 3|5,total:v.total,can_read_all:v.can_read_all};
}
export function archiveResult(v:unknown):{request_id:string;archived:true} {
 if(!record(v)||!uuid(v.request_id)||v.archived!==true)return invalid();
 return {request_id:v.request_id,archived:true};
}
export function archiveReport(v:unknown):RequestArchiveReport {
 if(!record(v)||!uuid(v.id)||!uuid(v.office_id)||v.protocol!==`JN-SOL-${v.id}`||v.renderer_version!==1||!date(v.created_at)||!date(v.cutoff)||!text(v.office_name,200)||!text(v.actor_name,160)||!integer(v.count,0,requestArchiveReportMaxRows)||!Array.isArray(v.items)||v.items.length!==v.count||!record(v.filters))return invalid();
 const f=v.filters;
 if(!['mine','all'].includes(String(f.scope))||!['recent','archived'].includes(String(f.view))||!['','concluido','cancelado'].includes(String(f.status))||!(f.from===null||date(f.from))||!(f.until===null||date(f.until)))return invalid();
 const items=v.items.map(archiveItem);
 if(new Set(items.map(i=>i.id)).size!==items.length||items.some(i=>i.archived!==(f.view==='archived')||(f.status!==''&&i.status!==f.status)))return invalid();
 return {id:v.id,office_id:v.office_id,protocol:v.protocol,renderer_version:1,created_at:v.created_at,cutoff:v.cutoff,office_name:v.office_name,actor_name:v.actor_name,count:v.count,filters:{scope:f.scope as 'mine'|'all',view:f.view as 'recent'|'archived',status:f.status as ''|'concluido'|'cancelado',from:f.from,until:f.until},items};
}
