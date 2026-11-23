import {uuidPattern} from './access.js';
import {digitsOnly,validCpf,validCnpj} from './identifiers.js';
import type {AttachmentClassification,AttachmentMime} from './attachments.js';

export const categoryFieldTypes=['text','textarea','number','date','email','phone','cpf','cnpj','cpf_cnpj','select'] as const;
export type CategoryResponseModel={name:string;mask:string};
export type CategoryField={key:string;label:string;type:typeof categoryFieldTypes[number];required:boolean;options:string[];response_name?:string;model?:CategoryResponseModel};
export type CategoryDocumentSlot={key:string;label:string;required:boolean;max_files:number;max_bytes:number;mime_types:AttachmentMime[];classification:Extract<AttachmentClassification,'documento'|'identificacao'|'comprovante'>};
export type CategoryForm={category_id:string;revision:number;enabled:boolean;instructions:string;fields:CategoryField[];documents:CategoryDocumentSlot[];can_manage:boolean;has_services:boolean};
export type CategoryFormCommand=Pick<CategoryForm,'enabled'|'instructions'|'fields'|'documents'>&{expected_revision:number;reason:string};
export type CategoryRequestState={request_id:string;category_id:string;revision:number;version:number;protocol:string;category_name:string;instructions:string;fields:CategoryField[];answers:Record<string,string>;documents:CategoryDocumentSlot[];files:{slot_key:string;file_id:string;name:string;status:string}[];message:string;draft:boolean;can_edit:boolean;can_submit:boolean;hidden:boolean};
export type CategoryRequestCommand={kind:'save';answers:Record<string,string>;message:string}|{kind:'bind_file';slot_key:string;file_id:string}|{kind:'remove_file';file_id:string}|{kind:'submit'|'hide'};
const obj=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const text=(v:unknown,max:number,min=0):v is string=>typeof v==='string'&&[...v].length<=max&&v.trim().length>=min&&!/[\u0000-\u001f\u007f]/.test(v);
const multiline=(v:unknown,max:number):v is string=>typeof v==='string'&&[...v].length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
const integer=(v:unknown,min=0,max=2147483645):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const id=(v:unknown):v is string=>typeof v==='string'&&uuidPattern.test(v);
export const categoryKey=(v:unknown):v is string=>typeof v==='string'&&/^[a-z][a-z0-9_]{0,31}$/.test(v);
const modelSlots:Record<string,RegExp>={'0':/^[0-9]$/,'A':/^[A-Za-z]$/,'*':/^[A-Za-z0-9]$/};
export const identifiesCredential=(value:string)=>/(^|[^\p{L}\p{N}])(senha|password|passcode|otp|c[oó]digo de (verifica[cç][aã]o|autentica[cç][aã]o)|token de acesso)(?=$|[^\p{L}\p{N}])/iu.test(value);
export const validResponseName=(value:unknown)=>text(value,80,1)&&!identifiesCredential(value);
export const validResponseMask=(value:unknown):value is string=>typeof value==='string'&&/^[0A* .\/()-]{1,48}$/.test(value)&&/[0A*]$/.test(value)&&value===value.trim();
export const allowResponseModel=(type:string)=>type==='text'||type==='phone';
export const responseMaskFitsType=(type:string,mask:string)=>allowResponseModel(type)&&
 (type!=='phone'||(!/[A*]/.test(mask)&&/^0{10,15}$/.test(mask.replace(/[^0]/g,''))));
export const validResponseModel=(value:unknown):value is CategoryResponseModel=>obj(value)&&exact(value,['name','mask'])&&validResponseName(value.name)&&validResponseMask(value.mask);
export function formatResponseModel(mask:string,input:string){
 const values=input.match(/[A-Za-z0-9]/g)??[];
 let cursor=0,result='',pending='';
 for(const token of mask){
  const rule=modelSlots[token];
  if(!rule){pending+=token;continue;}
  const value=values[cursor++];
  if(!value||!rule.test(value))return result;
  result+=pending+value;pending='';
 }
 return result+pending;
}
export function matchesResponseModel(mask:string,value:string){return value.length===mask.length&&[...mask].every((token,index)=>modelSlots[token]?.test(value[index])??token===value[index]);}
export const formatCategoryCnpj=(value:string)=>formatResponseModel('**.***.***/****-00',value.toUpperCase());
export function validCategoryCnpj(value:string){
 if(!/[A-Z]/.test(value))return validCnpj(value);
 const code=value.replace(/[./-]/g,'');
 if(!/^[A-Z0-9]{12}[0-9]{2}$/.test(code)||(value!==code&&value!==formatCategoryCnpj(code)))return false;
 for(const length of [12,13]){
  let sum=0;
  for(let index=0;index<length;index++)sum+=(code.charCodeAt(index)-48)*((length-index-1)%8+2);
  const remainder=sum%11;
  if(Number(code[length])!==(remainder<2?0:11-remainder))return false;
 }
 return true;
}
export function validCategoryFields(v:unknown):v is CategoryField[]{return Array.isArray(v)&&v.length<=24&&v.every(f=>obj(f)&&exact(f,['key','label','type','required','options',...(Object.hasOwn(f,'response_name')?['response_name']:[]),...(Object.hasOwn(f,'model')?['model']:[])])&&categoryKey(f.key)&&text(f.label,80,1)&&categoryFieldTypes.includes(f.type as CategoryField['type'])&&typeof f.required==='boolean'&&Array.isArray(f.options)&&f.options.every(x=>text(x,80,1))&&new Set(f.options).size===f.options.length&&(f.type==='select'?f.options.length>=2&&f.options.length<=20:f.options.length===0)&&(!Object.hasOwn(f,'response_name')||validResponseName(f.response_name))&&(!Object.hasOwn(f,'model')||validResponseModel(f.model)&&responseMaskFitsType(String(f.type),f.model.mask)))&&new Set(v.map(f=>f.key)).size===v.length;}
export function validCategoryDocuments(v:unknown):v is CategoryDocumentSlot[]{return Array.isArray(v)&&v.length<=12&&v.every(d=>obj(d)&&exact(d,['key','label','required','max_files','max_bytes','mime_types','classification'])&&categoryKey(d.key)&&text(d.label,100,1)&&typeof d.required==='boolean'&&integer(d.max_files,1,10)&&integer(d.max_bytes,1024,10485760)&&Array.isArray(d.mime_types)&&d.mime_types.length>0&&d.mime_types.length<=3&&new Set(d.mime_types).size===d.mime_types.length&&d.mime_types.every(x=>['application/pdf','image/png','image/jpeg'].includes(String(x)))&&['documento','identificacao','comprovante'].includes(String(d.classification)))&&new Set(v.map(d=>d.key)).size===v.length;}
export function validCategoryFormCommand(v:unknown):v is CategoryFormCommand{return obj(v)&&exact(v,['expected_revision','enabled','instructions','fields','documents','reason'])&&integer(v.expected_revision)&&typeof v.enabled==='boolean'&&text(v.instructions,1000)&&validCategoryFields(v.fields)&&v.fields.every(f=>!identifiesCredential(f.label))&&validCategoryDocuments(v.documents)&&text(v.reason,500,1)&&(!v.enabled||v.fields.length+v.documents.length>0);}
export function validCategoryAnswers(v:unknown):v is Record<string,string>{return obj(v)&&Object.keys(v).length<=24&&Object.entries(v).every(([k,x])=>categoryKey(k)&&multiline(x,2000));}
export function categoryAnswerError(fields:CategoryField[],answers:Record<string,string>,complete=true):string|undefined{
 if(!validCategoryAnswers(answers)||Object.keys(answers).some(k=>!fields.some(f=>f.key===k)))return 'Confira os campos desta categoria.';
 for(const f of fields){const v=(answers[f.key]??'').trim();if(!v){if(complete&&f.required)return `Preencha ${f.label}.`;continue;}
  if(f.type!=='textarea'&&([...v].length>500||/[\r\n\t]/.test(v)))return `Confira ${f.label}.`;
  if(f.type==='number'&&!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(v)||f.type==='email'&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)||f.type==='phone'&&(digitsOnly(v).length<10||digitsOnly(v).length>15)||f.type==='cpf'&&!validCpf(v)||f.type==='cnpj'&&!validCategoryCnpj(v)||f.type==='select'&&!f.options.includes(v))return `Confira ${f.label}.`;
  if(identifiesCredential(f.label))return 'Remova senhas e códigos de autenticação antes de enviar.';
  if(f.type==='cpf_cnpj'&&!validCpf(v)&&!validCategoryCnpj(v))return `Informe um CPF ou CNPJ válido em ${f.label}.`;
  if(f.model&&!matchesResponseModel(f.model.mask,v))return `Use o formato ${f.model.mask} em ${f.label}.`;
  if(f.type==='date'&&(!/^\d{4}-\d{2}-\d{2}$/.test(v)||!Number.isFinite(Date.parse(v+'T00:00:00Z'))||new Date(v+'T00:00:00Z').toISOString().slice(0,10)!==v))return `Confira ${f.label}.`;
 }return undefined;
}
export function validCategoryRequestCommand(v:unknown):v is CategoryRequestCommand{if(!obj(v))return false;return v.kind==='save'?exact(v,['kind','answers','message'])&&validCategoryAnswers(v.answers)&&multiline(v.message,2000):v.kind==='bind_file'?exact(v,['kind','slot_key','file_id'])&&categoryKey(v.slot_key)&&id(v.file_id):v.kind==='remove_file'?exact(v,['kind','file_id'])&&id(v.file_id):['submit','hide'].includes(String(v.kind))&&exact(v,['kind']);}
export function categoryForm(v:unknown):CategoryForm{if(!obj(v)||!id(v.category_id)||!integer(v.revision)||typeof v.enabled!=='boolean'||!text(v.instructions,1000)||!validCategoryFields(v.fields)||!validCategoryDocuments(v.documents)||typeof v.can_manage!=='boolean'||typeof v.has_services!=='boolean')throw Error('Invalid category form');return{category_id:v.category_id,revision:v.revision,enabled:v.enabled,instructions:v.instructions,fields:v.fields,documents:v.documents,can_manage:v.can_manage,has_services:v.has_services};}
export function categoryRequestState(v:unknown):CategoryRequestState|null{
 if(v===null)return null;
 if(!obj(v)||!id(v.request_id)||!id(v.category_id)||!integer(v.revision,1)||!integer(v.version,1)||!text(v.protocol,120,1)||!text(v.category_name,60,1)||!text(v.instructions,1000)||!validCategoryFields(v.fields)||!validCategoryDocuments(v.documents)||!validCategoryAnswers(v.answers)||!multiline(v.message,2000)||['draft','can_edit','can_submit','hidden'].some(k=>typeof v[k]!=='boolean')||!Array.isArray(v.files)||v.files.length>120||v.files.some(f=>!obj(f)||!categoryKey(f.slot_key)||!id(f.file_id)||!text(f.name,255,1)||!['aguardando_upload','quarentena','disponivel','rejeitado','removido'].includes(String(f.status))))throw Error('Invalid category request');
 return{request_id:v.request_id,category_id:v.category_id,revision:v.revision,version:v.version,protocol:v.protocol,category_name:v.category_name,instructions:v.instructions,fields:v.fields,answers:v.answers,documents:v.documents,files:v.files.map(f=>({slot_key:f.slot_key,file_id:f.file_id,name:f.name,status:f.status})),message:v.message,draft:v.draft as boolean,can_edit:v.can_edit as boolean,can_submit:v.can_submit as boolean,hidden:v.hidden as boolean};
}
