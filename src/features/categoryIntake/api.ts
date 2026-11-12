import {commercialRequest} from '../documentCommercial/api';
import {categoryForm,categoryRequestState,type CategoryFormCommand,type CategoryRequestCommand} from '../../../shared/categoryIntake';
import {projectBooking} from '../../../shared/modelCommercialValidation';
const base='/api/category-intake';
export const categoryIntakeApi={
 form:async(office_id:string,category_id:string,manage=false,signal?:AbortSignal)=>categoryForm(await commercialRequest('/form',{office_id,category_id,manage},signal,base)),
 publish:async(office_id:string,category_id:string,command:CategoryFormCommand,key:string,signal?:AbortSignal)=>categoryForm(await commercialRequest('/publish',{office_id,category_id,command,key},signal,base)),
 open:async(office_id:string,category_id:string,revision:number,answers:Record<string,string>,message:string,key:string,signal?:AbortSignal)=>projectBooking(await commercialRequest('/open',{office_id,category_id,revision,answers,message,key},signal,base)),
 state:async(office_id:string,request_id:string,signal?:AbortSignal)=>categoryRequestState(await commercialRequest('/state',{office_id,request_id},signal,base)),
 command:async(office_id:string,request_id:string,version:number,command:CategoryRequestCommand,key:string,signal?:AbortSignal)=>categoryRequestState(await commercialRequest('/command',{office_id,request_id,version,command,key},signal,base)),
};
