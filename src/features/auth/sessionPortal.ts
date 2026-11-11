import type {Session} from '@supabase/supabase-js';
import {uuidPattern,type BusinessRole} from '../../../shared/access';
import type {Portal} from '../../app/routes';
import {sessionScope} from './sessionScope';
type PortalStorage=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
const key='jn-session-portal';
function stores(storage?:PortalStorage):PortalStorage[]{
 if(storage)return[storage];
 const result:PortalStorage[]=[];
 try{result.push(localStorage);}catch{/* Some browsers block persistent storage. */}
 try{result.push(sessionStorage);}catch{/* Keep verification separate from persistence. */}
 return result;
}
function safeScope(session:Session):string|undefined{
 const scope=sessionScope(session),[uid,sid,...rest]=scope.split(':');
 return rest.length===0&&uid===session.user.id&&uuidPattern.test(uid)&&uuidPattern.test(sid??'')?scope:undefined;
}
function marker(value:string|null,scope:string){
 try{const entry=JSON.parse(value??'null');return entry?.version===1&&entry.scope===scope&&(entry.portal==='team'||entry.portal==='client')&&Number.isSafeInteger(entry.revision)&&entry.revision>0?entry as {portal:Portal;revision:number}:undefined;}catch{return;}
}
/** Correlation + presentation preference only; contains no token or authorization. */
export function readSessionPortal(session:Session,storage?:PortalStorage):Portal|undefined{
 const scope=safeScope(session);if(!scope)return;
 let newest:ReturnType<typeof marker>;
 for(const target of stores(storage))try{const entry=marker(target.getItem(key),scope);if(entry&&(!newest||entry.revision>=newest.revision))newest=entry;}catch{/* Try tab storage when persistent storage is unavailable. */}
 return newest?.portal;
}
export function rememberSessionPortal(session:Session,portal:Portal,storage?:PortalStorage):()=>void{
 const scope=safeScope(session);if(!scope)return()=>{};
 const targets:{target:PortalStorage;previous:string|null}[]=[];let revision=0;
 for(const target of stores(storage))try{const previous=target.getItem(key);revision=Math.max(revision,marker(previous,scope)?.revision??0);targets.push({target,previous});}catch{/* Use the other store. */}
 // A monotonic selection revision makes tab fallback newer than a stale local
 // marker after quota failure. This is presentation state, never authority.
 const value=JSON.stringify({version:1,scope,portal,revision:revision+1}),written:typeof targets=[];
 for(const entry of targets)try{entry.target.setItem(key,value);written.push(entry);}catch{/* Try every store; keep current verified selection in memory too. */}
 return()=>{for(const {target,previous}of written)try{if(target.getItem(key)!==value)continue;if(previous===null)target.removeItem(key);else target.setItem(key,previous);}catch{/* Concurrent sessions are never removed. */}};
}
export function forgetSessionPortal(session:Session,storage?:PortalStorage){
 for(const target of stores(storage))try{const entry=JSON.parse(target.getItem(key)??'null');if(safeScope(session)&&entry?.scope===safeScope(session))target.removeItem(key);}catch{/* No persisted state to clear. */}
}
/** Old sessions may infer an area once. A pinned session never changes portals on revocation. */
export function chooseSessionPortal(roles:BusinessRole[],pinned?:Portal,hint?:Portal):Portal{
 if(pinned)return pinned;
 const client=roles.includes('client'),team=roles.some(role=>role!=='client');
 return client&&(!team||hint==='client')?'client':'team';
}
