import type {ModelCommercialState,ModelMetadata,ModelMetadataCommand,DocumentOffer,DocumentOfferInput,DocumentPublicOffer,DocumentOffersPage,DocumentBookingInput,DocumentBookingResult,DocumentIntakeView,DocumentPresence,PresenceStatus,DocumentDispatchPage} from '../../../shared/modelCommercial';
import type {TemplateDetail} from '../../../shared/templates';
import type {DocumentDetail,ParticipantInput} from '../../../shared/documents';
import {commercialRequest as request} from './api';
export const modelApi={
 dispatch:(office_id:string,page:number,size:number,signal?:AbortSignal)=>request<DocumentDispatchPage>('/dispatch',{office_id,page,size},signal),
 booked:(office_id:string,request_id:string,signal?:AbortSignal)=>request<boolean>('/intake-booked',{office_id,request_id},signal),
 state:(office_id:string,template_id:string,signal?:AbortSignal)=>request<ModelCommercialState>('/model-state',{office_id,template_id},signal),
 metadata:(office_id:string,template_id:string,command:ModelMetadataCommand,expected_revision:number,idempotency_key:string,signal?:AbortSignal)=>request<ModelMetadata>('/metadata-command',{office_id,template_id,command,expected_revision,idempotency_key},signal),
 duplicate:(office_id:string,template_id:string,version_id:string,code:string,name:string,idempotency_key:string,signal?:AbortSignal)=>request<TemplateDetail>('/duplicate',{office_id,template_id,version_id,code,name,idempotency_key},signal),
 offer:(office_id:string,template_id:string,value:DocumentOfferInput,expected_revision:number,idempotency_key:string,signal?:AbortSignal)=>request<DocumentOffer>('/offer-manage',{office_id,template_id,value,expected_revision,idempotency_key},signal),
 offers:(office_id:string,folder_id:string|null,unfiled:boolean,query:string,page:number,size:number,signal?:AbortSignal)=>request<DocumentOffersPage>('/offers',{office_id,folder_id,unfiled,query,page,size},signal),
 form:(office_id:string,template_id:string,signal?:AbortSignal)=>request<DocumentPublicOffer>('/offer-form',{office_id,template_id},signal),
 book:(office_id:string,value:DocumentBookingInput,idempotency_key:string,signal?:AbortSignal)=>request<DocumentBookingResult>('/booking',{office_id,value,idempotency_key},signal),
 presence:(office_id:string,signal?:AbortSignal)=>request<DocumentPresence>('/presence',{office_id},signal),
 updatePresence:(office_id:string,status:PresenceStatus,capacity:number,signal?:AbortSignal)=>request<DocumentPresence>('/presence-update',{office_id,status,capacity},signal),
 intake:(office_id:string,request_id:string,request_item_id:string,signal?:AbortSignal)=>request<DocumentIntakeView|null>('/intake',{office_id,request_id,request_item_id},signal),
 start:(office_id:string,request_id:string,request_item_id:string,participants:ParticipantInput[],idempotency_key:string,signal?:AbortSignal)=>request<DocumentDetail>('/intake-start',{office_id,request_id,request_item_id,participants,idempotency_key},signal),
 apply:(office_id:string,document_id:string,expected_revision:number,idempotency_key:string,signal?:AbortSignal)=>request<DocumentDetail>('/intake-apply',{office_id,document_id,expected_revision,idempotency_key},signal),
};
