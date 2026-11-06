import type {PortalRequestCommand,PortalRequestState} from '../../../shared/portalRequests.js';
import {fields,record,uuid} from '../team/validation.js';
import {positive,requestText} from '../requests/validation.js';
const answers=(v:unknown):v is Record<string,string>=>record(v)&&Object.keys(v).length<=80&&Object.entries(v).every(([k,a])=>k.length>0&&k.length<=120&&requestText(a,2000,0,true));
export function validPortalCommand(v:unknown):v is PortalRequestCommand{
 if(!record(v))return false;
 if(v.kind==='remove_file')return fields(v,['kind','file_id'])&&uuid(v.file_id);
 if(v.kind==='hide'||v.kind==='resubmit')return fields(v,['kind']);
 return fields(v,['kind','title','message','inputs'])&&v.kind==='save'&&requestText(v.title,120)&&requestText(v.message,2000,0,true)&&Array.isArray(v.inputs)&&v.inputs.length<=10&&new Set(v.inputs.map(i=>record(i)?i.item_id:null)).size===v.inputs.length&&v.inputs.every(i=>fields(i,['item_id','answers'])&&uuid(i.item_id)&&answers(i.answers));
}
export function portalRequestState(v:unknown):PortalRequestState{
 if(!record(v)||!uuid(v.request_id)||!positive(v.version,2147483646)||!requestText(v.title,120)||!requestText(v.message,2000,0,true)||!requestText(v.reason,500,0,true)||!['can_edit','can_hide','can_resubmit','hidden'].every(k=>typeof v[k]==='boolean')||!Array.isArray(v.inputs)||v.inputs.length>10)throw Error('Invalid portal state');
 const inputs=v.inputs.map(i=>{if(!record(i)||!uuid(i.item_id)||!requestText(i.name,120)||!answers(i.answers)||!Array.isArray(i.fields)||i.fields.length>80)throw Error('Invalid portal input');const fs=i.fields.map(f=>{if(!record(f)||!requestText(f.key,120)||!requestText(f.label,120)||typeof f.required!=='boolean')throw Error('Invalid portal field');return {key:f.key,label:f.label,required:f.required};});return {item_id:i.item_id,name:i.name,answers:{...i.answers},fields:fs};});
 return {request_id:v.request_id,version:v.version,title:v.title,message:v.message,reason:v.reason,can_edit:v.can_edit as boolean,can_hide:v.can_hide as boolean,can_resubmit:v.can_resubmit as boolean,hidden:v.hidden as boolean,inputs};
}
