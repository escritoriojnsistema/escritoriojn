// Etapa22: organização dos modelos em pastas e vínculo com serviços (preço do modelo).
import {uuidPattern} from './access.js';

export type TemplateFolderLevel = 1 | 2 | 3;
export const templateFolderLevels: Record<TemplateFolderLevel, string> = {1: 'Nível 1 · Super administrador', 2: 'Nível 2 · Administrador', 3: 'Nível 3 · Funcionário'};
export const roleTemplateLevel: Record<'owner' | 'admin' | 'employee', TemplateFolderLevel> = {owner: 1, admin: 2, employee: 3};
export const isTemplateFolderId = (v: unknown): v is string => typeof v === 'string' && uuidPattern.test(v);
export const templateFolderName = (v: unknown): v is string => typeof v === 'string' && v.trim().length >= 1 && Array.from(v.trim()).length <= 80 && !/[\u0000-\u001f\u007f]/.test(v);
export const templateLevel = (v: unknown): v is TemplateFolderLevel => v === 1 || v === 2 || v === 3;

export type TemplateFolderSummary = {id: string; name: string; level: TemplateFolderLevel; templates_count: number};
export type TemplateFoldersPage = {items: TemplateFolderSummary[]; total: number; page: number; page_size: number};
export type TemplateLinkedService = {id: string; code: string; name: string; version_id: string; price_cents: number};
export type TemplateSearchItem = {id: string; code: string; name: string; kind: string; demonstration: boolean; latest_version: number; current_version: number | null; folder_id: string | null; folder_name: string | null; service: TemplateLinkedService | null};
export type TemplateSearchPage = {items: TemplateSearchItem[]; total: number; page: number; page_size: number};

const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const int = (v: unknown, min = 0, max = 2147483646): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= min && v <= max;
const text = (v: unknown, max: number): v is string => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f\u007f]/.test(v);
const isoTime = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(v) && Number.isFinite(Date.parse(v));

export function validFolderSummary(v: unknown): v is TemplateFolderSummary {
  return object(v) && uuidPattern.test(String(v.id)) && templateFolderName(v.name) && templateLevel(v.level) && int(v.templates_count);
}
export function validFoldersPage(v: unknown): v is TemplateFoldersPage {
  return object(v) && int(v.total) && int(v.page, 1, 100000) && [3, 5].includes(Number(v.page_size)) && Array.isArray(v.items) && v.items.length <= Number(v.page_size) && v.items.every(validFolderSummary);
}
export function validLinkedService(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  return object(v) && uuidPattern.test(String(v.id)) && typeof v.code === 'string' && /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(v.code) && text(v.name, 120) && uuidPattern.test(String(v.version_id)) && int(v.price_cents, 0, 100000000);
}
export function validSearchItem(v: unknown): v is TemplateSearchItem {
  return object(v) && uuidPattern.test(String(v.id)) && typeof v.code === 'string' && /^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(v.code) && text(v.name, 120) && ['contract', 'declaration', 'application', 'official_letter'].includes(String(v.kind)) && typeof v.demonstration === 'boolean' && int(v.latest_version, 1) && (v.current_version === null || int(v.current_version, 1)) && (v.folder_id === null || uuidPattern.test(String(v.folder_id))) && (v.folder_name === null || text(v.folder_name, 80)) && validLinkedService(v.service);
}
export function validSearchPage(v: unknown): v is TemplateSearchPage {
  return object(v) && int(v.total) && int(v.page, 1, 100000) && [3, 5].includes(Number(v.page_size)) && Array.isArray(v.items) && v.items.length <= Number(v.page_size) && v.items.every(validSearchItem);
}
export function validDetailExtras(v: unknown): {folder_id: string | null; service: TemplateLinkedService | null} {
  if (!object(v) || !(v.folder_id === null || uuidPattern.test(String(v.folder_id)))) throw Error('Invalid template folder');
  if (!validLinkedService(v.service)) throw Error('Invalid template service');
  return {folder_id: v.folder_id as string | null, service: (v.service ?? null) as TemplateLinkedService | null};
}
export const folderMutationKeys = ['office_id', 'folder_id', 'name', 'level', 'expected_version', 'reason', 'idempotency_key'] as const;
export const linkMutationKeys = ['office_id', 'template_id', 'service_id', 'folder_id', 'expected_version', 'reason', 'idempotency_key'] as const;
export function validFolderMutation(body: unknown): body is {office_id: string; folder_id: string | null; name: string; level: TemplateFolderLevel; expected_version: number; reason: string; idempotency_key: string} {
  return object(body) && Object.keys(body).length === folderMutationKeys.length && folderMutationKeys.every(k => Object.hasOwn(body, k))
    && uuidPattern.test(String(body.office_id)) && (body.folder_id === null || uuidPattern.test(String(body.folder_id)))
    && templateFolderName(body.name) && templateLevel(body.level) && int(body.expected_version, 0, 2147483645)
    && text(body.reason, 500) && String(body.reason).trim().length > 0 && uuidPattern.test(String(body.idempotency_key));
}
export function validLinkMutation(body: unknown): body is {office_id: string; template_id: string; service_id: string | null; folder_id: string | null; expected_version: number; reason: string; idempotency_key: string} {
  return object(body) && Object.keys(body).length === linkMutationKeys.length && linkMutationKeys.every(k => Object.hasOwn(body, k))
    && uuidPattern.test(String(body.office_id)) && uuidPattern.test(String(body.template_id))
    && (body.service_id === null || uuidPattern.test(String(body.service_id))) && (body.folder_id === null || uuidPattern.test(String(body.folder_id)))
    && int(body.expected_version, 1, 2147483646) && text(body.reason, 500) && String(body.reason).trim().length > 0 && uuidPattern.test(String(body.idempotency_key));
}
export const templateMoney = (cents: number): string => new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'}).format(cents / 100);
export {isoTime};
