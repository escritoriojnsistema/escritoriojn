import {actions as previous,fields,targets as previousTargets,values} from './reportV3Catalog.js';
export {fields,values};
export const targets:Record<string,string>={...previousTargets,expense:'Despesa',payment_receipt:'Recibo de pagamento'};
export const actions:Record<string,string>={...previous,'expenses.create':'Conta a pagar registrada','expenses.approve':'Despesa aprovada','expenses.pay':'Despesa paga','cash.transferred':'Movimentação entre contas registrada','receipts.issued':'Recibo de pagamento emitido'};
