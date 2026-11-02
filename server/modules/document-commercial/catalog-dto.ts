import {documentObject as object,documentUuid as uuid} from '../../../shared/documents.js';
import {projectOffersPage} from '../../../shared/modelCommercialValidation.js';
import type {CategorizedDocumentOffers,CatalogCategory} from '../../../shared/publicCatalog.js';
export function projectCategorizedOffers(v:unknown):CategorizedDocumentOffers{
 const base=projectOffersPage(v);if(!object(v))throw Error('Invalid catalog');
 const categories:CatalogCategory[]=v.categories===undefined?[]:Array.isArray(v.categories)&&v.categories.length<=500?v.categories.map(c=>{if(!object(c)||!uuid(c.id)||typeof c.name!=='string'||!c.name.trim()||Array.from(c.name).length>60||typeof c.count!=='number'||!Number.isSafeInteger(c.count)||c.count<0||typeof c.is_documents!=='boolean')throw Error('Invalid catalog category');return {id:c.id,name:c.name,count:c.count,is_documents:c.is_documents};}):(()=>{throw Error('Invalid catalog categories');})();
 return {...base,categories};
}
