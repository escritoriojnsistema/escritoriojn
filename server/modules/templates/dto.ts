import {templateKeys,templateKinds,templateText,validTemplate,type TemplateVersion,type TemplatePage,type TemplateDetail,type TemplateSummary} from '../../../shared/templates.js';
import {record,uuid} from '../team/validation.js';
const int=(v:unknown,min=0,max=2147483646):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
function version(v:unknown):TemplateVersion{
 if(!record(v)||!uuid(v.id)||!int(v.number,1)||!(uuid(v.created_by)&&(v.source_import_id===undefined||v.source_import_id===null)||v.created_by===null&&uuid(v.source_import_id))||!templateText(v.created_by_name,120)||!time(v.created_at)||!templateText(v.reason,500))throw Error('Invalid template version');
 const input=Object.fromEntries(templateKeys.map(k=>[k,v[k]]));if(!validTemplate(input))throw Error('Invalid template definition');
 if(v.approved_at===null){if(v.approved_by!==null||v.approved_by_name!==null||v.approval_reason!==null)throw Error('Invalid approval');}
 else if(!time(v.approved_at)||!uuid(v.approved_by)||!templateText(v.approved_by_name,120)||!templateText(v.approval_reason,500))throw Error('Invalid approval');
 return {...input,variables:input.variables.map(x=>({key:x.key,label:x.label,type:x.type,required:x.required})),id:v.id,number:v.number,created_by:v.created_by as string|null,...(v.source_import_id!==undefined?{source_import_id:v.source_import_id as string|null}:{}),created_by_name:v.created_by_name,created_at:v.created_at,reason:v.reason,approved_by:v.approved_by as string|null,approved_by_name:v.approved_by_name as string|null,approved_at:v.approved_at as string|null,approval_reason:v.approval_reason as string|null};
}
function summary(v:unknown):TemplateSummary{
 if(!record(v)||!uuid(v.id)||!templateText(v.name,120)||typeof v.code!=='string'||!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(v.code)||typeof v.kind!=='string'||!Object.hasOwn(templateKinds,v.kind)||typeof v.demonstration!=='boolean'||!int(v.latest_version,1)||!(v.current_version===null||int(v.current_version,1,v.latest_version)))throw Error('Invalid template summary');
 return {id:v.id,code:v.code,name:v.name,kind:v.kind as TemplateSummary['kind'],demonstration:v.demonstration,latest_version:v.latest_version,current_version:v.current_version};
}
export function templatePage(v:unknown):TemplatePage{
 if(!record(v)||!int(v.total)||!int(v.page,1,100000)||!int(v.page_size)||![3,5].includes(v.page_size)||!Array.isArray(v.items)||v.items.length>v.page_size)throw Error('Invalid template page');
 return {items:v.items.map(summary),total:v.total,page:v.page,page_size:v.page_size};
}
export function templateDetail(v:unknown):TemplateDetail{
 if(!record(v)||!uuid(v.id)||typeof v.code!=='string'||!int(v.latest_version,1)||typeof v.can_manage!=='boolean'||typeof v.can_approve!=='boolean'||!Array.isArray(v.versions)||v.versions.length>5||!int(v.history_total,1)||v.history_total!==v.latest_version||!int(v.history_page,1,100000))throw Error('Invalid template detail');
 const versions=v.versions.map(version);if(versions.some(x=>x.code!==v.code||x.number>Number(v.latest_version))||new Set(versions.map(x=>x.number)).size!==versions.length)throw Error('Invalid version identity');
 return {id:v.id,code:v.code,latest_version:v.latest_version,can_manage:v.can_manage,can_approve:v.can_approve,versions,history_total:v.history_total,history_page:v.history_page};
}
