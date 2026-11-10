import {documentObject as object,documentUuid as uuid} from './documents.js';
export const specializedKinds={aposentadoria:'Aposentadoria',salario_maternidade:'Salário-maternidade',requerimento:'Requerimento',oficio:'Ofício',juridico:'Caso jurídico'};
export const specializedStages={recebido:'Recebido',aguardando_documentos:'Aguardando documentos',encaminhado:'Encaminhado ao proprietário',em_analise:'Em análise',complementacao:'Complementação solicitada',concluido:'Concluído no escritório',cancelado:'Cancelado'};
export type SpecializedKind=keyof typeof specializedKinds;
export type SpecializedStage=keyof typeof specializedStages;
export type SpecializedProgress={kind:SpecializedKind;stage:SpecializedStage;pending:string;updated_at:string};
export type SpecializedCommand=
 |{kind:'configure';item_id:string;service_kind:SpecializedKind;expected_version:number}
 |{kind:'open';item_id:string}
 |{kind:'handoff';expected_version:number;owner_id:string}
 |{kind:'complement';expected_version:number;pending:string}
 |{kind:'advance';expected_version:number;stage:'aguardando_documentos'|'em_analise'}
 |{kind:'note';expected_version:number;text:string}
 |{kind:'external';expected_version:number;reference:string}
 |{kind:'deadline';expected_version:number;type:'interno'|'externo';label:string;due_on:string;source:string;responsible_id:string;alert_on:string;checked_on:string}
 |{kind:'finish_deadline';expected_version:number;deadline_id:string}
 |{kind:'expense';expected_version:number;expense_id:string;expected_expense_version:number}
 |{kind:'complete';expected_version:number};
export type CaseExpense={id:string;label:string;amount_cents:number;status:'pending'|'approved'|'paid';version:number};
export type SpecializedState={financial?:{fees:{due_cents:number;balance_cents:number}|null;expenses:CaseExpense[];options:CaseExpense[];total:number;options_total:number;can_link:boolean};case:(SpecializedProgress&{id:string;responsible_id:string;responsible_name:string;version:number;can_prepare:boolean;can_conduct:boolean;can_handoff:boolean;can_complement:boolean;can_sensitive:boolean;can_complete:boolean;checklist_pending:number;checklist_version:number;external_reference:string})|null;items:{id:string;name:string;kind:SpecializedKind|null;config_version:number}[];owners:{id:string;name:string}[];participants:{id:string;name:string}[];notes:{text:string;created_at:string}[];deadlines:{id:string;type:'interno'|'externo';label:string;due_on:string;alert_on:string;checked_on:string;source:string;responsible_name:string;completed_at:string|null}[];total_deadlines:number;page:number;can_open:boolean;can_configure:boolean};
const int=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=2147483646;
const str=(v:unknown,max:number,min=0):v is string=>typeof v==='string'&&Array.from(v).length<=max&&v.trim().length>=min&&!/[\u0000-\u001f\u007f]/.test(v);
const time=(v:unknown):v is string=>str(v,40,20)&&Number.isFinite(Date.parse(v));
const date=(v:unknown):v is string=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
const shape=(v:Record<string,unknown>,keys:string[])=>keys.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>keys.includes(k));
export function validSpecializedCommand(v:unknown):v is SpecializedCommand{
 if(!object(v))return false;
 if(v.kind==='configure')return shape(v,['kind','item_id','service_kind','expected_version'])&&uuid(v.item_id)&&typeof v.service_kind==='string'&&Object.hasOwn(specializedKinds,v.service_kind)&&int(v.expected_version);
 if(v.kind==='open')return shape(v,['kind','item_id'])&&uuid(v.item_id);
 if(!int(v.expected_version,1))return false;
 if(v.kind==='expense')return shape(v,['kind','expected_version','expense_id','expected_expense_version'])&&uuid(v.expense_id)&&int(v.expected_expense_version,1);
 if(v.kind==='complete')return shape(v,['kind','expected_version']);
 if(v.kind==='handoff')return shape(v,['kind','expected_version','owner_id'])&&uuid(v.owner_id);
 if(v.kind==='complement')return shape(v,['kind','expected_version','pending'])&&str(v.pending,500,1);
 if(v.kind==='advance')return shape(v,['kind','expected_version','stage'])&&(v.stage==='aguardando_documentos'||v.stage==='em_analise');
 if(v.kind==='note')return shape(v,['kind','expected_version','text'])&&str(v.text,2000,1);
 if(v.kind==='external')return shape(v,['kind','expected_version','reference'])&&str(v.reference,120,1);
 if(v.kind==='finish_deadline')return shape(v,['kind','expected_version','deadline_id'])&&uuid(v.deadline_id);
 return v.kind==='deadline'&&shape(v,['kind','expected_version','type','label','due_on','source','responsible_id','alert_on','checked_on'])&&(v.type==='interno'||v.type==='externo')&&str(v.label,120,1)&&str(v.source,500,1)&&uuid(v.responsible_id)&&date(v.due_on)&&date(v.alert_on)&&date(v.checked_on)&&v.alert_on<=v.due_on;
}
export function specializedProgress(v:unknown):SpecializedProgress{
 if(!object(v)||typeof v.kind!=='string'||!Object.hasOwn(specializedKinds,v.kind)||typeof v.stage!=='string'||!Object.hasOwn(specializedStages,v.stage)||!str(v.pending,500)||!time(v.updated_at))throw Error('Invalid specialized progress');
 return {kind:v.kind as SpecializedKind,stage:v.stage as SpecializedStage,pending:v.pending,updated_at:v.updated_at};
}
export function specializedState(v:unknown):SpecializedState{
 if(!object(v)||!['can_open','can_configure'].every(k=>typeof v[k]==='boolean')||!int(v.page,1)||!int(v.total_deadlines)||!['items','owners','participants','notes','deadlines'].every(k=>Array.isArray(v[k])))throw Error('Invalid specialized state');
 const items=v.items as unknown[],owners=v.owners as unknown[],participants=v.participants as unknown[],notes=v.notes as unknown[],deadlines=v.deadlines as unknown[];
 if(items.length>10||owners.length>5||participants.length>20||notes.length>5||deadlines.length>5)throw Error('Invalid specialized bounds');
 const names=(a:unknown[])=>a.map(n=>{if(!object(n)||!uuid(n.id)||!str(n.name,120,1))throw Error('Invalid participant');return {id:n.id,name:n.name};});
 let c:SpecializedState['case']=null;
 if(v.case!==null){const x=v.case,p=specializedProgress(x);if(!object(x)||!uuid(x.id)||!uuid(x.responsible_id)||!str(x.responsible_name,120,1)||!int(x.version,1)||!int(x.checklist_pending)||!int(x.checklist_version,1)||!str(x.external_reference,120)||!['can_prepare','can_conduct','can_handoff','can_complement','can_sensitive','can_complete'].every(k=>typeof x[k]==='boolean'))throw Error('Invalid specialized case');c={...p,id:x.id,responsible_id:x.responsible_id,responsible_name:x.responsible_name,version:x.version,checklist_pending:x.checklist_pending,checklist_version:x.checklist_version,external_reference:x.external_reference,can_prepare:x.can_prepare as boolean,can_conduct:x.can_conduct as boolean,can_handoff:x.can_handoff as boolean,can_complement:x.can_complement as boolean,can_sensitive:x.can_sensitive as boolean,can_complete:x.can_complete as boolean};}
 const money=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0&&x<=1_000_000_000_000;
 const expenses=(a:unknown)=>{if(!Array.isArray(a)||a.length>5)throw Error('Invalid expenses');return a.map(x=>{if(!object(x)||!uuid(x.id)||!str(x.label,120,1)||!money(x.amount_cents)||!['pending','approved','paid'].includes(String(x.status))||!int(x.version,1))throw Error('Invalid expense');return{id:x.id,label:x.label,amount_cents:x.amount_cents,status:x.status as CaseExpense['status'],version:x.version};});};
 let financial:SpecializedState['financial'];if(v.financial!==undefined){const f=v.financial;if(!object(f)||!int(f.total)||!int(f.options_total)||typeof f.can_link!=='boolean'||!(f.fees===null||object(f.fees)&&money(f.fees.due_cents)&&money(f.fees.balance_cents)))throw Error('Invalid case finances');financial={fees:f.fees===null?null:{due_cents:f.fees.due_cents as number,balance_cents:f.fees.balance_cents as number},expenses:expenses(f.expenses),options:expenses(f.options),total:f.total,options_total:f.options_total,can_link:f.can_link};}
 return {...(financial?{financial}:{}),case:c,items:items.map(x=>{if(!object(x)||!uuid(x.id)||!str(x.name,120,1)||!(x.kind===null||typeof x.kind==='string'&&Object.hasOwn(specializedKinds,x.kind))||!int(x.config_version))throw Error('Invalid item');return{id:x.id,name:x.name,kind:x.kind as SpecializedKind|null,config_version:x.config_version};}),owners:names(owners),participants:names(participants),notes:notes.map(x=>{if(!object(x)||!str(x.text,2000,1)||!time(x.created_at))throw Error('Invalid note');return{text:x.text,created_at:x.created_at};}),deadlines:deadlines.map(x=>{if(!object(x)||!uuid(x.id)||!(x.type==='interno'||x.type==='externo')||!str(x.label,120,1)||!date(x.due_on)||!date(x.alert_on)||!date(x.checked_on)||!str(x.source,500,1)||!str(x.responsible_name,120,1)||!(x.completed_at===null||time(x.completed_at)))throw Error('Invalid deadline');return{id:x.id,type:x.type,label:x.label,due_on:x.due_on,alert_on:x.alert_on,checked_on:x.checked_on,source:x.source,responsible_name:x.responsible_name,completed_at:x.completed_at};}),total_deadlines:v.total_deadlines,page:v.page,can_open:v.can_open as boolean,can_configure:v.can_configure as boolean};
}
export function specializedResult(v:unknown){if(!object(v)||!(v.id===null||uuid(v.id)))throw Error('Invalid specialized result');return{id:v.id};}
