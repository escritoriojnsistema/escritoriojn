import {templateKeys,templateKinds,templateText,validTemplate,type TemplateVersion,type TemplatePage,type TemplateDetail,type TemplateSummary} from '../../../shared/templates.js';
import {record,uuid} from '../team/validation.js';
import {validLinkedService,type TemplateFolderSummary, type TemplateFoldersPage, type TemplateLinkedService} from '../../../shared/templateFolders.js';
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
 // Etapa22: pasta, nível e serviço vinculado (preço vigente) — extras tolerantes para não quebrar buscas antigas.
 if(v.folder_id!==undefined&&v.folder_id!==null&&!uuid(v.folder_id))throw Error('Invalid folder');
 if(v.folder_name!==undefined&&v.folder_name!==null&&!(typeof v.folder_name==='string'&&Array.from(v.folder_name).length<=80))throw Error('Invalid folder name');
 if(v.level!==undefined&&!int(v.level,1,3))throw Error('Invalid level');
 if(!validLinkedService(v.service))throw Error('Invalid service');
 const extras:Pick<TemplateSummary,'folder_id'|'folder_name'|'level'|'service'>={
  folder_id:(v.folder_id??null) as string|null,
  folder_name:typeof v.folder_name==='string'&&Array.from(v.folder_name).length<=80?v.folder_name:null,
  level:int(v.level,1,3)?v.level:3,
  service:v.service?{id:(v.service as TemplateLinkedService).id,code:(v.service as TemplateLinkedService).code,name:(v.service as TemplateLinkedService).name,version_id:(v.service as TemplateLinkedService).version_id,price_cents:(v.service as TemplateLinkedService).price_cents}:null,
 };
 return {id:v.id,code:v.code,name:v.name,kind:v.kind as TemplateSummary['kind'],demonstration:v.demonstration,latest_version:v.latest_version,current_version:v.current_version,...extras};
}
export function templatePage(v:unknown):TemplatePage{
 if(!record(v)||!int(v.total)||!int(v.page,1,100000)||!int(v.page_size)||![3,5].includes(v.page_size)||!Array.isArray(v.items)||v.items.length>v.page_size)throw Error('Invalid template page');
 return {items:v.items.map(summary),total:v.total,page:v.page,page_size:v.page_size};
}
export function templateDetail(v:unknown):TemplateDetail{
 if(!record(v)||!uuid(v.id)||typeof v.code!=='string'||!int(v.latest_version,1)||typeof v.can_manage!=='boolean'||typeof v.can_approve!=='boolean'||!Array.isArray(v.versions)||v.versions.length>5||!int(v.history_total,1)||v.history_total!==v.latest_version||!int(v.history_page,1,100000))throw Error('Invalid template detail');
 const versions=v.versions.map(version);if(versions.some(x=>x.code!==v.code||x.number>Number(v.latest_version))||new Set(versions.map(x=>x.number)).size!==versions.length)throw Error('Invalid version identity');
 // Etapa22: extras de organização (pasta/nível/serviço-vínculo com preço vigente), tolerantes.
 if(v.folder_id!==undefined&&v.folder_id!==null&&!uuid(v.folder_id))throw Error('Invalid folder');
 if(v.level!==undefined&&!int(v.level,1,3))throw Error('Invalid level');
 if(v.config_version!==undefined&&!int(v.config_version))throw Error('Invalid configuration revision');
 if(!validLinkedService(v.service))throw Error('Invalid service');
 const service=v.service as TemplateLinkedService|null|undefined;
 return {id:v.id,code:v.code,latest_version:v.latest_version,can_manage:v.can_manage,can_approve:v.can_approve,versions,history_total:v.history_total,history_page:v.history_page,folder_id:v.folder_id as string|null??null,level:int(v.level,1,3)?v.level:3,config_version:v.config_version as number??0,service:service?{id:service.id,code:service.code,name:service.name,version_id:service.version_id,price_cents:service.price_cents}:null};
}
function folder(v:unknown):TemplateFolderSummary{
 if(!record(v)||!uuid(v.id)||!templateText(v.name,80)||!int(v.level,1,3)||!int(v.latest_version)||!int(v.templates_count))throw Error('Invalid folder');
 return {id:v.id,name:v.name,level:v.level as TemplateFolderSummary['level'],latest_version:v.latest_version,templates_count:v.templates_count};
}
export function templateFoldersPage(v:unknown):TemplateFoldersPage{
 if(!record(v)||!int(v.total)||!int(v.page,1,100000)||![3,5].includes(Number(v.page_size))||!Array.isArray(v.items)||v.items.length>Number(v.page_size))throw Error('Invalid folders page');
 return {items:v.items.map(folder),total:v.total,page:v.page,page_size:v.page_size as number};
}
export function templateFolderMutation(v:unknown):TemplateFolderSummary|{deleted:true}{
 if(record(v)&&v.deleted===true&&Object.keys(v).length===1)return {deleted:true};
 return folder(v);
}
