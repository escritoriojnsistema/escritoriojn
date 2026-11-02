import { uuidPattern } from './access.js';

export type ActivitySnapshot={user_id:string;session_id:string;server_time:string;expires_at:string;idle_minutes:number};
export type AccessAudience='team'|'client';
export type AccessPolicy={audience:AccessAudience;idle_minutes:number;revision:number;updated_at:string};
export type AccessPolicyState={policies:Record<AccessAudience,AccessPolicy>;audience:AccessAudience;can_manage:boolean};
const record=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
const date=(v:unknown):v is string=>typeof v==='string'&&v.length<=40&&Number.isFinite(Date.parse(v));
export const validIdleMinutes=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=5&&v<=1440;
export function activitySnapshot(value:unknown):ActivitySnapshot{
 if(!record(value)||typeof value.user_id!=='string'||!uuidPattern.test(value.user_id)||typeof value.session_id!=='string'||!uuidPattern.test(value.session_id)||!date(value.server_time)||!date(value.expires_at)||!validIdleMinutes(value.idle_minutes))throw new Error('ACTIVITY_UNAVAILABLE');
 return {user_id:value.user_id,session_id:value.session_id,server_time:value.server_time,expires_at:value.expires_at,idle_minutes:value.idle_minutes};
}
export function accessPolicyState(value:unknown):AccessPolicyState{
 if(!record(value)||!record(value.policies)||!['team','client'].includes(String(value.audience))||typeof value.can_manage!=='boolean')throw new Error('ACCESS_UNAVAILABLE');
 const policies={} as Record<AccessAudience,AccessPolicy>;
 for(const audience of ['team','client'] as const){const p=value.policies[audience];if(!record(p)||p.audience!==audience||!validIdleMinutes(p.idle_minutes)||typeof p.revision!=='number'||!Number.isInteger(p.revision)||p.revision<1||!date(p.updated_at))throw new Error('ACCESS_UNAVAILABLE');policies[audience]={audience,idle_minutes:p.idle_minutes,revision:p.revision,updated_at:p.updated_at};}
 return {policies,audience:value.audience as AccessAudience,can_manage:value.can_manage};
}
/** Event trust is a browser filter. Authority, clock and the rate limit remain in the database. */
export function humanActivityAllowed(event:{type:string;isTrusted:boolean},lastSent:number,now:number){return event.isTrusted&&['pointerdown','pointermove','keydown','touchstart','wheel'].includes(event.type)&&now-lastSent>=15000;}
/** One instance per UID/session_id. Token refresh never creates another instance. */
export class ActivityDeadline{
 private deadline:number|undefined;
 private serverTime=-Infinity;
 private ended=false;
 observe(snapshot:ActivitySnapshot,now:number){
  if(this.ended||this.remaining(now)===0)return;
  const serverTime=Date.parse(snapshot.server_time);if(serverTime<this.serverTime)return;
  this.serverTime=serverTime;this.deadline=now+Math.max(0,Date.parse(snapshot.expires_at)-serverTime);
 }
 remaining(now:number){if(this.ended)return 0;if(this.deadline===undefined)return undefined;const remaining=Math.max(0,this.deadline-now);if(!remaining)this.ended=true;return remaining;}
}
