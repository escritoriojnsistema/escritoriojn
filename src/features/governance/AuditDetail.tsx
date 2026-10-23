import { useEffect, useRef } from 'react';
import { ArrowLeft, Filter } from 'lucide-react';
import type { AuditEvent } from '../../../shared/governance';
import { auditActionLabel,auditFieldLabel,auditTargetNames } from '../../../shared/governance';
import { operationRoleNames } from '../operation/navigation';
import { permissionNames } from '../../../shared/team';
function valueLabel(value:unknown):string {
 if(typeof value==='boolean')return value?'Sim':'Não';
 if(Array.isArray(value))return value.map(valueLabel).join(', ');
 if(typeof value==='string')return operationRoleNames[value as keyof typeof operationRoleNames]??permissionNames[value as keyof typeof permissionNames]??value;
 if(typeof value==='number')return String(value);
 if(value&&typeof value==='object')return 'Informação estruturada registrada';
 return 'Não informado';
}
export function AuditDetail({event,onBack,onActor}:{event:AuditEvent;onBack:()=>void;onActor:(id:string)=>void}){
 const heading=useRef<HTMLHeadingElement>(null);useEffect(()=>heading.current?.focus(),[]);
 return <section className="governance-detail"><button className="team-text-button" onClick={onBack}><ArrowLeft size={18} aria-hidden="true"/>Voltar à lista</button><h2 ref={heading} tabIndex={-1}>Detalhes do evento</h2><dl className="governance-detail-grid"><div><dt>Ação</dt><dd>{auditActionLabel(event.action)}</dd></div><div><dt>Quando</dt><dd>{new Date(event.occurred_at).toLocaleString('pt-BR')}</dd></div><div><dt>Quem fez</dt><dd>{event.actor_name}</dd></div><div><dt>Resultado</dt><dd>{event.outcome==='success'?'Concluído':event.outcome==='denied'?'Negado':'Falha'}</dd></div><div><dt>Área do registro</dt><dd>{auditTargetNames[event.target_type]??'Outro registro'}</dd></div></dl><details className="audit-technical"><summary>Referências para rastreabilidade</summary><dl className="governance-detail-grid"><div><dt>Código da ação</dt><dd>{event.action}</dd></div><div><dt>Registro</dt><dd>{event.target_id??'Sem referência'}</dd></div><div><dt>Evento</dt><dd>{event.id}</dd></div><div><dt>Solicitação</dt><dd>{event.request_id}</dd></div></dl></details><h3>Alterações registradas</h3>{Object.keys(event.changes).length?<dl className="governance-detail-grid">{Object.entries(event.changes).map(([key,value])=><div key={key}><dt>{auditFieldLabel(key)}</dt><dd>{valueLabel(value)}</dd></div>)}</dl>:<p className="team-hint">Este evento não possui alterações adicionais.</p>}{event.actor_id&&<button className="team-text-button" onClick={()=>onActor(event.actor_id!)}><Filter size={18} aria-hidden="true"/>Eventos desta pessoa</button>}</section>;
}
