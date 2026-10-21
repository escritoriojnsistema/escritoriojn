/** Etapa 11: metadata only. Bytes travel directly to the private Storage bucket. */
export const attachmentPermissions = ['files.read','files.upload','files.copy','files.manage'] as const;
export const attachmentBucket = 'request-attachments';
export const attachmentMaxBytes = 10 * 1024 * 1024;
export const attachmentMimeTypes = ['application/pdf','image/png','image/jpeg'] as const;
export type AttachmentMime = typeof attachmentMimeTypes[number];
export type AttachmentClassification = 'documento'|'identificacao'|'comprovante';
export type AttachmentStatus = 'aguardando_upload'|'quarentena'|'disponivel'|'rejeitado'|'removido';
export type AttachmentPolicy = {max_bytes:number;mime_types:AttachmentMime[];version:number};
export type AttachmentFile = {
 id:string;request_id:string;request_item_id:string|null;name:string;mime_type:AttachmentMime;size_bytes:number;
 sha256:string;classification:AttachmentClassification;status:AttachmentStatus;
 scanner_status:'not_configured'|'pending'|'clean'|'infected';validation_reason:string|null;intent_id:string|null;
 created_at:string;updated_at:string;can_validate:boolean;can_download:boolean;can_copy:boolean;
};
export type AttachmentPage = {items:AttachmentFile[];total:number;page:number;page_size:number;portal:boolean};
export type AttachmentRequestOption = {id:string;label:string;closed:boolean;items:{id:string;service_id:string;name:string;policy:AttachmentPolicy}[]};
export type AttachmentRequestPage = {items:AttachmentRequestOption[];total:number;page:number;page_size:number};
export type AttachmentUploadInput = {
 request_id:string;request_item_id:string|null;name:string;mime_type:AttachmentMime;size_bytes:number;
 sha256:string;classification:AttachmentClassification;idempotency_key:string;
};
export type AttachmentIntent = {file:AttachmentFile;intent_id:string;bucket:typeof attachmentBucket;object_path:string;expires_at:string;can_upload:boolean};
export type AttachmentDownload = {bucket:typeof attachmentBucket;object_path:string;name:string;mime_type:AttachmentMime};
export type AttachmentCleanupPlan = {id:string;expires_at:string;count:number;orphan_count:number;items:{id:string;name:string;status:'rejeitado'|'aguardando_upload'}[]};
export type AttachmentProcessInput =
 | {action:'validate';args:{intent_id:string}}
 | {action:'copy';args:{source_file_id:string;target_request_id:string;target_item_id:string|null;idempotency_key:string}}
 | {action:'cleanup';args:{plan_id:string}};
export type AttachmentProcessResult = {file:AttachmentFile|null;removed:number;pending:number};
/** Server-only lease contract; never put a service credential or download URL here. */
export type AttachmentLeaseObject = {file_id:string;intent_id:string;bucket:typeof attachmentBucket;object_path:string;name:string;mime_type:AttachmentMime;size_bytes:number;sha256:string;source_path?:string};
export type AttachmentLease = {lease_id:string;lease_token:string;action:AttachmentProcessInput['action'];expires_at:string;objects:AttachmentLeaseObject[];result?:AttachmentProcessResult|null};
