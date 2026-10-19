import { uuidPattern } from '../../../shared/access.js';
import { validCpf } from '../../../shared/identifiers.js';
import { assignablePermissions, teamRoles } from '../../../shared/team.js';

export const uuid=(value:unknown):value is string=>typeof value==='string' && uuidPattern.test(value);
export const record=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);
export function fields(value:unknown,keys:string[]):value is Record<string,unknown> {
  return record(value) && Object.keys(value).length===keys.length && keys.every(key=>Object.hasOwn(value,key));
}
export const role=(value:unknown)=>typeof value==='string' && (teamRoles as readonly string[]).includes(value);
export function list(value:unknown,allowed:readonly string[]) {
  return Array.isArray(value) && value.length<=allowed.length && new Set(value).size===value.length
    && value.every(item=>typeof item==='string' && allowed.includes(item));
}
export const permissions=(value:unknown)=>list(value,assignablePermissions) && (value as string[]).includes('foundation.access');
export function fullName(value:unknown) {
  return typeof value==='string' && value.trim().length<=120
    && /^[\p{L}][\p{L}\p{M}'’-]+(?:\s+[\p{L}][\p{L}\p{M}'’-]*)+$/u.test(value.trim());
}
export function cpf(value:unknown) {
  return typeof value==='string' && validCpf(value);
}
export function expiry(value:unknown,maxDays:number) {
  if(typeof value!=='string' || value.length>35 || !/^\d{4}-\d{2}-\d{2}T/.test(value))return false;
  const time=Date.parse(value);return Number.isFinite(time) && time>Date.now() && time<=Date.now()+maxDays*86400000;
}
export const email=(value:unknown)=>typeof value==='string' && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
