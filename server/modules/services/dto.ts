import { serviceKeys, validService, validAdjustment, validServiceReason, type ServiceVersion, type ServiceSummary, type ServicePage, type ServiceDetail, type ServiceQuote } from '../../../shared/services.js';
import { record, uuid } from '../team/validation.js';
const int=(v:unknown,min=0,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v) && Number(v)>=min && Number(v)<=max;
const time=(v:unknown):v is string=>typeof v==='string' && v.length<=40 && Number.isFinite(Date.parse(v));
function version(value:unknown):ServiceVersion {
  if(!record(value)||!uuid(value.id)||!uuid(value.created_by)||!int(value.number,1,2147483646)||!time(value.created_at)||!time(value.effective_from)||!validServiceReason(value.reason))throw Error('Invalid service version');
  const input=Object.fromEntries(serviceKeys.map(k=>[k,k==='effective_from'?new Date(value.effective_from as string).toISOString():value[k]]));
  if(!validService(input))throw Error('Invalid service definition');
  return {...input,fields:input.fields.map(f=>({key:f.key,label:f.label,type:f.type,required:f.required})),checklist:[...input.checklist],required_capabilities:[...input.required_capabilities],id:value.id,number:Number(value.number),created_at:value.created_at,created_by:value.created_by,reason:value.reason};
}
function summary(v:unknown):ServiceSummary {
  if(!record(v)||!uuid(v.id)||typeof v.code!=='string'||!/^[A-Z0-9][A-Z0-9_-]{1,31}$/.test(v.code)||typeof v.name!=='string'||v.name.length>120||typeof v.category!=='string'||v.category.length>60||typeof v.unit!=='string'||v.unit.length>30||!int(v.price_cents,0,100000000)||!int(v.version,1,2147483646)||!time(v.effective_from))throw Error('Invalid service summary');
  return {id:v.id,code:v.code,name:v.name,category:v.category,unit:v.unit,price_cents:Number(v.price_cents),version:Number(v.version),effective_from:v.effective_from};
}
export function servicePage(v:unknown):ServicePage {
  if(!record(v)||!Array.isArray(v.items)||![3,5].includes(Number(v.page_size))||!int(v.page_size)||v.items.length>Number(v.page_size)||!int(v.total)||!int(v.page,1,100000))throw Error('Invalid service page');
  return {items:v.items.map(summary),total:Number(v.total),page:Number(v.page),page_size:Number(v.page_size)};
}
export function serviceDetail(v:unknown):ServiceDetail {
  if(!record(v)||!uuid(v.id)||typeof v.code!=='string'||!int(v.latest_version,1,2147483646)||typeof v.can_manage!=='boolean'||!Array.isArray(v.versions)||v.versions.length>3||!int(v.history_page,1,100000)||!int(v.history_total,1)||v.history_total!==v.latest_version)throw Error('Invalid service detail');
  const current=v.current===null?null:version(v.current), versions=v.versions.map(version);
  if((current&&current.code!==v.code)||versions.some(x=>x.code!==v.code||x.number>Number(v.latest_version)))throw Error('Invalid version identity');
  return {id:v.id,code:v.code,latest_version:Number(v.latest_version),can_manage:v.can_manage,current,versions,history_page:Number(v.history_page),history_total:Number(v.history_total)};
}
export function serviceQuote(v:unknown):ServiceQuote {
  if(!record(v)||!uuid(v.service_id)||!uuid(v.version_id)||!int(v.version,1)||!time(v.effective_from)||!time(v.quoted_at)||!validService(v.definition)||!validAdjustment(v.adjustment)||!int(v.quantity,1,100000)||!int(v.unit_price_cents,0,100000000)||!int(v.base_cents,0,10000000000000)||!int(v.total_cents,0,20000000000000))throw Error('Invalid service quote');
  return {service_id:v.service_id,version_id:v.version_id,version:Number(v.version),effective_from:v.effective_from,quoted_at:v.quoted_at,definition:v.definition,quantity:Number(v.quantity),unit_price_cents:Number(v.unit_price_cents),base_cents:Number(v.base_cents),total_cents:Number(v.total_cents),adjustment:{kind:v.adjustment.kind,value:v.adjustment.value,reason:v.adjustment.reason}};
}
