import {Router,json} from 'express';
import {validImportInput37,validImportReport37,type ImportReport37,type ImportHistory37} from '../../../shared/imports37.js';
import {authenticatedClient} from '../auth/client.js';
import {fields,uuid} from '../team/validation.js';
import {errorResponse} from '../../errors.js';
export const imports37Router=Router();
imports37Router.use(async(req,res,next)=>{const auth=await authenticatedClient(req,res);if(auth){res.locals.importAuth=auth;next();}});
imports37Router.use((req,res,next)=>{if(!req.is('application/json'))return void errorResponse(res,415,'IMPORT_VALIDATION','Envie JSON.');next();},json({limit:'270kb'}));
function report(data:unknown):ImportReport37{
 if(!validImportReport37(data))throw Error('Invalid import report');
 const {batch_id,status,fingerprint,source,as_of,debit_cents,credit_cents,expected_debit_cents,expected_credit_cents,ready}=data;
 return {batch_id,status,fingerprint,source,as_of,debit_cents,credit_cents,expected_debit_cents,expected_credit_cents,ready,rows:data.rows.map(({row,source_id,name,outcome,reason,opening_cents,customer_id,file_id})=>({row,source_id,name,outcome,reason,opening_cents,customer_id,file_id}))};
}
function history(data:unknown):ImportHistory37{
 const d=data as ImportHistory37;if(!d||!Array.isArray(d.items)||![3,5].includes(d.page_size)||!Number.isSafeInteger(d.total)||d.total<0||!Number.isInteger(d.page)||d.page<1||d.items.length>d.page_size)throw Error('Invalid import history');
 return {page:d.page,page_size:d.page_size,total:d.total,items:d.items.map(x=>{if(!uuid(x.id)||typeof x.source!=='string'||x.source.length>120||!/^\d{4}-\d{2}-\d{2}$/.test(x.as_of)||!Number.isFinite(Date.parse(x.created_at))||!['applied','reversed'].includes(x.status)||![x.debit_cents,x.credit_cents].every(n=>Number.isSafeInteger(n)&&n>=0&&n<=1e14))throw Error('Invalid history row');const {id,source,as_of,created_at,status,debit_cents,credit_cents}=x;return{id,source,as_of,created_at,status,debit_cents,credit_cents};})};
}
imports37Router.post('/:action',async(req,res)=>{
 const a=req.params.action,b=req.body;let args:Record<string,unknown>|undefined;
 if(!Object.keys(req.query).length&&uuid(b?.office_id)){
  if((a==='preview'||a==='apply')&&fields(b,a==='preview'?['office_id','input']:['office_id','input','fingerprint','key'])&&validImportInput37(b.input)){
   if(a==='preview')args={p_input:b.input};else if(uuid(b.key)&&typeof b.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(b.fingerprint))args={p_input:b.input,p_fingerprint:b.fingerprint,p_key:b.key};
  }else if(a==='detail'&&fields(b,['office_id','batch_id'])&&uuid(b.batch_id))args={p_batch_id:b.batch_id};
  else if(a==='history'&&fields(b,['office_id','page','page_size'])&&typeof b.page==='number'&&Number.isInteger(b.page)&&b.page>=1&&b.page<=100000&&typeof b.page_size==='number'&&[3,5].includes(b.page_size))args={p_page:b.page,p_size:b.page_size};
  else if(a==='reverse'&&fields(b,['office_id','batch_id','fingerprint','reason','key'])&&uuid(b.batch_id)&&uuid(b.key)&&typeof b.fingerprint==='string'&&/^[a-f0-9]{64}$/.test(b.fingerprint)&&typeof b.reason==='string'&&Array.from(b.reason.trim()).length>=5&&Array.from(b.reason).length<=500&&!/[\x00-\x1f\x7f]/.test(b.reason))args={p_batch_id:b.batch_id,p_fingerprint:b.fingerprint,p_reason:b.reason,p_key:b.key};
 }
 if(!args){errorResponse(res,422,'IMPORT_VALIDATION','Confira o arquivo e os campos da importação.');return;}
 try{
 const auth=res.locals.importAuth as NonNullable<Awaited<ReturnType<typeof authenticatedClient>>>;
 const {data,error}=await auth.client.rpc('imports37_'+a,{p_office_id:b.office_id,...args});
 if(error){const status=Number(/^PT(401|403|404|409|422)$/.exec(error.code??'')?.[1]??503);errorResponse(res,status,'IMPORT_'+status,status===409?'O lote ou seus vínculos mudaram. Gere uma nova prévia antes de confirmar.':status===422?'Confira as linhas aceitas e os totais da fonte.':'Não foi possível acessar esta importação.');return;}
 res.json({data:a==='history'?history(data):report(data)});
 }catch{errorResponse(res,503,'IMPORT_UNAVAILABLE','Não foi possível confirmar a importação. Preserve a mesma tentativa.');}
});
