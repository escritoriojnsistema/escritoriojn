import {documentObject as object,documentUuid as uuid} from './documents.js';
import {reviewStatuses,reviewEventLabels,type ReviewMetadata,type ReviewQueuePage,type ReviewMembersPage,type ReviewHistoryPage,type PublicReviewPage} from './editorialReview.js';
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<2147483647;
const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.trim().length>0&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const nullable=(v:unknown,valid:(v:unknown)=>boolean)=>v===null||valid(v);
function page(v:unknown,five=false):asserts v is Record<string,unknown>&{items:unknown[];total:number;page:number;page_size:number}{
 if(!object(v)||!Array.isArray(v.items)||!integer(v.total)||!integer(v.page,1)||typeof v.page_size!=='number'||!(five?[5]:[3,5]).includes(v.page_size)||v.items.length>v.page_size)throw Error('Invalid review page');
}
export function projectReviewMetadata(v:unknown):ReviewMetadata{
 if(!object(v)||typeof v.status!=='string'||!Object.hasOwn(reviewStatuses,v.status)||!nullable(v.reviewer_id,uuid)||!nullable(v.reviewer_name,x=>text(x,120))||!text(v.prepared_by_name,120)||!nullable(v.due_at,time)||!time(v.submitted_at)||!nullable(v.last_event_id,uuid)||!nullable(v.last_reason,x=>text(x,500))||!nullable(v.last_actor_name,x=>text(x,120))||['can_decide','can_withdraw','can_submit'].some(k=>typeof v[k]!=='boolean'))throw Error('Invalid review metadata');
 return {status:v.status as ReviewMetadata['status'],reviewer_id:v.reviewer_id as string|null,reviewer_name:v.reviewer_name as string|null,prepared_by_name:v.prepared_by_name,due_at:v.due_at as string|null,submitted_at:v.submitted_at,last_event_id:v.last_event_id as string|null,last_reason:v.last_reason as string|null,last_actor_name:v.last_actor_name as string|null,can_decide:v.can_decide as boolean,can_withdraw:v.can_withdraw as boolean,can_submit:v.can_submit as boolean};
}
export function projectReviewQueue(v:unknown):ReviewQueuePage{
 page(v);const items=v.items.map(x=>{if(!object(x)||!uuid(x.document_id)||!uuid(x.request_id)||!uuid(x.publication_id)||!text(x.protocol,120)||!text(x.title,120)||!integer(x.revision,1)||!integer(x.pending_count))throw Error('Invalid review queue');return {document_id:x.document_id,request_id:x.request_id,publication_id:x.publication_id,protocol:x.protocol,title:x.title,revision:x.revision,pending_count:x.pending_count,review:projectReviewMetadata(x.review)};});
 return {items,total:v.total,page:v.page,page_size:v.page_size};
}
export function projectReviewMembers(v:unknown):ReviewMembersPage{
 page(v);const items=v.items.map(x=>{if(!object(x)||!uuid(x.id)||!text(x.label,120)||!['owner','admin','employee'].includes(String(x.role_code)))throw Error('Invalid reviewer');return{id:x.id,label:x.label,role_code:x.role_code as 'owner'|'admin'|'employee'};});return{items,total:v.total,page:v.page,page_size:v.page_size};
}
export function projectReviewHistory(v:unknown):ReviewHistoryPage{
 page(v,true);const items=v.items.map(x=>{if(!object(x)||!uuid(x.id)||!uuid(x.publication_id)||!integer(x.revision,1)||typeof x.kind!=='string'||!Object.hasOwn(reviewEventLabels,x.kind)||!text(x.actor_name,120)||!text(x.reason,500)||!time(x.created_at)||!nullable(x.reviewer_name,x=>text(x,120))||!nullable(x.due_at,time))throw Error('Invalid review history');return {id:x.id,publication_id:x.publication_id,revision:x.revision,kind:x.kind as keyof typeof reviewEventLabels,actor_name:x.actor_name,reason:x.reason,created_at:x.created_at,reviewer_name:x.reviewer_name as string|null,due_at:x.due_at as string|null};});return{items,total:v.total,page:v.page,page_size:5};
}
export function projectPublicReviews(v:unknown):PublicReviewPage{
 page(v);const items=v.items.map(x=>{if(!object(x)||!text(x.title,120)||!integer(x.revision,1)||typeof x.status!=='string'||!Object.hasOwn(reviewStatuses,x.status)||!time(x.updated_at))throw Error('Invalid public review');return{title:x.title,revision:x.revision,status:x.status as keyof typeof reviewStatuses,updated_at:x.updated_at};});return{items,total:v.total,page:v.page,page_size:v.page_size};
}
