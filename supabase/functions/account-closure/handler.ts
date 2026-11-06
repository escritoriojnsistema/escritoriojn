export type ClosureWorkerConfig={url:string;anonKey:string;serviceRoleKey:string;cronSecret:string};
/** Auth admin credentials stay exclusively inside the Edge runtime. */
export function createAccountClosureHandler(config:ClosureWorkerConfig,transport:typeof fetch=fetch){return async(req:Request)=>{
 const json=(v:unknown,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
 if(req.method!=='POST')return json({error:'METHOD'},405);
 const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(req.headers.get('Authorization')??'')?.[1];if(!config.serviceRoleKey)return json({error:'UNAVAILABLE'},503);if(!token)return json({error:'AUTH_REQUIRED'},401);
 const rpc=async(name:string,body:unknown)=>transport(config.url+'/rest/v1/rpc/'+name,{method:'POST',headers:{Authorization:'Bearer '+config.serviceRoleKey,apikey:config.serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
 try{let userId:string|null=null;
 // Gateway JWT verification remains enabled. A scheduler uses the provider's
 // server JWT plus a separate secret header; a random cron secret is not a JWT.
 const suppliedSecret=req.headers.get('X-Account-Closure-Secret');
 let scheduled=!!config.cronSecret&&token===config.serviceRoleKey&&suppliedSecret===config.cronSecret;
 if(!scheduled&&suppliedSecret&&!config.cronSecret){
  // The platform validates the gateway JWT. API publishable keys can differ
  // from that JWT; the independent Vault credential authorizes this job.
  const check=await rpc('maintenance_authorize',{p_worker:'account-closure',p_secret:suppliedSecret});
  if(!check.ok||(await check.json())?.authorized!==true)return json({error:'AUTH_REQUIRED'},401);
  scheduled=true;
 }
 if(!scheduled){const identity=await transport(config.url+'/auth/v1/user',{headers:{Authorization:'Bearer '+token,apikey:config.anonKey},signal:AbortSignal.timeout(8000)});if(!identity.ok)return json({error:'AUTH_REQUIRED'},401);const user=await identity.json();if(typeof user.id!=='string')return json({error:'AUTH_REQUIRED'},401);userId=user.id;}
 const candidates=await rpc('account_provider_pending',{p_user_id:userId});if(!candidates.ok)return json({error:'UNAVAILABLE'},503);const data=await candidates.json();if(!Array.isArray(data?.ids)||data.ids.length>20)return json({error:'UNAVAILABLE'},503);
 let completed=0;for(const id of data.ids){if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))return json({error:'UNAVAILABLE'},503);
 // Official soft deletion removes credentials and sessions while retaining the
 // Auth UUID referenced by immutable business history. A ban alone keeps sessions.
 const result=await transport(config.url+'/auth/v1/admin/users/'+id,{method:'DELETE',headers:{Authorization:'Bearer '+config.serviceRoleKey,apikey:config.serviceRoleKey,'Content-Type':'application/json'},body:JSON.stringify({should_soft_delete:true}),signal:AbortSignal.timeout(15000)});
 if(result.ok){const saved=await rpc('account_provider_complete',{p_user_id:id});if(saved.ok)completed++;}
 }
 return json({data:{processed:completed,pending:data.ids.length-completed}});
 }catch{return json({error:'UNAVAILABLE'},503);}
 };}
