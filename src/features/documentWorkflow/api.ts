import type {WorkflowCommand,WorkflowState,PortalDocuments,DocumentCashQueue} from '../../../shared/documentWorkflow';
import {commercialRequest} from '../documentCommercial/api';
const request=<T,>(path:string,body:unknown,signal?:AbortSignal,blob=false)=>commercialRequest<T>(path,body,signal,'/api/document-workflow',blob);
export const workflowApi={
 state:(office_id:string,document_id:string,signal?:AbortSignal)=>request<WorkflowState>('/state',{office_id,document_id},signal),
 command:(office_id:string,document_id:string,command:WorkflowCommand,idempotency_key:string,signal?:AbortSignal)=>request<WorkflowState>('/command',{office_id,document_id,command,idempotency_key},signal),
 generate:(office_id:string,publication_id:string,signal?:AbortSignal)=>request<{publication_id:string;ready:boolean}>('/artifact',{office_id,publication_id,action:'generate'},signal),
 download:(office_id:string,publication_id:string,signal?:AbortSignal)=>request<Blob>('/artifact',{office_id,publication_id,action:'download'},signal,true),
 portal:(office_id:string,page:number,signal?:AbortSignal)=>request<PortalDocuments>('/portal',{office_id,page},signal),
 cashQueue:(office_id:string,page:number,signal?:AbortSignal)=>request<DocumentCashQueue>('/cash-queue',{office_id,page},signal),
 cashClaim:(office_id:string,publication_id:string,idempotency_key:string,signal?:AbortSignal)=>request<DocumentCashQueue>('/cash-claim',{office_id,publication_id,idempotency_key},signal),
};
