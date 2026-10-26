import type {QuickContext,QuickOperation,QuickResult,ReportContext,ReportFilters,ReportOptionKind,ReportOptions,ReportPage,ReportSettings} from '../../../shared/finance19';
import {supabase} from '../auth/browser';
import {authenticatedFetch} from '../auth/authenticatedFetch';
import {sessionScope} from '../auth/sessionScope';
export class FinanceError extends Error{
 constructor(public status:number,public code?:string){super(status===401?'Sua sessão expirou. Entre novamente para continuar.':status===403?'Seu acesso não permite esta operação. Verifique com o escritório.':status===404?'Registro indisponível no seu escopo.':status===409?'O estado mudou. Confira o serviço, o caixa ou o relatório antes de repetir.':status===422?(code==='FINANCE19_LIMIT'?'O relatório excede o limite. Refine os filtros.':'Confira os campos, valores e filtros informados.'):'Não foi possível concluir. Confira a conexão e tente novamente.');}
}
export const financeError=(v:unknown)=>v instanceof FinanceError?v:v&&typeof v==='object'&&'status'in v&&[401,403,404,409,422,503].includes(Number(v.status))?new FinanceError(Number(v.status),'code'in v?String(v.code):undefined):new FinanceError(503);
export type FinancialDownload={blob:Blob;filename:string;protocol:string;total:number};
async function request<T>(path:string,body:object,signal?:AbortSignal,download=false):Promise<T>{
 if(!supabase)throw new FinanceError(503);const controller=new AbortController();let changed=false,unsubscribe:(()=>void)|undefined;
 try{signal?.throwIfAborted();const {data,error}=await supabase.auth.getSession();if(error||!data.session?.access_token)throw new FinanceError(401);const scope=sessionScope(data.session);const sub=supabase.auth.onAuthStateChange((_event,next)=>{if(!next||next.user.id!==data.session!.user.id||sessionScope(next)!==scope){changed=true;controller.abort();}});unsubscribe=()=>sub.data.subscription.unsubscribe();
 const response=await authenticatedFetch('/api/finance'+path,{method:'POST',headers:{Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},body:JSON.stringify(body),cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(download?110000:25000),...(signal?[signal]:[])])},data.session);
 const result:unknown=download&&response.ok?await response.blob():await response.json();signal?.throwIfAborted();const current=await supabase.auth.getSession();signal?.throwIfAborted();if(changed||current.error||!current.data.session||current.data.session.user.id!==data.session.user.id||sessionScope(current.data.session)!==scope)throw new FinanceError(401);
 if(!response.ok){const code=result&&typeof result==='object'&&'error'in result&&result.error&&typeof result.error==='object'&&'code'in result.error?String(result.error.code):undefined;throw new FinanceError(response.status,code);}
 if(download){const protocol=response.headers.get('X-Finance-Protocol'),count=response.headers.get('X-Finance-Count'),name=/filename="(financeiro-[0-9a-f-]+\.(?:csv|pdf))"/i.exec(response.headers.get('Content-Disposition')??'')?.[1];if(!(result instanceof Blob)||!name||!protocol||!count||!/^\d{1,4}$/.test(count)||Number(count)>1000||result.size>3*1024*1024)throw new FinanceError(503);return {blob:result,filename:name,protocol,total:Number(count)} as T;}
 if(!result||typeof result!=='object'||!('data'in result)||!result.data||typeof result.data!=='object')throw new FinanceError(503);return result.data as T;
 }catch(cause){if(signal?.aborted)throw cause;if(changed)throw new FinanceError(401);throw financeError(cause);}finally{unsubscribe?.();}
}
export const financeApi={
 quickContext:(office_id:string,session_id:string|null,query='',page=1,session_page=1,method_page=1,signal?:AbortSignal)=>request<QuickContext>('/quick/context',{office_id,session_id,query,page,session_page,method_page},signal),
 quick:(office_id:string,operation:QuickOperation,signal?:AbortSignal)=>request<QuickResult>('/quick/operate',{office_id,operation},signal),
 reportContext:(office_id:string,signal?:AbortSignal)=>request<ReportContext>('/reports/context',{office_id},signal),
 reportOptions:(office_id:string,kind:ReportOptionKind,query='',page=1,signal?:AbortSignal)=>request<ReportOptions>('/reports/options',{office_id,kind,query,page},signal),
 report:(office_id:string,filters:ReportFilters,page=1,signal?:AbortSignal)=>request<ReportPage>('/reports/page',{office_id,filters,page},signal),
 settings:(office_id:string,timezone:string,expected_version:number,reason:string,idempotency_key:string,signal?:AbortSignal)=>request<ReportSettings>('/reports/settings',{office_id,timezone,expected_version,reason,idempotency_key},signal),
 export:(office_id:string,filters:ReportFilters,idempotency_key:string,format:'csv'|'pdf',signal?:AbortSignal)=>request<FinancialDownload>('/reports/export',{office_id,filters,idempotency_key,format},signal,true),
};
export function saveFinancialDownload(value:FinancialDownload){const url=URL.createObjectURL(value.blob),anchor=document.createElement('a');anchor.href=url;anchor.download=value.filename;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
