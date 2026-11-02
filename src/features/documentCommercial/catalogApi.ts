import type {CategorizedDocumentOffers} from '../../../shared/publicCatalog';
import {commercialRequest} from './api';
export const catalogApi={offers:(office_id:string,folder_id:string|null,unfiled:boolean,query:string,page:number,size:number,category:string|null,signal?:AbortSignal)=>commercialRequest<CategorizedDocumentOffers>('/offers',{office_id,folder_id,unfiled,query,page,size,category},signal)};
