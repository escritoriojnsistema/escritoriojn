import {actions as previous,fields as previousFields,targets,values} from './reportV2Catalog.js';
export {targets,values};
export const fields:Record<string,string>={...previousFields,reversal_id:'Referência do estorno lógico',refund_id:'Referência da devolução'};
export const actions:Record<string,string>={...previous,'payments.allocation_reversed':'Alocação de pagamento estornada','payments.refund_paid':'Devolução efetiva registrada'};
