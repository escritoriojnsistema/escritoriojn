import { uuidPattern } from '../../../shared/access.js';
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
  if(typeof value!=='string' || value.length>20 || !/^[\d.\-\s]+$/.test(value))return false;
  const digits=value.replace(/\D/g,'');
  if(digits.length!==11 || /^(\d)\1{10}$/.test(digits))return false;
  for(const length of [9,10]) {
    let sum=0;for(let i=0;i<length;i++)sum+=Number(digits[i])*(length+1-i);
    const remainder=(sum*10)%11;if(Number(digits[length])!==(remainder===10?0:remainder))return false;
  }
  return true;
}
export function expiry(value:unknown,maxDays:number) {
  if(typeof value!=='string' || value.length>35 || !/^\d{4}-\d{2}-\d{2}T/.test(value))return false;
  const time=Date.parse(value);return Number.isFinite(time) && time>Date.now() && time<=Date.now()+maxDays*86400000;
}
export const email=(value:unknown)=>typeof value==='string' && value.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
