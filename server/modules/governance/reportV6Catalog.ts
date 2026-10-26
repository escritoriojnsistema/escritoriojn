import {actions as previous,fields as previousFields,targets as previousTargets,values as previousValues} from './reportV5Catalog.js';
export const actions:Record<string,string>={...previous,'quick.completed':'Atendimento rápido concluído','finance.report_prepared':'Relatório financeiro preparado','finance.report_exported':'Relatório financeiro exportado','finance.report_timezone_changed':'Fuso dos relatórios alterado'};
export const fields:Record<string,string>={...previousFields,format:'Formato do arquivo'};
export const targets:Record<string,string>={...previousTargets,financial_report:'Relatório financeiro',finance_report_settings:'Configuração dos relatórios'};
export const values:Record<string,string>={...previousValues,csv:'CSV',pdf:'PDF'};
