import type { CategoriesState, ServiceCategory } from '../../../shared/categories.js';
import { validCategoryName } from '../../../shared/categories.js';
import { record, uuid } from '../team/validation.js';

export function categoriesState(value: unknown): CategoriesState {
  if (!record(value) || !Array.isArray(value.items) || typeof value.can_manage !== 'boolean') throw Error('Invalid categories state');
  const ids = new Set<string>();
  const items: ServiceCategory[] = value.items.map(item => {
    if (!record(item) || !uuid(item.id) || ids.has(item.id) || !validCategoryName(item.name)
      || !Number.isSafeInteger(item.revision) || Number(item.revision) < 1 || Number(item.revision) > 2147483646
      || typeof item.is_documents !== 'boolean') throw Error('Invalid category');
    ids.add(item.id);
    const category: ServiceCategory = { id: item.id, name: item.name, revision: Number(item.revision), is_documents: item.is_documents };
    if (value.can_manage) {
      if (typeof item.created_at !== 'string' || item.created_at.length > 40 || !Number.isFinite(Date.parse(item.created_at))
        || !Number.isSafeInteger(item.services) || Number(item.services) < 0) throw Error('Invalid category management metadata');
      category.created_at = item.created_at;
      category.services = Number(item.services);
    }
    return category;
  });
  return { items, can_manage: value.can_manage };
}
