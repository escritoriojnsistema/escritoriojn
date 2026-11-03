import {documentExact as exact,documentObject as object,documentUuid as uuid} from './documents.js';
import {workflowBlockers,type WorkflowCommand,type WorkflowState,type Publication,type PortalDocuments,type PortalDocument} from './documentWorkflow.js';
import {projectReviewMetadata} from './editorialReviewValidation.js';
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<2147483647;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
export function validWorkflowCommand(v:unknown):v is WorkflowCommand {
 if(!object(v)||!integer(v.expected_revision,1)||!text(v.reason,500))return false;
 const stamp=Object.hasOwn(v,'expected_event_id')?['expected_event_id']:[];
 if(stamp.length&&!(v.expected_event_id===null||uuid(v.expected_event_id)))return false;
 if(v.kind==='freeze'){
  const reviewer=Object.hasOwn(v,'reviewer_id')?['reviewer_id']:[],due=Object.hasOwn(v,'due_at')?['due_at']:[];
  return exact(v,['kind','expected_revision','reason',...stamp,...reviewer,...due])&&(!reviewer.length||v.reviewer_id===null||uuid(v.reviewer_id))&&(!due.length||v.due_at===null||typeof v.due_at==='string'&&v.due_at.length<=40&&Number.isFinite(Date.parse(v.due_at)));
 }
 return ['approve','reject','return','withdraw','signature','handoff'].includes(String(v.kind))&&exact(v,['kind','publication_id','expected_revision','reason',...stamp])&&uuid(v.publication_id)&&(!['return','withdraw'].includes(String(v.kind))||stamp.length===1);
}
const time=(v:unknown):v is string=>typeof v==='string'&&Number.isFinite(Date.parse(v));
function portalItem(v:unknown):PortalDocument{
 if(!object(v)||!uuid(v.id)||!text(v.title,120)||!text(v.protocol,120)||!time(v.created_at)||typeof v.ready!=='boolean'||!Array.isArray(v.blockers)||v.blockers.some(x=>typeof x!=='string'||!Object.hasOwn(workflowBlockers,x))||v.ready!==(v.blockers.length===0))throw Error('Invalid portal document');
 return {id:v.id,title:v.title,protocol:v.protocol,created_at:v.created_at,ready:v.ready,blockers:[...v.blockers] as string[]};
}
export function projectPortalDocuments(v:unknown):PortalDocuments{
 if(!object(v)||!Array.isArray(v.items)||v.items.length>5||!integer(v.total)||!integer(v.page,1)||v.page_size!==5)throw Error('Invalid portal page');
 return {items:v.items.map(portalItem),total:v.total,page:v.page,page_size:5};
}
export function projectWorkflowState(v:unknown):WorkflowState {
 if(!object(v)||!uuid(v.document_id)||!integer(v.current_revision,1)||typeof v.can_work!=='boolean'||typeof v.can_review!=='boolean'||!Array.isArray(v.publications)||v.publications.length>5)throw Error('Invalid workflow');
 const publications=v.publications.map((p):Publication=>{
 if(!object(p)||!uuid(p.id)||!integer(p.revision,1)||!text(p.title,120)||!time(p.created_at)||!uuid(p.created_by)||typeof p.review_required!=='boolean'||!['none','physical','external'].includes(String(p.signature_policy))||['approved','signed','handed_off','artifact_ready','ready'].some(k=>typeof p[k]!=='boolean')||!Array.isArray(p.blockers)||p.blockers.some(x=>!Object.hasOwn(workflowBlockers,String(x)))||p.ready!==(p.blockers.length===0))throw Error('Invalid publication');
 return {id:p.id,revision:p.revision,title:p.title,created_at:p.created_at,created_by:p.created_by,review_required:p.review_required,signature_policy:String(p.signature_policy),approved:p.approved as boolean,signed:p.signed as boolean,handed_off:p.handed_off as boolean,artifact_ready:p.artifact_ready as boolean,ready:p.ready as boolean,blockers:[...p.blockers] as string[],...(p.review===undefined?{}:{review:projectReviewMetadata(p.review)})};});
 return {document_id:v.document_id,current_revision:v.current_revision,can_work:v.can_work,can_review:v.can_review,publications};
}
