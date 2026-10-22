import {validCpf} from './identifiers.js';

export const accountPermissions=['accounts.corrections.read','accounts.corrections.apply'] as const;
export type AccountInput={name:string;cpf:string|null;email:string};
export type AccountData=AccountInput&{version:string;cpf_masked:string|null;pending_email:string|null;can_edit:boolean;correction_request_id?:string|null};
export type AccountCorrection={status:'pending'|'applied'|'rejected';before:AccountInput;proposed:AccountInput;applied:AccountInput|null;can_apply:boolean;email_pending:boolean};
export function validAccountInput(value:unknown):value is AccountInput{
 if(!value||typeof value!=='object'||Array.isArray(value))return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).length===3&&Object.keys(v).every(k=>['name','cpf','email'].includes(k))
  &&typeof v.name==='string'&&v.name===v.name.trim()&&v.name.length>=3&&v.name.length<=120&&!/[\u0000-\u001f\u007f]/.test(v.name)
  &&(v.cpf===null||typeof v.cpf==='string'&&/^\d{11}$/.test(v.cpf)&&validCpf(v.cpf))
  &&typeof v.email==='string'&&v.email===v.email.trim().toLowerCase()&&v.email.length<=254&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email);
}
