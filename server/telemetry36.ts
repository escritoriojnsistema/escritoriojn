import {randomUUID} from 'node:crypto';
import type {RequestHandler} from 'express';
const groups=new Set(['health','auth','account','customers','requests','attachments','documents','cash','payments','charges','finance','operations','services','team','notifications','portal-documents','portal-intake','portal-identity','templates','privacy','document-workflow','document-commercial']);
/** Only bounded technical fields; no path/query/body/identity or caller-supplied ID. */
export function apiLogRecord36(method:string,path:string,status:number,duration_ms:number,request_id:string){
 const first=path.split('/')[1];return{event:'api_request36',request_id,method:['GET','POST','PUT','PATCH','DELETE','HEAD','OPTIONS'].includes(method)?method:'OTHER',group:groups.has(first)?first:'other',status,duration_ms:Math.round(duration_ms*10)/10};
}
let successSample=0;
export const requestTelemetry36:RequestHandler=(req,res,next)=>{
 const requestId=randomUUID(),started=performance.now(),path=req.path,method=req.method;res.locals.requestId=requestId;res.setHeader('X-Request-Id',requestId);
 res.once('finish',()=>{
  const duration=performance.now()-started;
  // All failures/slow operations; bounded sampling of successes limits log cost.
  if(res.statusCode<400&&duration<3000&&++successSample%20!==0)return;
  const record=apiLogRecord36(method,path,res.statusCode,duration,requestId);
  if(res.statusCode>=500||duration>=3000)console.warn(JSON.stringify(record));else console.info(JSON.stringify(record));
 });next();
};
