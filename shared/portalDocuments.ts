import {uuidPattern} from './access.js';
import {workflowBlockers} from './documentWorkflow.js';
export type PortalDocument32={id:string;title:string;protocol:string;revision:number;created_at:string;scope:'own'|'participant';ready:boolean;blockers:string[]};
export type PortalDocuments32={items:PortalDocument32[];total:number;page:number;page_size:3|5};
export type PortalDocumentState32={document:PortalDocument32;financial:{due_cents:number;paid_cents:number;balance_cents:number}|null;history:{at:string;kind:'download_authorized'}[];history_total:number;page:number;page_size:3|5};
export type PortalShares32={publication_id:string;revision:number;can_manage:boolean;ready:boolean;participants:{customer_id:string;name:string;identity_verified:boolean}[];items:{id:string;customer_name:string;valid_until:string;created_at:string;version:number;status:'active'|'expired'|'revoked'|'unavailable'}[];total:number;page:number;page_size:5};
export type PortalShareCommand32={kind:'grant';expected_revision:number;customer_id:string;valid_until:string;evidence:string}|{kind:'revoke';expected_revision:number;id:string;version:number;evidence:string};
export type PortalPublicHistory32={items:{at:string;status:'recebido'|'em_analise'|'aguardando_cliente'|'concluido'|'cancelado'}[];total:number;page:number;page_size:3};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const id=(v:unknown):v is string=>typeof v==='string'&&uuidPattern.test(v);
const integer=(v:unknown,min=0):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=Number.MAX_SAFE_INTEGER;
const text=(v:unknown,max=120):v is string=>typeof v==='string'&&v.trim().length>0&&[...v].length<=max&&!/[\u0000-\u001f\u007f]/.test(v);
const time=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export function validPortalShare32(v:unknown):v is PortalShareCommand32{if(!object(v)||!integer(v.expected_revision,1)||!text(v.evidence,500))return false;return v.kind==='grant'?exact(v,['kind','expected_revision','customer_id','valid_until','evidence'])&&id(v.customer_id)&&time(v.valid_until):v.kind==='revoke'&&exact(v,['kind','expected_revision','id','version','evidence'])&&id(v.id)&&integer(v.version,1);}
function publication(v:unknown):PortalDocument32{if(!object(v)||!id(v.id)||!text(v.title)||!text(v.protocol)||!integer(v.revision,1)||!time(v.created_at)||!['own','participant'].includes(String(v.scope))||typeof v.ready!=='boolean'||!Array.isArray(v.blockers)||v.blockers.some(x=>typeof x!=='string'||!Object.hasOwn(workflowBlockers,x))||v.ready!==(v.blockers.length===0)||v.scope==='participant'&&!v.ready&&(v.blockers.length!==1||v.blockers[0]!=='restriction'))throw Error('Invalid portal publication');return{id:v.id,title:v.title,protocol:v.protocol,revision:v.revision,created_at:v.created_at,scope:v.scope as 'own'|'participant',ready:v.ready,blockers:v.blockers as string[]};}
export function portalPage32(v:unknown):PortalDocuments32{if(!object(v)||!Array.isArray(v.items)||!integer(v.total)||!integer(v.page,1)||![3,5].includes(Number(v.page_size))||v.items.length>Number(v.page_size))throw Error('Invalid portal page');return{items:v.items.map(publication),total:v.total,page:v.page,page_size:v.page_size as 3|5};}
export function portalState32(v:unknown):PortalDocumentState32{
 if(!object(v)||!Array.isArray(v.history)||!integer(v.history_total)||!integer(v.page,1)||![3,5].includes(Number(v.page_size))||v.history.length>Number(v.page_size))throw Error('Invalid portal state');
 const document=publication(v.document);let financial:PortalDocumentState32['financial']=null;
 if(v.financial!==null){const f=v.financial;if(document.scope!=='own'||!object(f)||!integer(f.due_cents)||!integer(f.paid_cents)||!integer(f.balance_cents)||f.due_cents-f.paid_cents!==f.balance_cents)throw Error('Invalid portal finance');financial={due_cents:f.due_cents,paid_cents:f.paid_cents,balance_cents:f.balance_cents};}
 const history=v.history.map(h=>{if(!object(h)||!time(h.at)||h.kind!=='download_authorized')throw Error('Invalid download history');return{at:h.at,kind:'download_authorized' as const};});
 return{document,financial,history,history_total:v.history_total,page:v.page,page_size:v.page_size as 3|5};
}
export function portalShares32(v:unknown):PortalShares32{
 if(!object(v)||!id(v.publication_id)||!integer(v.revision,1)||typeof v.can_manage!=='boolean'||typeof v.ready!=='boolean'||!Array.isArray(v.participants)||v.participants.length>20||!Array.isArray(v.items)||v.items.length>5||!integer(v.total)||!integer(v.page,1)||v.page_size!==5)throw Error('Invalid sharing state');
 const participants=v.participants.map(p=>{if(!object(p)||!id(p.customer_id)||!text(p.name)||typeof p.identity_verified!=='boolean')throw Error('Invalid participant');return{customer_id:p.customer_id,name:p.name,identity_verified:p.identity_verified};});
 const items=v.items.map(g=>{if(!object(g)||!id(g.id)||!text(g.customer_name)||!time(g.valid_until)||!time(g.created_at)||!integer(g.version,1)||!['active','expired','revoked','unavailable'].includes(String(g.status)))throw Error('Invalid grant');return{id:g.id,customer_name:g.customer_name,valid_until:g.valid_until,created_at:g.created_at,version:g.version,status:g.status as PortalShares32['items'][number]['status']};});
 return{publication_id:v.publication_id,revision:v.revision,can_manage:v.can_manage,ready:v.ready,participants,items,total:v.total,page:v.page,page_size:5};
}
export function portalPublicHistory32(v:unknown):PortalPublicHistory32{if(!object(v)||!Array.isArray(v.items)||v.items.length>3||!integer(v.total)||!integer(v.page,1)||v.page_size!==3)throw Error('Invalid public history');const items=v.items.map(x=>{if(!object(x)||!time(x.at)||!['recebido','em_analise','aguardando_cliente','concluido','cancelado'].includes(String(x.status)))throw Error('Invalid public status');return{at:x.at,status:x.status as PortalPublicHistory32['items'][number]['status']};});return{items,total:v.total,page:v.page,page_size:3};}
export function portalCommandResult32(v:unknown):{id:string}{if(!object(v)||!id(v.id))throw Error('Invalid portal command result');return{id:v.id};}
