import { uuidPattern } from './access.js';

export type ServiceCategory = {
  id: string;
  name: string;
  revision: number;
  is_documents: boolean;
  created_at?: string;
  services?: number;
};
export type CategoriesState = { items: ServiceCategory[]; can_manage: boolean };
export type CategoryCommand =
  | { kind: 'create'; name: string; reason: string }
  | { kind: 'rename'; category_id: string; expected_revision: number; name: string; reason: string }
  | { kind: 'delete'; category_id: string; expected_revision: number; reason: string };

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown, max: number): value is string => typeof value === 'string' && value.trim().length > 0 && Array.from(value).length <= max && !/[\u0000-\u001f\u007f]/.test(value);
export const validCategoryName = (value: unknown): value is string => text(value, 60);
export const validCategoryReason = (value: unknown): value is string => text(value, 500);
export function validCategoryCommand(value: unknown): value is CategoryCommand {
  if (!object(value) || !validCategoryReason(value.reason)) return false;
  const keys = value.kind === 'create' ? ['kind', 'name', 'reason']
    : value.kind === 'rename' ? ['kind', 'category_id', 'expected_revision', 'name', 'reason']
    : value.kind === 'delete' ? ['kind', 'category_id', 'expected_revision', 'reason'] : [];
  if (!keys.length || Object.keys(value).length !== keys.length || !keys.every(key => Object.hasOwn(value, key))) return false;
  if (value.kind !== 'delete' && !validCategoryName(value.name)) return false;
  return value.kind === 'create' || (typeof value.category_id === 'string' && uuidPattern.test(value.category_id)
    && Number.isSafeInteger(value.expected_revision) && Number(value.expected_revision) >= 1 && Number(value.expected_revision) <= 2147483645);
}
