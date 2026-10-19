import type { CustomerContact, CustomerInput } from '../../../shared/customers.js';
import { validCpf, validCnpj } from '../../../shared/identifiers.js';
import { fields } from '../team/validation.js';

export function validContact(value: unknown): value is CustomerContact {
  if (!fields(value, ['kind', 'value']) || typeof value.value !== 'string') return false;
  const text=value.value.trim();
  if (value.kind==='email') return text.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text);
  if (value.kind!=='phone' || text.length>25 || !/^[\d()+\s-]+$/.test(text)) return false;
  return /^(?:\d{10,11}|55\d{10,11})$/.test(text.replace(/\D/g,''));
}
export function validCustomer(value: unknown): value is CustomerInput {
  if (!fields(value, ['kind','name','identifier','contacts']) || (value.kind!=='person' && value.kind!=='company')
    || typeof value.name!=='string' || !value.name.trim() || value.name.trim().length>120
    || typeof value.identifier!=='string' || value.identifier.length>18
    || !Array.isArray(value.contacts) || value.contacts.length>4 || !value.contacts.every(validContact)) return false;
  if (value.identifier!=='' && !(value.kind==='person' ? validCpf(value.identifier) : validCnpj(value.identifier))) return false;
  const normalized=value.contacts.map(c=>`${c.kind}:${c.kind==='email'?c.value.trim().toLowerCase():c.value.replace(/\D/g,'')}`);
  return new Set(normalized).size===normalized.length;
}
