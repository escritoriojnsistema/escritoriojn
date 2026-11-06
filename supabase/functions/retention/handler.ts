export type RetentionWorkerConfig={url:string;serviceRoleKey:string;cronSecret:string;anonKey?:string};
type Purge={id:string;token:string;office_id:string;objects:{bucket:string;object_path:string}[]};
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
function validJob(v:unknown):v is Purge{if(!v||typeof v!=='object')return false;const j=v as Purge;return uuid(j.id)&&uuid(j.token)&&uuid(j.office_id)&&Array.isArray(j.objects)&&j.objects.length<=200&&j.objects.every(o=>o&&['request-attachments','jn-document-artifacts'].includes(o.bucket)&&typeof o.object_path==='string'&&o.object_path.split('/').length===3&&o.object_path.split('/').every(uuid)&&o.object_path.split('/')[0]===j.office_id);}
/** Only explicit, committed manager reservations are dispatched. Storage API owns byte erasure. */
export function createRetentionHandler(config:RetentionWorkerConfig,transport:typeof fetch=fetch){return async(req:Request)=>{
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method!=='POST')return json({error:'METHOD'},405);
 if(!config.url||!config.serviceRoleKey)return json({error:'UNAVAILABLE'},503);
 const headers={Authorization:'Bearer '+config.serviceRoleKey,apikey:config.serviceRoleKey,'Content-Type':'application/json'};
 const rpc=(name:string,body:unknown)=>transport(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 try{
 const auth=req.headers.get('Authorization'),secret=req.headers.get('X-Retention-Secret');
 let authorized=!!config.cronSecret&&auth==='Bearer '+config.serviceRoleKey&&secret===config.cronSecret;
 if(!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(auth??''))return json({error:'AUTH_REQUIRED'},401);
 if(!authorized&&secret&&!config.cronSecret){const check=await rpc('maintenance_authorize',{p_worker:'retention',p_secret:secret});authorized=check.ok&&(await check.json())?.authorized===true;}
 if(!authorized)return json({error:'AUTH_REQUIRED'},401);
 const response=await rpc('retention_worker_claim',{});if(!response.ok)return json({error:'UNAVAILABLE'},503);const claims=await response.json();if(!Array.isArray(claims?.items)||claims.items.length>20||!claims.items.every(validJob))return json({error:'UNAVAILABLE'},503);
 let completed=0;for(const j of claims.items as Purge[]){let ok=true;for(const bucket of ['request-attachments','jn-document-artifacts']){const prefixes=j.objects.filter(o=>o.bucket===bucket).map(o=>o.object_path);if(!prefixes.length)continue;try{const removed=await transport(config.url+'/storage/v1/object/'+bucket,{method:'DELETE',headers,body:JSON.stringify({prefixes}),signal:AbortSignal.timeout(15000)});if(!removed.ok){ok=false;break;}}catch{ok=false;break;}}
 // Missing objects are success only when the Storage API accepts the idempotent removal
 // and the database verifies all registered paths are absent. Provider errors stay pending.
 if(ok){const saved=await rpc('retention_worker_complete',{p_id:j.id,p_token:j.token});if(saved.ok){const done=await saved.json();if(done?.completed===true)completed++;}}
 }
 return json({data:{processed:completed,pending:claims.items.length-completed}});
 }catch{return json({error:'UNAVAILABLE'},503);}
 };}
