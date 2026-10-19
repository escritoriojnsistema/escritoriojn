import { uuidPattern } from '../../../shared/access';
import type { TeamScope } from '../../../shared/team';
export { validCpf } from '../../../shared/identifiers';
export function validFullName(value: string) {
  const name = value.trim();
  return name.length <= 120 && /^[\p{L}][\p{L}\p{M}'’-]+(?:\s+[\p{L}][\p{L}\p{M}'’-]*)+$/u.test(name);
}
export function invitationRoles(scope: TeamScope) { return scope.allowed_roles.filter(role => role !== 'owner' || scope.can_create_owner); }
export function invitationLink(origin: string, id: string): string {
  if (!uuidPattern.test(id)) throw new Error('Invalid invitation');
  return `${new URL(origin).origin}/convite?id=${encodeURIComponent(id)}`;
}
