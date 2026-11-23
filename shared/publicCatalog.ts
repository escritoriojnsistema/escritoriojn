import type {DocumentOffersPage} from './modelCommercial.js';
export type CatalogCategory={id:string;name:string;count:number;is_documents:boolean;parent_id?:string;parent_name?:string};
export type CategorizedDocumentOffers=DocumentOffersPage&{categories:CatalogCategory[]};
