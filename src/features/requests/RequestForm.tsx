import { useState, type FormEvent } from 'react';
import type { CreateRequestInput, RequestOption } from '../../../shared/requests';
import { RequestPicker } from './RequestPicker';
import { RequestItems, itemInputs, type DraftItem } from './RequestItems';
import type { RequestsError } from './api';
export function RequestForm({office,client,permissions,busy,onSave,onFailure}:{office:string;client:boolean;permissions:string[];busy:boolean;onSave:(input:CreateRequestInput)=>void;onFailure:(failure:RequestsError)=>void}){
 const [title,setTitle]=useState(''),[message,setMessage]=useState(''),[origin,setOrigin]=useState<'presencial'|'whatsapp'>('presencial'),[priority,setPriority]=useState<'normal'|'urgent'>('normal'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[customer,setCustomer]=useState<RequestOption>(),[assignee,setAssignee]=useState<RequestOption>(),[items,setItems]=useState<DraftItem[]>([]),[error,setError]=useState('');
 function submit(event:FormEvent){event.preventDefault();if(busy)return;setError('');
  if(!title.trim()||title.trim().length>120||/[\u0000-\u001f\u007f]/.test(title)){setError('Informe um título de até 120 caracteres.');return;}
  if(client){if(!message.trim()||message.length>2000||/[\u0000-\u0008\u000b-\u001f\u007f]/.test(message)){setError('Informe uma mensagem de até 2.000 caracteres.');return;}onSave({origin:'portal',title:title.trim(),message:message.trim()});return;}
  if(priority==='urgent'&&!reason.trim()){setError('Informe o motivo da urgência.');return;}
  try{onSave({origin,title:title.trim(),customer_id:customer?.id??null,assignee_id:assignee?.id??null,priority,priority_reason:priority==='urgent'?reason.trim():'',items:itemInputs(items,customer),internal_note:note.trim()});}catch(cause){setError(cause instanceof Error?cause.message:'Confira os dados do atendimento.');}
 }
 return <form className="request-form" onSubmit={submit} noValidate>{error&&<p role="alert" className="form-feedback error">{error}</p>}<fieldset disabled={busy}>
  <div className="request-grid"><label className="team-field request-wide">Título<input autoComplete="off" maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label>
   {client?<label className="team-field request-wide">Mensagem<textarea rows={4} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/></label>:<label className="team-field">Origem<select value={origin} onChange={e=>setOrigin(e.target.value as typeof origin)}><option value="presencial">Presencial</option><option value="whatsapp">WhatsApp</option></select></label>}
  </div>
  {client?<p className="customer-note">A equipe recebe sua mensagem para triagem. Você pode solicitar atendimento antes da conferência de documentos.</p>:<>
   <details className="service-section"><summary>Serviços e dados do atendimento</summary><RequestItems office={office} items={items} permissions={permissions} busy={busy} onChange={setItems} onFailure={onFailure}/><details className="service-section"><summary>Pessoa do atendimento</summary><RequestPicker office={office} kind="customers" label="pessoa" value={customer} busy={busy} onSelect={setCustomer} onFailure={onFailure}/>{customer&&<button type="button" className="team-text-button" onClick={()=>setCustomer(undefined)}>Remover pessoa</button>}<p className="customer-note">Obrigatória conforme a política dos serviços selecionados.</p></details></details>
   <details className="service-section"><summary>Responsável, prioridade e nota interna</summary><p className="customer-note">Sem outro responsável selecionado, o atendimento fica atribuído a você.</p><RequestPicker office={office} kind="assignees" label="responsável" defaultSelf value={assignee} busy={busy} onSelect={setAssignee} onFailure={onFailure}/>{assignee&&!assignee.is_self&&<button type="button" className="team-text-button" onClick={()=>setAssignee(undefined)}>Atribuir a mim</button>}<div className="request-grid"><label className="team-field">Prioridade<select value={priority} onChange={e=>setPriority(e.target.value as typeof priority)}><option value="normal">Normal</option><option value="urgent">Urgente</option></select></label>{priority==='urgent'&&<label className="team-field">Motivo da urgência<input maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}<label className="team-field request-wide">Nota interna<textarea rows={2} maxLength={2000} value={note} onChange={e=>setNote(e.target.value)}/></label></div></details>
  </>}
  <button className="primary-button request-submit" disabled={busy}>{client?'Enviar solicitação':'Abrir atendimento'}</button>
 </fieldset></form>;
}
