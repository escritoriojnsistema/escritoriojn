import {actions as actionsV1,fields as fieldsV1,targets,values} from './reportV1Catalog.js';
export {targets,values};
export const fields:Record<string,string>={...fieldsV1,payment_id:'Referência do pagamento'};
export const actions:Record<string,string>={...actionsV1,'payments.pending':'Pagamento pendente registrado','payments.rejected':'Pagamento pendente rejeitado','payments.settled':'Liquidação manual de cartão registrada'};
