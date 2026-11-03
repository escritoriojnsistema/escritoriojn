import {documentObject as object,documentUuid as uuid} from '../../../shared/documents.js';
import {editorialLabels,type DocumentVersion,type DocumentVersionsPage} from '../../../shared/documentVersions.js';
const integer=(v:unknown,min=1):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<2147483647;
const text=(v:unknown,n:number):v is string=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=n;
const time=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export function projectDocumentVersions(v:unknown):DocumentVersionsPage{
 if(!object(v)||!Array.isArray(v.items)||v.items.length>5||!integer(v.total,0)||!integer(v.page)||v.page_size!==5||!integer(v.current_revision))throw Error('Invalid versions');
 const items=v.items.map((x):DocumentVersion=>{
  if(!object(x)||!uuid(x.id)||!integer(x.revision)||typeof x.current!=='boolean'||x.current!==(x.revision===v.current_revision)||!text(x.author_name,120)||!time(x.created_at)||!uuid(x.template_version_id)||!integer(x.template_number)||!hash(x.content_sha256)||!hash(x.snapshot_sha256)||!(x.pdf_sha256===null&&x.size_bytes===null||hash(x.pdf_sha256)&&integer(x.size_bytes)&&x.size_bytes<=3145728)||typeof x.status!=='string'||!Object.hasOwn(editorialLabels,x.status)||!['approve','reject','return','withdraw',null].includes(x.last_decision as null)||!(x.decision_reason===null||text(x.decision_reason,500))||!(x.decision_at===null||time(x.decision_at)))throw Error('Invalid version');
  return {id:x.id,revision:x.revision,current:x.current,author_name:x.author_name,created_at:x.created_at,template_version_id:x.template_version_id,template_number:x.template_number,content_sha256:x.content_sha256,snapshot_sha256:x.snapshot_sha256,pdf_sha256:x.pdf_sha256 as string|null,size_bytes:x.size_bytes as number|null,status:x.status as DocumentVersion['status'],last_decision:x.last_decision as DocumentVersion['last_decision'],decision_reason:x.decision_reason as string|null,decision_at:x.decision_at as string|null};
 });
 return {items,total:v.total,page:v.page,page_size:5,current_revision:v.current_revision};
}
