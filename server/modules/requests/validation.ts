import type {CreateRequestInput,RequestItemInput,RequestMutation} from '../../../shared/requests.js';
import {requestStatuses} from '../../../shared/requests.js';
import {validAdjustment} from '../../../shared/services.js';
import {fields,record,uuid} from '../team/validation.js';

export const requestText=(v:unknown,max:number,min=1,multiline=false):v is string=>typeof v==='string' && v.length<=max && v.trim().length>=min && !(multiline?/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/:/[\u0000-\u001f\u007f]/).test(v);
export const positive=(v:unknown,max=100000):v is number=>Number.isSafeInteger(v) && Number(v)>=1 && Number(v)<=max;
export const requestStatus=(v:unknown)=>typeof v==='string' && (requestStatuses as readonly string[]).includes(v);
const unique=(v:unknown,max:number,valid:(x:unknown)=>boolean):v is unknown[]=>Array.isArray(v) && v.length<=max && new Set(v).size===v.length && v.every(valid);
export function validRequestItem(v:unknown):v is RequestItemInput {
 return fields(v,['service_id','quantity','adjustment','fields','participant_ids','checklist']) && uuid(v.service_id) && positive(v.quantity)
  && validAdjustment(v.adjustment) && record(v.fields) && Object.keys(v.fields).length<=12
  && Object.entries(v.fields).every(([k,x])=>/^[a-z][a-z0-9_]{0,31}$/.test(k) && requestText(x,500,0))
  && unique(v.participant_ids,20,uuid) && unique(v.checklist,12,x=>requestText(x,120));
}
export const validRequestItems=(v:unknown):v is RequestItemInput[]=>Array.isArray(v) && v.length>=1 && v.length<=10 && v.every(validRequestItem);
export function validCreateRequest(v:unknown):v is CreateRequestInput {
 if(!record(v))return false;
 if(v.origin==='portal')return fields(v,['origin','title','message']) && requestText(v.title,120) && requestText(v.message,2000,1,true);
 return fields(v,['origin','title','customer_id','assignee_id','priority','priority_reason','items','internal_note'])
  && ['presencial','whatsapp'].includes(String(v.origin)) && requestText(v.title,120)
  && (v.customer_id===null||uuid(v.customer_id)) && (v.assignee_id===null||uuid(v.assignee_id))
  && ['normal','urgent'].includes(String(v.priority)) && requestText(v.priority_reason,500,v.priority==='urgent'?1:0)
  && (v.priority!=='normal'||v.priority_reason==='') && validRequestItems(v.items) && requestText(v.internal_note,2000,0,true);
}
export function validRequestMutation(v:unknown):v is RequestMutation {
 if(!record(v))return false;
 if(v.kind==='reclaim')return fields(v,['kind','reason']) && requestText(v.reason,500);
 if(v.kind==='note')return fields(v,['kind','note']) && requestText(v.note,2000,1,true);
 if(v.kind==='transfer')return fields(v,['kind','assignee_id','reason']) && uuid(v.assignee_id) && requestText(v.reason,500);
 if(v.kind==='triage')return fields(v,['kind','customer_id','items','reason']) && (v.customer_id===null||uuid(v.customer_id)) && validRequestItems(v.items) && requestText(v.reason,500);
 if(v.kind!=='status'||!requestStatus(v.status)||!requestText(v.reason,500))return false;
 if(v.status!=='cancelado')return fields(v,['kind','status','reason']);
 return fields(v,['kind','status','reason','cancellation_review']) && fields(v.cancellation_review,['charges_reviewed','refunds_reviewed','deliveries_reviewed','external_reviewed'])
  && Object.values(v.cancellation_review).every(x=>x===true);
}
