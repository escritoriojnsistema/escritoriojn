import type { CustomerDetail, CustomerPage, CustomerSummary } from '../../../shared/customers.js';
import { record, uuid } from '../team/validation.js';
import { validContact } from './validation.js';

function summary(value: unknown): CustomerSummary {
  if (!record(value) || !uuid(value.id) || (value.kind!=='person' && value.kind!=='company')
    || typeof value.name!=='string' || !value.name.trim() || value.name.length>120
    || typeof value.created_at!=='string' || !Number.isFinite(Date.parse(value.created_at))
    || !(value.identifier_masked===null || (typeof value.identifier_masked==='string'
      && (value.kind==='person'?/^\*{3}\.\*{3}\.\*{3}-\d{2}$/:/^\*{2}\.\*{3}\.\*{3}\/\*{4}-\d{2}$/).test(value.identifier_masked)))) throw new Error('Invalid customer summary');
  return {id:value.id,kind:value.kind as CustomerSummary['kind'],name:value.name,identifier_masked:value.identifier_masked as string|null,created_at:value.created_at};
}
export function customerPage(value: unknown): CustomerPage {
  if (!record(value) || !Array.isArray(value.items) || typeof value.page_size!=='number' || ![3,5].includes(value.page_size)
    || value.items.length>Number(value.page_size) || !Number.isSafeInteger(value.total) || Number(value.total)<0
    || !Number.isInteger(value.page) || Number(value.page)<1 || Number(value.page)>100000) throw new Error('Invalid customer page');
  return {items:value.items.map(summary),total:Number(value.total),page:Number(value.page),page_size:Number(value.page_size)};
}
export function customerDetail(value: unknown): CustomerDetail {
  const base=summary(value);
  if (!record(value) || !(value.identifier===null || (typeof value.identifier==='string' && /^\d{11}(?:\d{3})?$/.test(value.identifier)))
    || !Array.isArray(value.contacts) || value.contacts.length>4 || !value.contacts.every(validContact)
    || !Number.isInteger(value.version) || Number(value.version)<1 || typeof value.can_update!=='boolean') throw new Error('Invalid customer detail');
  return {...base,identifier:value.identifier as string|null,contacts:value.contacts.map(c=>({kind:c.kind,value:c.value})),version:Number(value.version),can_update:value.can_update};
}
