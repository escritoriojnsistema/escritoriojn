export const roles = ['owner','admin','employee','client'] as const;
export type BusinessRole = typeof roles[number];
export type AccessContext = {
  office_id: string; user_id: string; role_code: BusinessRole; permissions: string[];
  office_name: string; display_name: string | null;
};
export type AccessResponse = { data: { user: { id: string }; contexts: AccessContext[] } };
export const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isAccessContext(value: unknown): value is AccessContext {
  if (!value || typeof value!=='object') return false;
  const row=value as Record<string,unknown>;
  return typeof row.office_id==='string' && uuidPattern.test(row.office_id)
    && typeof row.user_id==='string' && uuidPattern.test(row.user_id)
    && roles.includes(row.role_code as BusinessRole)
    && Array.isArray(row.permissions) && row.permissions.length<=100
    && row.permissions.every(p=>typeof p==='string' && p.length<=120)
    && typeof row.office_name==='string' && row.office_name.length<=120
    && (row.display_name===null || (typeof row.display_name==='string' && row.display_name.length<=120));
}
export function isAccessResponse(value: unknown): value is AccessResponse {
  if (!value || typeof value!=='object' || !('data' in value)) return false;
  const data=value.data as AccessResponse['data'] | undefined;
  return !!data?.user && typeof data.user.id==='string' && uuidPattern.test(data.user.id)
    && Array.isArray(data.contexts) && data.contexts.length>0 && data.contexts.length<=100
    && data.contexts.every(row=>isAccessContext(row) && row.user_id===data.user.id
      && row.permissions.includes('foundation.access'));
}
