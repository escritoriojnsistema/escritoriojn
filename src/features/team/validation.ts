import { uuidPattern } from '../../../shared/access';
import type { TeamScope } from '../../../shared/team';
export function validCpf(value: string) {
  if (!/^[\d.\-\s]+$/.test(value)) return false;
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  for (const length of [9, 10]) {
    let sum = 0;
    for (let index = 0; index < length; index++) sum += Number(digits[index]) * (length + 1 - index);
    const remainder = (sum * 10) % 11;
    if (Number(digits[length]) !== (remainder === 10 ? 0 : remainder)) return false;
  }
  return true;
}
export function validFullName(value: string) {
  const name = value.trim();
  return name.length <= 120 && /^[\p{L}][\p{L}\p{M}'’-]+(?:\s+[\p{L}][\p{L}\p{M}'’-]*)+$/u.test(name);
}
export function invitationRoles(scope: TeamScope) { return scope.allowed_roles.filter(role => role !== 'owner' || scope.can_create_owner); }
export function invitationLink(origin: string, id: string): string {
  if (!uuidPattern.test(id)) throw new Error('Invalid invitation');
  return `${new URL(origin).origin}/convite?id=${encodeURIComponent(id)}`;
}
