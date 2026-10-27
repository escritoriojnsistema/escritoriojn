import {actions as previous,fields as previousFields,targets as previousTargets,values as previousValues} from './reportV7Catalog.js';
export const actions:Record<string,string>={...previous,'documents.created':'Rascunho documental criado','documents.saved':'Revisão documental salva','documents.participants_changed':'Participantes do documento alterados','documents.prepared':'Preenchimento documental concluído'};
export const targets:Record<string,string>={...previousTargets,document:'Documento em preenchimento'};
export const fields:Record<string,string>={...previousFields};
export const values:Record<string,string>={...previousValues,draft:'Rascunho',prepared:'Preenchimento concluído'};
