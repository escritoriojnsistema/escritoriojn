import {actions as previous,fields as previousFields,targets as previousTargets,values as previousValues} from './reportV6Catalog.js';
export const actions:Record<string,string>={...previous,'templates.saved':'Versão de modelo salva','templates.approved':'Versão de modelo aprovada'};
export const targets:Record<string,string>={...previousTargets,template:'Modelo documental'};
export const fields:Record<string,string>={...previousFields};
export const values:Record<string,string>={...previousValues};
