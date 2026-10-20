import type { CustomerRelationCommand, CustomerRelationCandidatesRequest, CustomerRelationsRequest, CustomerMergePreviewRequest, CustomerMergeRequest } from '../../../shared/customerRelations.js';
import { relationLimits } from '../../../shared/customerRelations.js';
import { fields, uuid } from '../team/validation.js';

const controls = /[\u0000-\u001f\u007f-\u009f]/u;
export const text = (value: unknown, max: number): value is string => typeof value === 'string' && !!value.trim() && Array.from(value).length <= max && !controls.test(value);
export const evidence = (value: unknown): value is string => typeof value === 'string' && text(value.trim(), relationLimits.evidence) && !controls.test(value);
export const version = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 2147483646;

/** Validate calendar fields before parsing: Date.parse silently rolls February 30 forward. */
export function timestampMicros(value: unknown): bigint | null {
  if (typeof value !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, fraction = '', zone] = m;
  const year = Number(y), month = Number(mo), day = Number(d);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1] || Number(h) > 23 || Number(mi) > 59 || Number(s) > 59) return null;
  if (zone !== 'Z' && (Number(zone.slice(1, 3)) > 23 || Number(zone.slice(4)) > 59)) return null;
  const millis = Date.parse(`${y}-${mo}-${d}T${h}:${mi}:${s}${zone}`);
  return Number.isFinite(millis) ? BigInt(millis) * 1000n + BigInt(fraction.padEnd(6, '0')) : null;
}
export const timestamp = (value: unknown): value is string => timestampMicros(value) !== null;
export function period(value: { valid_from?: unknown; valid_until?: unknown }): boolean {
  const start = timestampMicros(value.valid_from);
  const end = value.valid_until === null ? null : timestampMicros(value.valid_until);
  return start !== null && (value.valid_until === null || (end !== null && end > start));
}
export function relationsRequest(value: unknown): value is CustomerRelationsRequest {
  return fields(value, ['office_id', 'customer_id']) && uuid(value.office_id) && uuid(value.customer_id);
}
export function candidatesRequest(value: unknown): value is CustomerRelationCandidatesRequest {
  return fields(value, ['office_id', 'kind', 'query']) && uuid(value.office_id) && ['team', 'client', 'customers'].includes(String(value.kind))
    && typeof value.kind === 'string' && typeof value.query === 'string' && Array.from(value.query).length <= relationLimits.query && !controls.test(value.query);
}
export function commandRequest(value: unknown): value is CustomerRelationCommand {
  if (!fields(value, ['office_id', 'customer_id', 'action', 'payload']) || !uuid(value.office_id) || !uuid(value.customer_id)) return false;
  const p = value.payload;
  switch (value.action) {
    case 'assignment.grant': return fields(p, ['membership_id', 'valid_from', 'valid_until']) && uuid(p.membership_id) && period(p);
    case 'representation.grant': return fields(p, ['representative_customer_id', 'kind', 'evidence', 'valid_from', 'valid_until'])
      && uuid(p.representative_customer_id) && p.representative_customer_id.toLowerCase() !== value.customer_id.toLowerCase()
      && typeof p.kind === 'string' && ['proxy', 'representative', 'guardian'].includes(p.kind) && evidence(p.evidence) && period(p);
    case 'identity.verify': return fields(p, ['membership_id', 'evidence']) && uuid(p.membership_id) && evidence(p.evidence);
    case 'assignment.revoke': case 'representation.revoke': case 'identity.revoke': return fields(p, ['id', 'version']) && uuid(p.id) && version(p.version);
    default: return false;
  }
}
export function previewRequest(value: unknown): value is CustomerMergePreviewRequest {
  return fields(value, ['office_id', 'source_id', 'target_id']) && uuid(value.office_id) && uuid(value.source_id) && uuid(value.target_id);
}
export function mergeRequest(value: unknown): value is CustomerMergeRequest {
  return fields(value, ['office_id', 'source_id', 'target_id', 'source_version', 'target_version', 'evidence', 'confirm'])
    && uuid(value.office_id) && uuid(value.source_id) && uuid(value.target_id) && version(value.source_version) && version(value.target_version) && evidence(value.evidence) && value.confirm === true;
}
