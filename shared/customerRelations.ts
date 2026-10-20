import type { CustomerKind, CustomerSummary } from './customers.js';

/** These capabilities never imply portal or document authority. */
export const customerRelationPermissions = ['customers.relate', 'customers.verify', 'customers.merge'] as const;
export const relationLimits = { candidates: 20, history: 50, activePerKind: 20, evidence: 500, query: 120, contacts: 4 } as const;
export type RepresentationKind = 'proxy' | 'representative' | 'guardian';
export type RelationStatus = 'active' | 'future' | 'expired' | 'revoked' | 'unavailable';
export type IdentityStatus = 'verified' | 'revoked' | 'unavailable';
export type RelationCandidateKind = 'team' | 'client' | 'customers';
export type RelationCandidate = {
  id: string; name: string; kind: 'owner' | 'admin' | 'employee' | 'client' | CustomerKind;
  contact_masked: string | null; identifier_masked: string | null;
};
export type CustomerRelationCandidates = { kind: RelationCandidateKind; items: RelationCandidate[]; limit: 20 };
export type AssignmentGrant = { membership_id: string; valid_from: string; valid_until: string | null };
export type RepresentationGrant = { representative_customer_id: string; kind: RepresentationKind; evidence: string; valid_from: string; valid_until: string | null };
export type IdentityVerify = { membership_id: string; evidence: string };
export type RelationRevoke = { id: string; version: number };
export type CustomerRelationCommand = { office_id: string; customer_id: string } & (
  | { action: 'assignment.grant'; payload: AssignmentGrant }
  | { action: 'assignment.revoke'; payload: RelationRevoke }
  | { action: 'representation.grant'; payload: RepresentationGrant }
  | { action: 'representation.revoke'; payload: RelationRevoke }
  | { action: 'identity.verify'; payload: IdentityVerify }
  | { action: 'identity.revoke'; payload: RelationRevoke }
);
export type CustomerRelationsRequest = { office_id: string; customer_id: string };
export type CustomerRelationCandidatesRequest = { office_id: string; kind: RelationCandidateKind; query: string };
export type RelationBase = { id: string; version: number; created_at: string; revoked_at: string | null; created_by: string; revoked_by: string | null };
export type Assignment = RelationBase & { membership_id: string; name: string; valid_from: string; valid_until: string | null; status: RelationStatus };
export type Representation = RelationBase & {
  representative_customer_id: string; name: string; kind: RepresentationKind; evidence: string;
  valid_from: string; valid_until: string | null; status: RelationStatus;
  authorization_status: 'valid' | 'invalid'; grants_customer_access: false; portal_enabled: false;
};
export type VerifiedIdentity = RelationBase & { membership_id: string; name: string; evidence: string; status: IdentityStatus; portal_enabled: false };
export type CustomerMergeHistory = { id: string; source_id: string; target_id: string; source_snapshot_id: string; target_snapshot_id: string; result_snapshot_id: string; created_at: string; actor_id: string };
export type CustomerRelationsState = {
  customer: CustomerSummary & { version: number };
  capabilities: { can_relate: boolean; can_verify: boolean; can_merge: boolean };
  assignments: Assignment[]; representations: Representation[]; identities: VerifiedIdentity[]; merges: CustomerMergeHistory[];
  truncated: { assignments: boolean; representations: boolean; identities: boolean; merges: boolean };
  portal_enabled: false; access_lost: boolean;
};
export type CustomerMergePreviewRequest = { office_id: string; source_id: string; target_id: string };
export type CustomerMergeConflict = 'same_customer' | 'kind' | 'identifier' | 'contacts' | 'identity';
export type CustomerMergePreview = {
  source: CustomerSummary & { version: number }; target: CustomerSummary & { version: number };
  expected: { name: string; kind: CustomerKind; identifier_masked: string | null; contact_count: number; copies_identifier: boolean; transfers_authority: false };
  conflicts: CustomerMergeConflict[]; can_merge: boolean; portal_enabled: false;
};
export type CustomerMergeRequest = CustomerMergePreviewRequest & { source_version: number; target_version: number; evidence: string; confirm: true };
export type CustomerMergeResult = { merge_id: string; source_id: string; target_id: string; target_version: number; state: CustomerRelationsState };
/** Immutable private database record; never returned by the public RPCs. */
export type CustomerSnapshot = {
  id: string; office_id: string; customer_id: string; version: number; captured_at: string;
  data: { kind: CustomerKind; name: string; identifier: string | null; contacts: { kind: 'email' | 'phone'; value: string }[] };
};
/** Future contract only: no document/request table or portal is provisioned in Etapa08. */
export type CustomerParticipant = {
  role: 'requester' | 'buyer' | 'seller' | 'representative' | 'guardian' | 'other';
  customer_id: string; snapshot_id: string;
  authorization: { status: 'pending' | 'authorized' | 'revoked'; evidence_reference: string | null; decided_by: string | null; decided_at: string | null };
  portal_visibility: 'none';
};
