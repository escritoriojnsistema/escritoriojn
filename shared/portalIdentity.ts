import {uuidPattern} from './access.js';
export type PortalIdentityState={customer_version:number|null;requests:{id:string;protocol:string}[];identity:{name:string;verified_at:string}|null;invitations:{id:string;created_at:string;expires_at:string;status:'pending'|'consumed'|'expired'|'revoked'}[];representations:{id:string;protocol:string;status:string;valid_until:string;scope:'request_status'}[];limit:20};
export type PortalIdentityCommand={kind:'accept';token:string}|{kind:'issue';membership_id:string;token:string;evidence:string;expected_version:number}|{kind:'revoke_invite'|'revoke_representation';id:string}|{kind:'represent';relation_id:string;request_id:string;valid_until:string;evidence:string};
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const exact=(v:Record<string,unknown>,keys:string[])=>Object.keys(v).length===keys.length&&keys.every(k=>Object.hasOwn(v,k));
const id=(v:unknown):v is string=>typeof v==='string'&&uuidPattern.test(v);
const token=(v:unknown)=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const evidence=(v:unknown)=>typeof v==='string'&&v.trim().length>0&&[...v].length<=500&&!/[\u0000-\u001f\u007f]/.test(v);
export function validPortalCommand(v:unknown):v is PortalIdentityCommand{
 if(!object(v))return false;
 switch(v.kind){
 case 'accept':return exact(v,['kind','token'])&&token(v.token);
 case 'issue':return exact(v,['kind','membership_id','token','evidence','expected_version'])&&id(v.membership_id)&&token(v.token)&&evidence(v.evidence)&&Number.isInteger(v.expected_version)&&Number(v.expected_version)>0;
 case 'revoke_invite':case 'revoke_representation':return exact(v,['kind','id'])&&id(v.id);
 case 'represent':return exact(v,['kind','relation_id','request_id','valid_until','evidence'])&&id(v.relation_id)&&id(v.request_id)&&evidence(v.evidence)&&typeof v.valid_until==='string'&&/^\d{4}-\d\d-\d\dT/.test(v.valid_until)&&Number.isFinite(Date.parse(v.valid_until));
 default:return false;
 }
}
const str=(v:unknown,max=200):v is string=>typeof v==='string'&&v.length>0&&v.length<=max;
const time=(v:unknown):v is string=>str(v,40)&&Number.isFinite(Date.parse(v));
export function portalIdentityState(v:unknown):PortalIdentityState{
 if(!object(v)||v.limit!==20||!(v.identity===null||object(v.identity)&&str(v.identity.name,120)&&time(v.identity.verified_at))||!Array.isArray(v.invitations)||v.invitations.length>20||!Array.isArray(v.representations)||v.representations.length>20)throw Error('Invalid portal state');
 if(!(v.customer_version===null||Number.isInteger(v.customer_version)&&Number(v.customer_version)>0)||!Array.isArray(v.requests)||v.requests.length>20)throw Error('Invalid scope');
 const requests=v.requests.map(x=>{if(!object(x)||!id(x.id)||!str(x.protocol,120))throw Error('Invalid request');return{id:x.id,protocol:x.protocol};});
 const invitations=v.invitations.map(x=>{if(!object(x)||!id(x.id)||!time(x.created_at)||!time(x.expires_at)||!['pending','consumed','expired','revoked'].includes(String(x.status)))throw Error('Invalid invitation');return{id:x.id,created_at:x.created_at,expires_at:x.expires_at,status:x.status}as PortalIdentityState['invitations'][number];});
 const representations=v.representations.map(x=>{if(!object(x)||!id(x.id)||!str(x.protocol,120)||!str(x.status,40)||!time(x.valid_until)||x.scope!=='request_status')throw Error('Invalid representation');return{id:x.id,protocol:x.protocol,status:x.status,valid_until:x.valid_until,scope:'request_status' as const};});
 return{customer_version:v.customer_version as number|null,requests,identity:v.identity===null?null:{name:String(v.identity.name),verified_at:String(v.identity.verified_at)},invitations,representations,limit:20};
}
export function portalIdentityResult(v:unknown):{id:string}{if(!object(v)||!id(v.id))throw Error('Invalid portal result');return{id:v.id};}
