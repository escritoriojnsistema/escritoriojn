import {actions as previous,fields as previousFields,targets as previousTargets,values as previousValues} from './reportV4Catalog.js';
export const actions:Record<string,string>={...previous,'cash.closure_recorded':'Conferência por meio registrada','cash.closure_reviewed':'Divergência de fechamento revisada','cash.closure_adjusted':'Ajuste de conferência registrado'};
export const fields:Record<string,string>={...previousFields,closure_id:'Referência da conferência',differences_count:'Meios com divergência',absolute_difference_cents:'Soma absoluta das diferenças',has_difference:'Há divergência',decision:'Decisão da revisão'};
export const targets:Record<string,string>={...previousTargets,cash_closure:'Conferência de caixa'};
export const values:Record<string,string>={...previousValues,approve:'Aprovada',reject:'Rejeitada',reconcile:'Conciliação',close:'Fechamento',adjust:'Ajuste de conferência'};
