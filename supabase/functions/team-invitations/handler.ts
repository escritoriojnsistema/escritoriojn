import { createClient } from '@supabase/supabase-js';
export type InvitationMailConfig={url:string;anonKey:string;serviceRoleKey:string;siteUrl?:string};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const object=(value:unknown):value is Record<string,unknown>=>!!value && typeof value==='object' && !Array.isArray(value);
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{
  'Content-Type':'application/json','Cache-Control':'private, no-store','CDN-Cache-Control':'no-store',
  'Vary':'Authorization','X-Content-Type-Options':'nosniff',
}});
const error=(status:number,code:string)=>json({error:{code}},status);
/** Same handler runs at the Edge and in the disposable Auth/SMTP laboratory. */
export function createTeamInvitationHandler(config:InvitationMailConfig) {
  return async (request:Request):Promise<Response>=>{
    if(request.method!=='POST')return error(405,'METHOD_NOT_ALLOWED');
    const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/i.exec(request.headers.get('Authorization')??'')?.[1];
    if(!token)return error(401,'AUTH_REQUIRED');
    if(!request.headers.get('Content-Type')?.match(/^application\/json(?:;|$)/i))return error(415,'UNSUPPORTED_MEDIA_TYPE');
    let body:unknown;
    try {
      const raw=await request.text();if(raw.length>1024)return error(413,'PAYLOAD_TOO_LARGE');body=JSON.parse(raw);
    } catch {return error(400,'INVALID_JSON');}
    if(!object(body) || Object.keys(body).length!==2 || typeof body.office_id!=='string' || !uuid.test(body.office_id)
      || typeof body.invitation_id!=='string' || !uuid.test(body.invitation_id))return error(422,'TEAM_VALIDATION');
    if(!config.url || !config.anonKey || !config.serviceRoleKey)return error(503,'TEAM_UNAVAILABLE');
    const options={auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
      global:{fetch:(input:RequestInfo|URL,init?:RequestInit)=>fetch(input,{
        ...init,signal:AbortSignal.any([AbortSignal.timeout(8000),...(init?.signal?[init.signal]:[])]),
      })},
    };
    try {
      const caller=createClient(config.url,config.anonKey,{...options,global:{...options.global,headers:{Authorization:`Bearer ${token}`}}});
      const identity=await caller.auth.getUser(token);
      if(identity.error || !identity.data.user)return error(identity.error?.status && identity.error.status<429?401:503,'AUTH_REQUIRED');
      const claim=await caller.rpc('team_claim_delivery',{p_office_id:body.office_id,p_invitation_id:body.invitation_id,p_request_id:crypto.randomUUID()});
      if(claim.error) {
        const status=Number(/^PT(401|403|409|410|422|429)$/.exec(claim.error.code)?.[1]);
        return error(status||503,status?'TEAM_FORBIDDEN':'TEAM_UNAVAILABLE');
      }
      if(!object(claim.data) || typeof claim.data.email!=='string' || claim.data.email.length>254
        || claim.data.invitation_id!==body.invitation_id || typeof claim.data.lease_id!=='string' || !uuid.test(claim.data.lease_id))return error(503,'TEAM_UNAVAILABLE');
      const lease=claim.data;
      // Site configuration is trusted runtime configuration, never a request-supplied redirect.
      const site=new URL(config.siteUrl??'https://escritoriojn.vercel.app');
      const local=['127.0.0.1','localhost','[::1]'].includes(site.hostname);
      if(site.username || site.password || (site.protocol!=='https:' && !(local && site.protocol==='http:')))return error(503,'TEAM_UNAVAILABLE');
      const redirect=new URL('/auth/callback',site.origin);redirect.searchParams.set('area','team');redirect.searchParams.set('invite',body.invitation_id);
      const admin=createClient(config.url,config.serviceRoleKey,options);
      const invited=await admin.auth.admin.inviteUserByEmail(lease.email as string,{redirectTo:redirect.href});
      let deliveryError=invited.error;
      if(deliveryError?.code==='email_exists') {
        // Admin invitations are implicit. The existing-user branch must match that
        // contract, not generate a PKCE verifier on a server the recipient cannot access.
        const recovery=createClient(config.url,config.anonKey,{...options,auth:{...options.auth,flowType:'implicit'}});
        const result=await recovery.auth.resetPasswordForEmail(lease.email as string,{redirectTo:redirect.href});
        deliveryError=result.error;
      }
      const finish=await admin.rpc('team_finish_delivery',{p_invitation_id:body.invitation_id,p_lease_id:lease.lease_id,p_sent:!deliveryError});
      const recorded=!finish.error && object(finish.data) && finish.data.recorded===true;
      const uncertain=!!deliveryError && (!deliveryError.status || deliveryError.status>=500);
      return json({data:{delivery:!recorded || uncertain?'pending':deliveryError?'failed':'sent'}});
    } catch {return error(503,'TEAM_UNAVAILABLE');}
  };
}
