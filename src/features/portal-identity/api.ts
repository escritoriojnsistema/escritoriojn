import {commercialRequest} from '../documentCommercial/api';
import {portalIdentityState,portalIdentityResult,type PortalIdentityCommand} from '../../../shared/portalIdentity';
export const portalIdentityApi={
 state:async(office_id:string,customer_id:string|null,signal?:AbortSignal)=>portalIdentityState(await commercialRequest('/state',{office_id,customer_id},signal,'/api/portal-identity')),
 command:async(office_id:string,customer_id:string|null,command:PortalIdentityCommand,key:string,signal?:AbortSignal)=>portalIdentityResult(await commercialRequest('/command',{office_id,customer_id,command,key},signal,'/api/portal-identity')),
};
export function createLinkToken(){const bytes=crypto.getRandomValues(new Uint8Array(32));return Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');}
