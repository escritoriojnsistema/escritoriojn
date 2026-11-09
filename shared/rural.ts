import {documentObject as object,documentUuid as uuid} from './documents.js';
export const ruralRoles={holder:'Titular',taxpayer:'Contribuinte',representative:'Representante'};
export type RuralProperty={id:string;customer_id:string;name:string;municipality:string;state:string;location:string;identifiers:Record<string,string>;version:number};
export type RuralDetail={page:number;parties_total:number;records_total:number;property:RuralProperty;parties:{id:string;customer_id:string;name:string;role:keyof typeof ruralRoles;valid_from:string;valid_until:string|null}[];records:{id:string;request_id:string;file_id:string|null;exercise:number|null}[]};
export type RuralPage={items:Pick<RuralProperty,'id'|'name'|'municipality'|'state'|'version'>[];page:number;page_size:5};
export function ruralResult(v:unknown){if(!object(v)||!uuid(v.id))throw Error('Invalid rural result');return {id:v.id};}
const string=(v:unknown,max=120):v is string=>typeof v==='string'&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min;
export function ruralState(v:unknown):RuralPage|RuralDetail{
 if(!object(v)||!integer(v.page,1))throw Error('Invalid rural state');
 if(!('property'in v)){
 if(!Array.isArray(v.items)||v.items.length>5||v.page_size!==5)throw Error('Invalid rural page');
 return {page:v.page,page_size:5,items:v.items.map(p=>{if(!object(p)||!uuid(p.id)||!string(p.name)||!string(p.municipality)||!string(p.state,2)||!integer(p.version,1))throw Error('Invalid property');return {id:p.id,name:p.name,municipality:p.municipality,state:p.state,version:p.version};})};
 }
 const p=v.property;if(!object(p)||!uuid(p.id)||!uuid(p.customer_id)||!string(p.name)||!string(p.municipality)||!string(p.state,2)||!string(p.location,500)||!integer(p.version,1)||!object(p.identifiers)||!Array.isArray(v.parties)||v.parties.length>5||!Array.isArray(v.records)||v.records.length>5||!integer(v.parties_total)||!integer(v.records_total))throw Error('Invalid rural detail');
 const identifiers:Record<string,string>={};for(const[k,x]of Object.entries(p.identifiers)){if(!['cafir','sncr','car','registry'].includes(k)||!string(x))throw Error('Invalid identifier');identifiers[k]=x;}
 return {page:v.page,parties_total:v.parties_total,records_total:v.records_total,property:{id:p.id,customer_id:p.customer_id,name:p.name,municipality:p.municipality,state:p.state,location:p.location,identifiers,version:p.version},parties:v.parties.map(a=>{if(!object(a)||!uuid(a.id)||!uuid(a.customer_id)||!string(a.name)||typeof a.role!=='string'||!Object.hasOwn(ruralRoles,a.role)||!string(a.valid_from,10)||!(a.valid_until===null||string(a.valid_until,10)))throw Error('Invalid rural party');return {id:a.id,customer_id:a.customer_id,name:a.name,role:a.role as keyof typeof ruralRoles,valid_from:a.valid_from,valid_until:a.valid_until};}),records:v.records.map(a=>{if(!object(a)||!uuid(a.id)||!uuid(a.request_id)||!(a.file_id===null||uuid(a.file_id))||!(a.exercise===null||integer(a.exercise,1900)&&a.exercise<=2200))throw Error('Invalid rural record');return {id:a.id,request_id:a.request_id,file_id:a.file_id,exercise:a.exercise};})};
}
