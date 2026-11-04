import type {SignatureCommand,SignatureState} from '../../../shared/documentSignatures';
import type {WorkflowCommand,WorkflowState,PortalDocuments,DocumentCashQueue} from '../../../shared/documentWorkflow';
import {commercialRequest} from '../documentCommercial/api';
import type {ReviewQueuePage,ReviewMembersPage,ReviewHistoryPage,ReviewStatus} from '../../../shared/editorialReview';
import type {DocumentVersionsPage} from '../../../shared/documentVersions';
const request=<T,>(path:string,body:unknown,signal?:AbortSignal,blob=false)=>commercialRequest<T>(path,body,signal,'/api/document-workflow',blob);
export const workflowApi={
 signatureState:(office_id:string,publication_id:string,page:number,signal?:AbortSignal)=>request<SignatureState>('/signature-state',{office_id,publication_id,page},signal),
 signatureCommand:(office_id:string,publication_id:string,command:SignatureCommand,idempotency_key:string,signal?:AbortSignal)=>request<SignatureState>('/signature-command',{office_id,publication_id,command,idempotency_key},signal),
 signing:(office_id:string,publication_id:string,signal?:AbortSignal)=>request<Blob>('/artifact',{office_id,publication_id,action:'signing'},signal,true),
 reviewQueue:(office_id:string,query:string,status:ReviewStatus|'',page:number,size:3|5,signal?:AbortSignal)=>request<ReviewQueuePage>('/review-queue',{office_id,query,status,page,size},signal),
 reviewers:(office_id:string,document_id:string,query:string,page:number,size:3|5,signal?:AbortSignal)=>request<ReviewMembersPage>('/reviewers',{office_id,document_id,query,page,size},signal),
 reviewHistory:(office_id:string,document_id:string,page:number,signal?:AbortSignal)=>request<ReviewHistoryPage>('/review-history',{office_id,document_id,page},signal),
 versions:(office_id:string,document_id:string,page:number,signal?:AbortSignal)=>request<DocumentVersionsPage>('/versions',{office_id,document_id,page},signal),
 preview:(office_id:string,version_id:string,signal?:AbortSignal)=>request<Blob>('/preview',{office_id,version_id},signal,true),
 state:(office_id:string,document_id:string,signal?:AbortSignal)=>request<WorkflowState>('/state',{office_id,document_id},signal),
 command:(office_id:string,document_id:string,command:WorkflowCommand,idempotency_key:string,signal?:AbortSignal)=>request<WorkflowState>('/command',{office_id,document_id,command,idempotency_key},signal),
 generate:(office_id:string,publication_id:string,signal?:AbortSignal)=>request<{publication_id:string;ready:boolean}>('/artifact',{office_id,publication_id,action:'generate'},signal),
 download:(office_id:string,publication_id:string,signal?:AbortSignal)=>request<Blob>('/artifact',{office_id,publication_id,action:'download'},signal,true),
 portal:(office_id:string,page:number,signal?:AbortSignal)=>request<PortalDocuments>('/portal',{office_id,page},signal),
 cashQueue:(office_id:string,page:number,signal?:AbortSignal)=>request<DocumentCashQueue>('/cash-queue',{office_id,page},signal),
 cashClaim:(office_id:string,publication_id:string,idempotency_key:string,signal?:AbortSignal)=>request<DocumentCashQueue>('/cash-claim',{office_id,publication_id,idempotency_key},signal),
};
