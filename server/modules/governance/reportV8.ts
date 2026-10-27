import type { AuditEvent, AuditReport } from '../../../shared/governance.js';
import type { AuditPdfInput } from './auditPdf.js';
import {actions,fields,targets,values} from './reportV8Catalog.js';
// Presentation8 adds draft documents, preserving presentations1–7.
function value(v:unknown):string {
 if(v===null||v===undefined)return 'Não informado';
 if(typeof v==='boolean')return v?'Sim':'Não';
 if(Array.isArray(v))return v.map(value).join(', ');
 if(typeof v==='string')return values[v]??({recent:'Recentes',archived:'Arquivados'} as Record<string,string>)[v]??v;
 if(typeof v==='number')return String(v);
 return 'Informação estruturada registrada';
}
export function reportInputV8(r:AuditReport,events:AuditEvent[]):AuditPdfInput {
 if(r.renderer_version!==8||r.contract_version!==1||events.length!==r.count)throw new Error('Unsupported or incomplete snapshot');
 return {reportId:r.protocol,officeName:r.office_name,actorName:r.actor_name,generatedAt:r.created_at,scopeLabel:r.view==='archived'?'Arquivados':'Recentes',totalEvents:r.count,
  filters:{Ação:r.filters.action?actions[r.filters.action]??'Evento de outro módulo':'Todas',Responsável:r.filters.actor_id||'Todos',De:r.filters.from||'Início do histórico',Até:r.filters.until||'Data da emissão','Fuso horário':'UTC','Corte do arquivamento':r.cutoff},
  events:events.map(e=>({actionLabel:actions[e.action]??'Evento de outro módulo',occurredAt:e.occurred_at,actorName:e.actor_name,targetLabel:targets[e.target_type]??'Outro registro',outcomeLabel:e.outcome==='success'?'Concluído':e.outcome==='denied'?'Negado':'Falha',
   changes:Object.entries(e.changes).map(([k,v])=>({label:fields[k]??'Informação adicional',value:typeof v==='number'&&k.endsWith('_cents')?`${v<0?'-':''}R$ ${Math.floor(Math.abs(v)/100).toString().replace(/\B(?=(\d{3})+(?!\d))/g,'.')},${(Math.abs(v)%100).toString().padStart(2,'0')}`:value(v)})),
   reference:`Evento: ${e.id}; registro: ${e.target_id??'Sem referência'}; solicitação: ${e.request_id}`}))};
}
