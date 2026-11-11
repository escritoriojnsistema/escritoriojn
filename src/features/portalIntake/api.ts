import {commercialRequest} from '../documentCommercial/api';import {projectBooking} from '../../../shared/modelCommercialValidation';import {portalServicePage33,portalServiceForm33,portalServiceManage33,type PortalServiceOpen33,type PortalServicePublish33} from '../../../shared/portalIntake';
const base='/api/portal-intake';
export const intakeApi33={
 services:async(office_id:string,category_id:string,query:string,page:number,size:3|5,signal?:AbortSignal)=>portalServicePage33(await commercialRequest('/services',{office_id,category_id,query,page,size},signal,base)),
 form:async(office_id:string,service_id:string,signal?:AbortSignal)=>portalServiceForm33(await commercialRequest('/form',{office_id,service_id},signal,base)),
 open:async(office_id:string,form:PortalServiceOpen33,key:string,signal?:AbortSignal)=>projectBooking(await commercialRequest('/open',{office_id,form,key},signal,base)),
 resume:async(office_id:string,key:string,signal?:AbortSignal)=>{const v=await commercialRequest('/resume',{office_id,key},signal,base);return v===null?null:projectBooking(v);},
 manage:async(office_id:string,service_id:string,signal?:AbortSignal)=>portalServiceManage33(await commercialRequest('/manage',{office_id,service_id},signal,base)),
 publish:async(office_id:string,service_id:string,command:PortalServicePublish33,key:string,signal?:AbortSignal)=>portalServiceManage33(await commercialRequest('/publish',{office_id,service_id,command,key},signal,base)),
};
