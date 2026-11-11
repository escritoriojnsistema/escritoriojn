import {uuidPattern} from '../../../shared/access';
// Only an opaque command nonce is persisted; forms, files, prices and tokens stay in memory.
const key=(sessionKey:string,office:string)=>'jn:intake33:'+sessionKey+':'+office;
export function peekIntakeNonce33(sessionKey:string,office:string):string|undefined{try{const value=sessionStorage.getItem(key(sessionKey,office));return value&&uuidPattern.test(value)?value:undefined;}catch{return undefined;}}
export function keepIntakeNonce33(sessionKey:string,office:string,value:string):void{if(!uuidPattern.test(value))return;try{sessionStorage.setItem(key(sessionKey,office),value);}catch{/* Memory still protects the current attempt if storage is unavailable. */}}
export function clearIntakeNonce33(sessionKey:string,office:string):void{try{sessionStorage.removeItem(key(sessionKey,office));}catch{/* No business data is persisted. */}}
