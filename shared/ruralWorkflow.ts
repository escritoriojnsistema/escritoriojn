import {documentObject as object,documentUuid as uuid} from './documents.js';
export const ruralStages={recebido:'Recebido',aguardando_documentos:'Aguardando documentos',encaminhado:'Encaminhado ao proprietário',em_analise:'Em análise',em_preparacao:'Em preparação',complementacao:'Complementação solicitada',concluido:'Concluído no escritório',entregue:'Entrega confirmada',cancelado:'Cancelado'};
export type RuralStage=keyof typeof ruralStages;
export type RuralProgress={kind:'CCIR'|'CAR';stage:RuralStage;pending:string;updated_at:string};
export type RuralWorkflowCase=RuralProgress&{id:string;property_name:string;version:number;can_prepare:boolean;can_reserved:boolean;can_complement:boolean;can_handoff:boolean;can_complete:boolean;checklist_pending:number;external_reference:string;result_file_id:string|null};
export type RuralWorkflowState={case:RuralWorkflowCase|null;properties:{id:string;name:string}[];items:{id:string;name:string;kind:'CCIR'|'CAR'|null;config_version:number}[];owners:{id:string;name:string}[];history:{stage:RuralStage;actor_name:string;created_at:string}[];history_total:number;page:number;can_configure:boolean;can_open:boolean};
export type RuralWorkflowCommand={kind:'configure';item_id:string;service_kind:'CCIR'|'CAR';expected_version:number}|{kind:'open';item_id:string;property_id:string}|{kind:'prepare';expected_version:number;stage:'recebido'|'aguardando_documentos'}|{kind:'handoff';expected_version:number;owner_id:string}|{kind:'complement';expected_version:number;pending:string}|{kind:'advance';expected_version:number;stage:'em_analise'|'em_preparacao'}|{kind:'complete';expected_version:number;external_reference:string;file_id:string};
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=2147483646;
const text=(v:unknown,max=120,min=0):v is string=>typeof v==='string'&&Array.from(v).length>=min&&Array.from(v).length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const time=(v:unknown):v is string=>text(v,40,20)&&Number.isFinite(Date.parse(v));
const shape=(v:Record<string,unknown>,ks:string[])=>ks.every(k=>Object.hasOwn(v,k))&&Object.keys(v).every(k=>ks.includes(k));
export function validRuralWorkflowCommand(v:unknown):v is RuralWorkflowCommand{
 if(!object(v))return false;
 if(v.kind==='configure')return shape(v,['kind','item_id','service_kind','expected_version'])&&uuid(v.item_id)&&(v.service_kind==='CCIR'||v.service_kind==='CAR')&&integer(v.expected_version);
 if(v.kind==='open')return shape(v,['kind','item_id','property_id'])&&uuid(v.item_id)&&uuid(v.property_id);
 if(!integer(v.expected_version,1))return false;
 if(v.kind==='prepare'||v.kind==='advance')return shape(v,['kind','expected_version','stage'])&&(v.kind==='prepare'?v.stage==='recebido'||v.stage==='aguardando_documentos':v.stage==='em_analise'||v.stage==='em_preparacao');
 if(v.kind==='handoff')return shape(v,['kind','expected_version','owner_id'])&&uuid(v.owner_id);
 if(v.kind==='complement')return shape(v,['kind','expected_version','pending'])&&text(v.pending,500,1)&&v.pending.trim().length>0;
 return v.kind==='complete'&&shape(v,['kind','expected_version','external_reference','file_id'])&&uuid(v.file_id)&&text(v.external_reference,120,1)&&v.external_reference.trim().length>0;
}
export function ruralProgress(v:unknown):RuralProgress{
 if(!object(v)||!(v.kind==='CCIR'||v.kind==='CAR')||typeof v.stage!=='string'||!Object.hasOwn(ruralStages,v.stage)||!text(v.pending,500)||!time(v.updated_at))throw Error('Invalid rural progress');
 return {kind:v.kind,stage:v.stage as RuralStage,pending:v.pending,updated_at:v.updated_at};
}
export function ruralWorkflowState(v:unknown):RuralWorkflowState{
 if(!object(v)||!Array.isArray(v.properties)||v.properties.length>5||!Array.isArray(v.items)||v.items.length>10||!Array.isArray(v.owners)||v.owners.length>5||!Array.isArray(v.history)||v.history.length>5||!integer(v.history_total)||!integer(v.page,1)||typeof v.can_configure!=='boolean'||typeof v.can_open!=='boolean')throw Error('Invalid rural workflow');
 const names=(arr:unknown[])=>arr.map(a=>{if(!object(a)||!uuid(a.id)||!text(a.name,120,1))throw Error('Invalid rural option');return {id:a.id,name:a.name};});
 let c:RuralWorkflowCase|null=null;
 if(v.case!==null){const a=v.case;const progress=ruralProgress(a);if(!object(a)||!uuid(a.id)||!text(a.property_name,120,1)||!integer(a.version,1)||!integer(a.checklist_pending)||!text(a.external_reference)||!(a.result_file_id===null||uuid(a.result_file_id))||!['can_prepare','can_reserved','can_complement','can_handoff','can_complete'].every(k=>typeof a[k]==='boolean'))throw Error('Invalid rural case');c={...progress,id:a.id,property_name:a.property_name,version:a.version,checklist_pending:a.checklist_pending,external_reference:a.external_reference,result_file_id:a.result_file_id,can_prepare:a.can_prepare as boolean,can_reserved:a.can_reserved as boolean,can_complement:a.can_complement as boolean,can_handoff:a.can_handoff as boolean,can_complete:a.can_complete as boolean};}
 return {case:c,properties:names(v.properties),owners:names(v.owners),items:v.items.map(a=>{if(!object(a)||!uuid(a.id)||!text(a.name,120,1)||!(a.kind===null||a.kind==='CCIR'||a.kind==='CAR')||!integer(a.config_version))throw Error('Invalid rural service');return {id:a.id,name:a.name,kind:a.kind,config_version:a.config_version};}),history:v.history.map(a=>{if(!object(a)||typeof a.stage!=='string'||!Object.hasOwn(ruralStages,a.stage)||!text(a.actor_name,120,1)||!time(a.created_at))throw Error('Invalid rural history');return {stage:a.stage as RuralStage,actor_name:a.actor_name,created_at:a.created_at};}),history_total:v.history_total,page:v.page,can_configure:v.can_configure,can_open:v.can_open};
}
export function ruralWorkflowResult(v:unknown){if(!object(v)||!(v.id===null||uuid(v.id)))throw Error('Invalid rural result');return {id:v.id};}
