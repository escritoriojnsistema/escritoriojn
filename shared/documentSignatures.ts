/** Etapa24: conferência humana de formalização, nunca assinatura automática. */
export type SignatureMode='none'|'physical'|'external';
export type SignatureExitPolicy='after_settlement'|'before_settlement';
export type SignatureStatus='not_required'|'pending'|'in_validation'|'validated'|'invalid';
export type SignatureCommand={expected_revision:number;expected_event_id:string|null;reason:string}&(
 |{kind:'configure';mode:SignatureMode;exit_policy:SignatureExitPolicy;expected_signers:string[]}
 |{kind:'import';file_id:string}
 |{kind:'validate';result:'validated'|'invalid';verified_signers:string[];evidence:string;sha256:string}
 |{kind:'physical';verified_signers:string[];evidence:string;signed_on:string;custody:string;notary_reference:string}
 |{kind:'revoke'}
);
export type SignatureFile={id:string;name:string;sha256:string;size_bytes:number;status:string;scanner_status:string};
export type SignatureEvent={id:string;kind:string;actor_name:string;created_at:string;reason:string};
export type SignatureState={
 publication_id:string;document_id:string;request_id:string;revision:number;mode:SignatureMode;exit_policy:SignatureExitPolicy;
 expected_signers:string[];verified_signers:string[];status:SignatureStatus;last_event_id:string|null;
 can_manage:boolean;can_validate:boolean;can_exit:boolean;exit_blockers:string[];
 file:SignatureFile|null;evidence:string|null;signed_on:string|null;custody:string|null;notary_reference:string|null;
 history:SignatureEvent[];history_total:number;page:number;page_size:5;
};
