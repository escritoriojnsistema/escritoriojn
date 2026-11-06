import type {PortalRequestCommand,PortalRequestState} from '../../../shared/portalRequests';
import {commercialRequest} from '../documentCommercial/api';
const request=<T,>(path:string,body:unknown,signal?:AbortSignal)=>commercialRequest<T>(path,body,signal,'/api/portal-requests');
export const portalRequestsApi={state:(office_id:string,id:string,signal?:AbortSignal)=>request<PortalRequestState>(`/${id}/state`,{office_id},signal),command:(office_id:string,id:string,expected_version:number,command:PortalRequestCommand,idempotency_key:string,signal?:AbortSignal)=>request<PortalRequestState>(`/${id}/command`,{office_id,expected_version,command,idempotency_key},signal)};
