import type {AccountData,AccountCorrection,AccountInput} from '../../../shared/account.js';
import {validAccountInput} from '../../../shared/account.js';
import {uuid,record} from '../team/validation.js';
function input(v:unknown):AccountInput{
 if(!record(v))throw Error('Invalid account');
 const result={name:v.name,cpf:v.cpf,email:v.email};
 if(typeof v.name!=='string'||!v.name.trim()||v.name.length>120||/[\u0000-\u001f\u007f]/.test(v.name)||!validAccountInput({...result,name:'Validação'}))throw Error('Invalid account');
 return result as AccountInput;
}
export function accountData(v:unknown):AccountData{
 if(!record(v)||typeof v.version!=='string'||!/^[a-f0-9]{64}$/.test(v.version)||typeof v.can_edit!=='boolean'
  ||!(v.cpf_masked===null||typeof v.cpf_masked==='string'&&/^\*{3}\.\*{3}\.\*{3}-\d{2}$/.test(v.cpf_masked))
  ||!(v.pending_email===null||typeof v.pending_email==='string'&&validAccountInput({name:'Validação',cpf:null,email:v.pending_email})))throw Error('Invalid account data');
 if(v.correction_request_id!==undefined&&v.correction_request_id!==null&&!uuid(v.correction_request_id))throw Error('Invalid own correction');
 return {...(v.correction_request_id===undefined?{}:{correction_request_id:v.correction_request_id as string|null}),...input(v),version:v.version,can_edit:v.can_edit,cpf_masked:v.cpf_masked,pending_email:v.pending_email};
}
export function accountCorrection(v:unknown):AccountCorrection{
 if(!record(v)||!['pending','applied','rejected'].includes(String(v.status))||typeof v.can_apply!=='boolean'||typeof v.email_pending!=='boolean')throw Error('Invalid correction');
 return {status:v.status as AccountCorrection['status'],before:input(v.before),proposed:input(v.proposed),applied:v.applied===null?null:input(v.applied),can_apply:v.can_apply,email_pending:v.email_pending};
}
