export const checklistPermissions=['checklists.read','checklists.manage','checklists.update','checklists.waive'] as const;
export const checklistStates=['pendente','recebido','validado','dispensado'] as const;
export type ChecklistState=typeof checklistStates[number];
export const checklistStateNames:Record<ChecklistState,string>={pendente:'Pendente',recebido:'Recebido',validado:'Validado',dispensado:'Dispensado'};
export type ChecklistRule={key:string;label:string;requirement:'required'|'optional'|'conditional';condition:null|{field:'origin'|'priority';equals:string}};
export type ChecklistDefinition={name:string;items:ChecklistRule[]};
export type ChecklistModel={service_id:string;version:number;definition:ChecklistDefinition|null;history:{version:number;name:string;reason:string;actor_name:string|null;created_at:string}[]};
export type ChecklistHistory={id:string;entry_id:string;status:ChecklistState;reason:string;actor_name:string|null;created_at:string;file_id:string|null};
export type ChecklistEntry=ChecklistRule&{id:string;applicable:boolean;status:ChecklistState;file_id:string|null;version:number;reason:string;actor_name:string|null;updated_at:string;file_status:string|null};
export type ChecklistInstance={id:string;source:string;name:string;entries:ChecklistEntry[];history:ChecklistHistory[];pending:number;received:number;can_update:boolean;can_waive:boolean};
export type ChecklistView={request_id:string;request_version:number;protocol:string;closed:boolean;following_only?:boolean;assignee_id:string|null;can_transfer:boolean;items:{id:string;name:string;service_id:string}[];selected_item_id:string|null;instance:ChecklistInstance|null};
export type ChecklistNotice={id:string;kind:'handoff'|'pending';created_at:string;read_at:string|null;request_id:string|null;protocol:string|null;can_open:boolean};
export type ChecklistNotices={items:ChecklistNotice[];total:number;unread:number;page:number;page_size:number};

export function validChecklistDefinition(v:unknown):v is ChecklistDefinition{
 const object=(x:unknown):x is Record<string,unknown>=>!!x&&typeof x==='object'&&!Array.isArray(x);
 const shape=(x:Record<string,unknown>,keys:string[])=>Object.keys(x).length===keys.length&&keys.every(k=>Object.hasOwn(x,k));
 const text=(x:unknown,max:number)=>typeof x==='string'&&x.trim().length>0&&x.length<=max&&!/[\u0000-\u001f\u007f]/.test(x);
 return object(v)&&shape(v,['name','items'])&&text(v.name,80)&&Array.isArray(v.items)&&v.items.length>=1&&v.items.length<=12&&new Set(v.items.map(x=>object(x)?x.key:null)).size===v.items.length&&v.items.every(x=>{
  if(!object(x)||!shape(x,['key','label','requirement','condition'])||typeof x.key!=='string'||!/^[a-z][a-z0-9_]{0,31}$/.test(x.key)||!text(x.label,120)||!['required','optional','conditional'].includes(String(x.requirement)))return false;
  if(x.requirement!=='conditional')return x.condition===null;
  return object(x.condition)&&shape(x.condition,['field','equals'])&&(x.condition.field==='origin'?['presencial','whatsapp','portal']:x.condition.field==='priority'?['normal','urgent']:[]).includes(String(x.condition.equals));
 });
}
