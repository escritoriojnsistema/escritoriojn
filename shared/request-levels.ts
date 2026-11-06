import {uuidPattern} from './access.js';
export type PreintakeInput={origin:'presencial'|'whatsapp';title:string;message:string;customer_id:string|null;category_id:string;internal_note:string};
const text=(v:unknown,max:number,min=0)=>typeof v==='string'&&v.trim().length>=min&&v.length<=max&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v);
export function validPreintake(v:unknown):v is PreintakeInput{
 if(!v||typeof v!=='object'||Array.isArray(v))return false;
 const r=v as Record<string,unknown>;
 return Object.keys(r).length===6&&['presencial','whatsapp'].includes(String(r.origin))&&text(r.title,120,1)&&!/[\r\n\t]/.test(String(r.title))&&text(r.message,2000)&&text(r.internal_note,2000)&&typeof r.category_id==='string'&&uuidPattern.test(r.category_id)&&(r.customer_id===null||typeof r.customer_id==='string'&&uuidPattern.test(r.customer_id));
}
