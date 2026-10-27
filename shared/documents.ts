import {templateVariables,isCustomTemplateKey,type TemplateInput} from './templates.js';
export const participantRoles={buyer:'Comprador',seller:'Vendedor',representative:'Representante',guardian:'Responsável',other:'Outro'} as const;
export type ParticipantInput={role:keyof typeof participantRoles;customer_id:string;label:string};
export type PersonSnapshot={customer_id:string;version:number;kind:'person'|'company';name:string;identifier:string|null};
export type DocumentParticipant=PersonSnapshot & Pick<ParticipantInput,'role'|'label'>;
export type DraftInput={content:string;overrides:Record<string,string>;money_in_words:boolean};
export type DocumentSource={customer:PersonSnapshot|null;service:{id:string;version_id:string;description:string;quantity:number;total_cents:number};emitted_on:string};
export type DocumentIssue={key:string;code:'required'|'unknown_variable'|'invalid_placeholder'|'invalid_value'|'participant_required'|'missing_placeholder'|'date_order'|'content_empty';message:string};
export type DocumentResolution={values:Record<string,string|null>;formatted:Record<string,string>;words:Record<string,string>;issues:DocumentIssue[];rendered_content:string};
export type DocumentTemplate={id:string;version_id:string;number:number;definition:TemplateInput};
export type DocumentHistory={revision:number;author_name:string;created_at:string;prepared:boolean};
export type DocumentSummary={id:string;protocol:string;request_protocol:string;title:string;status:'draft'|'prepared';revision:number;demonstration:boolean;updated_at:string};
export type DocumentPage={items:DocumentSummary[];total:number;page:number;page_size:number};
export type DocumentDetail=DocumentResolution & {id:string;protocol:string;request_id:string;request_item_id:string;request_protocol:string;title:string;template:DocumentTemplate;current_revision:number;revision:number;status:'draft'|'prepared';created_at:string;updated_at:string;prepared_at:string|null;can_edit:boolean;can_prepare:boolean;author_name:string;revision_created_at:string;input:DraftInput;source:DocumentSource;participants:DocumentParticipant[];history:DocumentHistory[];history_page:number;history_total:number};
export type DocumentOperation={kind:'save';expected_revision:number;input:DraftInput;idempotency_key:string}|{kind:'participants';expected_revision:number;participants:ParticipantInput[];idempotency_key:string}|{kind:'prepare';expected_revision:number;idempotency_key:string};
export type DocumentOptionKind='requests'|'items'|'templates'|'customers';
export type DocumentOptions={kind:DocumentOptionKind;items:{id:string;label:string;demonstration?:boolean}[];total:number;page:number;page_size:number};
export const documentUuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
export const documentObject=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export const documentExact=(v:unknown,keys:readonly string[]):v is Record<string,unknown>=>documentObject(v)&&Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
export const documentString=(v:unknown,max:number):v is string=>typeof v==='string'&&Array.from(v).length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
export function validDraftInput(v:unknown,definition?:TemplateInput):v is DraftInput{return documentExact(v,['content','overrides','money_in_words'])&&documentString(v.content,30000)&&typeof v.money_in_words==='boolean'&&documentObject(v.overrides)&&Object.keys(v.overrides).length<=80&&Object.entries(v.overrides).every(([k,value])=>(Object.hasOwn(templateVariables,k)||isCustomTemplateKey(k))&&(!definition||definition.variables.some(x=>x.key===k))&&documentString(value,isCustomTemplateKey(k)?2000:500));}
export function validParticipants(v:unknown):v is ParticipantInput[]{
 if(!Array.isArray(v)||v.length>20||!v.every(p=>documentExact(p,['role','customer_id','label'])&&typeof p.role==='string'&&Object.hasOwn(participantRoles,p.role)&&documentUuid(p.customer_id)&&documentString(p.label,80)&&p.label.trim().length>0&&!/[\u0000-\u001f\u007f]/.test(p.label)))return false;
 const parties=v as ParticipantInput[];return new Set(parties.map(p=>p.role+':'+p.customer_id.toLowerCase())).size===parties.length&&['buyer','seller'].every(r=>parties.filter(p=>p.role===r).length<=1)&&!(parties.find(p=>p.role==='buyer')&&parties.find(p=>p.role==='buyer')?.customer_id.toLowerCase()===parties.find(p=>p.role==='seller')?.customer_id.toLowerCase());
}
export function validDocumentOperation(v:unknown):v is DocumentOperation{
 if(!documentObject(v)||!Number.isSafeInteger(v.expected_revision)||Number(v.expected_revision)<1||!documentUuid(v.idempotency_key))return false;
 return v.kind==='save'?documentExact(v,['kind','expected_revision','input','idempotency_key'])&&validDraftInput(v.input):v.kind==='participants'?documentExact(v,['kind','expected_revision','participants','idempotency_key'])&&validParticipants(v.participants):v.kind==='prepare'&&documentExact(v,['kind','expected_revision','idempotency_key']);
}
