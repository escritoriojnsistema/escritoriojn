import {commercialRequest} from '../documentCommercial/api';
import {portalPage32,portalState32,portalShares32,portalCommandResult32,type PortalShareCommand32} from '../../../shared/portalDocuments';
const base='/api/portal-documents';
export const portalDocumentsApi={
 page:async(office_id:string,query:string,page:number,size:3|5,signal?:AbortSignal)=>portalPage32(await commercialRequest('/page',{office_id,query,page,size},signal,base)),
 state:async(office_id:string,publication_id:string,page:number,size:3|5,signal?:AbortSignal)=>portalState32(await commercialRequest('/state',{office_id,publication_id,page,size},signal,base)),
 shares:async(office_id:string,publication_id:string,page:number,signal?:AbortSignal)=>portalShares32(await commercialRequest('/shares',{office_id,publication_id,page},signal,base)),
 command:async(office_id:string,publication_id:string,command:PortalShareCommand32,key:string,signal?:AbortSignal)=>portalCommandResult32(await commercialRequest('/command',{office_id,publication_id,command,key},signal,base)),
};
