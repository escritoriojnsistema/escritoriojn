import type { Assignment, CustomerMergeHistory, CustomerMergePreview, CustomerMergeResult, CustomerRelationCandidates, CustomerRelationsState, RelationBase, Representation, VerifiedIdentity } from '../../../shared/customerRelations.js';
import { relationLimits } from '../../../shared/customerRelations.js';
import type { CustomerSummary } from '../../../shared/customers.js';
import { record, uuid } from '../team/validation.js';
import { evidence, period, text, timestamp } from './validation.js';

function requireValid(valid: unknown): asserts valid { if (!valid) throw new Error('Invalid customer relations DTO'); }
const dtoVersion = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 2147483647;
const masked = (v: unknown, kind?: unknown): v is string | null => v === null || (typeof v === 'string' &&
  (kind === 'person' ? /^\*{3}\.\*{3}\.\*{3}-\d{2}$/ : kind === 'company' ? /^\*{2}\.\*{3}\.\*{3}\/\*{4}-\d{2}$/ : /^(?:\*{3}\.\*{3}\.\*{3}-\d{2}|\*{2}\.\*{3}\.\*{3}\/\*{4}-\d{2})$/).test(v));
function summary(v: unknown): CustomerSummary & { version: number } {
  requireValid(record(v) && uuid(v.id) && (v.kind === 'person' || v.kind === 'company') && text(v.name, 120) && masked(v.identifier_masked, v.kind) && timestamp(v.created_at) && dtoVersion(v.version));
  const origin = v.source !== undefined || v.association_status !== undefined;
  requireValid(!origin || (v.source === 'client_registration' && v.association_status === 'pending'));
  return { id: v.id, kind: v.kind, name: v.name, identifier_masked: v.identifier_masked, created_at: v.created_at, version: v.version,
    ...(origin ? { source: 'client_registration', association_status: 'pending' } as const : {}) };
}
function base(v: unknown): RelationBase & { name: string } {
  requireValid(record(v) && uuid(v.id) && dtoVersion(v.version) && timestamp(v.created_at) && uuid(v.created_by) && text(v.name, 120)
    && (v.revoked_at === null || timestamp(v.revoked_at)) && (v.revoked_by === null || uuid(v.revoked_by)) && ((v.revoked_at === null) === (v.revoked_by === null)));
  return { id: v.id, version: v.version, created_at: v.created_at, created_by: v.created_by, revoked_at: v.revoked_at, revoked_by: v.revoked_by, name: v.name };
}
const statuses = ['active', 'future', 'expired', 'revoked', 'unavailable'];
function assignment(v: unknown): Assignment {
  const common = base(v);
  requireValid(record(v) && uuid(v.membership_id) && timestamp(v.valid_from) && (v.valid_until === null || timestamp(v.valid_until)) && period(v)
    && typeof v.status === 'string' && statuses.includes(v.status));
  return { ...common, membership_id: v.membership_id, valid_from: v.valid_from, valid_until: v.valid_until, status: v.status as Assignment['status'] };
}
function representation(v: unknown): Representation {
  const common = base(v);
  requireValid(record(v) && uuid(v.representative_customer_id) && typeof v.kind === 'string' && ['proxy', 'representative', 'guardian'].includes(v.kind)
    && evidence(v.evidence) && timestamp(v.valid_from) && (v.valid_until === null || timestamp(v.valid_until)) && period(v)
    && typeof v.status === 'string' && statuses.includes(v.status) && v.authorization_status === (v.status === 'active' ? 'valid' : 'invalid') && v.grants_customer_access === false && v.portal_enabled === false);
  return { ...common, representative_customer_id: v.representative_customer_id, kind: v.kind as Representation['kind'], evidence: v.evidence,
    valid_from: v.valid_from, valid_until: v.valid_until, status: v.status as Representation['status'], authorization_status: v.status === 'active' ? 'valid' : 'invalid',
    grants_customer_access: false, portal_enabled: false };
}
function identity(v: unknown): VerifiedIdentity {
  const common = base(v);
  requireValid(record(v) && uuid(v.membership_id) && evidence(v.evidence) && typeof v.status === 'string' && ['verified', 'revoked', 'unavailable'].includes(v.status) && v.portal_enabled === false);
  return { ...common, membership_id: v.membership_id, evidence: v.evidence, status: v.status as VerifiedIdentity['status'], portal_enabled: false };
}
function history(v: unknown): CustomerMergeHistory {
  requireValid(record(v) && uuid(v.id) && uuid(v.source_id) && uuid(v.target_id) && uuid(v.source_snapshot_id) && uuid(v.target_snapshot_id) && uuid(v.result_snapshot_id) && timestamp(v.created_at) && uuid(v.actor_id));
  return { id: v.id, source_id: v.source_id, target_id: v.target_id, source_snapshot_id: v.source_snapshot_id, target_snapshot_id: v.target_snapshot_id, result_snapshot_id: v.result_snapshot_id, created_at: v.created_at, actor_id: v.actor_id };
}
function collection<T>(v: unknown, decode: (value: unknown) => T): T[] {
  requireValid(Array.isArray(v) && v.length <= relationLimits.history);
  return v.map(decode);
}
export function relationsState(v: unknown): CustomerRelationsState {
  requireValid(record(v) && record(v.capabilities) && record(v.truncated) && v.portal_enabled === false && typeof v.access_lost === 'boolean');
  const c = v.capabilities, t = v.truncated;
  requireValid(typeof c.can_relate === 'boolean' && typeof c.can_verify === 'boolean' && typeof c.can_merge === 'boolean'
    && typeof t.assignments === 'boolean' && typeof t.representations === 'boolean' && typeof t.identities === 'boolean' && typeof t.merges === 'boolean');
  const result: CustomerRelationsState = { customer: summary(v.customer), capabilities: { can_relate: c.can_relate, can_verify: c.can_verify, can_merge: c.can_merge },
    assignments: collection(v.assignments, assignment), representations: collection(v.representations, representation), identities: collection(v.identities, identity), merges: collection(v.merges, history),
    truncated: { assignments: t.assignments, representations: t.representations, identities: t.identities, merges: t.merges }, portal_enabled: false, access_lost: v.access_lost };
  if (result.access_lost) requireValid(!Object.values(result.capabilities).some(Boolean) && !Object.values(result.truncated).some(Boolean)
    && !result.assignments.length && !result.representations.length && !result.identities.length && !result.merges.length);
  return result;
}
export function relationCandidates(v: unknown): CustomerRelationCandidates {
  requireValid(record(v) && (v.kind === 'team' || v.kind === 'client' || v.kind === 'customers') && v.limit === relationLimits.candidates && Array.isArray(v.items) && v.items.length <= relationLimits.candidates);
  const kind = v.kind;
  const items = v.items.map((item: unknown) => {
    requireValid(record(item) && uuid(item.id) && text(item.name, 120));
    if (kind === 'customers') requireValid((item.kind === 'person' || item.kind === 'company') && item.contact_masked === null && masked(item.identifier_masked, item.kind));
    else requireValid((kind === 'client' ? item.kind === 'client' : ['owner', 'admin', 'employee'].includes(String(item.kind))) && item.identifier_masked === null
      && (item.contact_masked === null || (typeof item.contact_masked === 'string' && /^[^\s@\u0000-\u001f\u007f-\u009f]\*{3}@\*{3}$/u.test(item.contact_masked))));
    return { id: item.id, name: item.name, kind: item.kind as CustomerRelationCandidates['items'][number]['kind'], contact_masked: item.contact_masked as string | null, identifier_masked: item.identifier_masked as string | null };
  });
  return { kind, items, limit: relationLimits.candidates };
}
export function mergePreview(v: unknown): CustomerMergePreview {
  requireValid(record(v) && record(v.expected) && Array.isArray(v.conflicts) && v.conflicts.length <= 5 && new Set(v.conflicts).size === v.conflicts.length
    && v.conflicts.every((x: unknown) => typeof x === 'string' && ['same_customer', 'kind', 'identifier', 'contacts', 'identity'].includes(x))
    && typeof v.can_merge === 'boolean' && v.can_merge === (v.conflicts.length === 0) && v.portal_enabled === false);
  const source = summary(v.source), target = summary(v.target), e = v.expected;
  requireValid(e.name === target.name && e.kind === target.kind && masked(e.identifier_masked) && typeof e.contact_count === 'number' && Number.isInteger(e.contact_count)
    && e.contact_count >= 0 && e.contact_count <= relationLimits.contacts * 2 && typeof e.copies_identifier === 'boolean' && e.transfers_authority === false);
  return { source, target, expected: { name: target.name, kind: target.kind, identifier_masked: e.identifier_masked, contact_count: e.contact_count, copies_identifier: e.copies_identifier, transfers_authority: false },
    conflicts: v.conflicts as CustomerMergePreview['conflicts'], can_merge: v.can_merge, portal_enabled: false };
}
export function mergeResult(v: unknown): CustomerMergeResult {
  requireValid(record(v) && uuid(v.merge_id) && uuid(v.source_id) && uuid(v.target_id) && v.source_id !== v.target_id && dtoVersion(v.target_version));
  const state = relationsState(v.state);
  requireValid(state.customer.id === v.target_id && state.customer.version === v.target_version && !state.access_lost);
  return { merge_id: v.merge_id, source_id: v.source_id, target_id: v.target_id, target_version: v.target_version, state };
}
