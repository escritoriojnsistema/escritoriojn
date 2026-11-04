export type WorkflowCommand=
 |{kind:'freeze';expected_revision:number;reason:string;reviewer_id?:string|null;due_at?:string|null;expected_event_id?:string|null}
 |{kind:'approve'|'reject'|'return'|'withdraw'|'signature'|'handoff';publication_id:string;expected_revision:number;reason:string;expected_event_id?:string|null};
export type Publication={id:string;revision:number;title:string;created_at:string;created_by:string;review_required:boolean;signature_policy:string;approved:boolean;signed:boolean;handed_off:boolean;artifact_ready:boolean;ready:boolean;blockers:string[];review?:import('./editorialReview.js').ReviewMetadata};
export type WorkflowState={document_id:string;current_revision:number;can_work:boolean;can_review:boolean;publications:Publication[]};
export type PortalDocument={id:string;title:string;protocol:string;created_at:string;ready:boolean;blockers:string[]};
export type PortalDocuments={items:PortalDocument[];total:number;page:number;page_size:number};
export const workflowBlockers:Record<string,string>={signature_setup:'Configure a modalidade e os signatários antes da saída',restriction:'Há uma restrição cadastral para conferência',superseded:'Existe uma revisão mais recente',cancelled:'Atendimento cancelado',demonstration:'Modelo de demonstração',review:'Aguardando aprovação',signature:'Aguardando assinatura',payment:'Aguardando pagamento integral',identity:'Aguardando conferência do vínculo',artifact:'Arquivo em preparação',handoff:'Aguardando envio ao caixa'};
export type DocumentCashQueue={items:{publication_id:string;request_id:string;protocol:string;title:string;claimed:boolean;has_charge:boolean}[];total:number;page:number;page_size:number};
