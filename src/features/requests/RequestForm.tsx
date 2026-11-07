import {categoriesApi,categoriesError} from '../settings/categoriesApi';
import type {ServiceCategory} from '../../../shared/categories';
import {ClientRequestForm} from './ClientRequestForm';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {CreateRequestInput,RequestOption} from '../../../shared/requests';
import {RequestPicker} from './RequestPicker';
import {RequestItems,itemInputs,type DraftItem} from './RequestItems';
import {RequestsError} from './api';
export function RequestForm({office,client,permissions,roleCode,busy,onSave,onFailure,onPendingChange}:{office:string;client:boolean;permissions:string[];roleCode?:string;busy:boolean;onSave:(input:CreateRequestInput)=>void;onFailure:(failure:RequestsError)=>void;onPendingChange?:(pending:boolean)=>void}){
 const [categories,setCategories]=useState<ServiceCategory[]>([]),[category,setCategory]=useState(''),[retry,setRetry]=useState(0);
 const [title,setTitle]=useState(''),[message,setMessage]=useState(''),[origin,setOrigin]=useState<'presencial'|'whatsapp'>('presencial'),[priority,setPriority]=useState<'normal'|'urgent'>('normal'),[reason,setReason]=useState(''),[note,setNote]=useState(''),[customer,setCustomer]=useState<RequestOption>(),[assignee,setAssignee]=useState<RequestOption>(),[items,setItems]=useState<DraftItem[]>([]),[error,setError]=useState('');
 const failureRef=useRef(onFailure);failureRef.current=onFailure;
 useEffect(()=>{
  if(client)return;const controller=new AbortController();
  void categoriesApi.state(office,controller.signal).then(result=>{if(!controller.signal.aborted){setCategories(result.items);setError('');}}).catch(cause=>{
   if(controller.signal.aborted)return;const failure=categoriesError(cause);setError(failure.message);if(failure.status===401||failure.status===403)failureRef.current(new RequestsError(failure.status));
  });return()=>controller.abort();
 },[office,client,retry]);
 const selected=categories.find(item=>item.id===category);
 const enabled=!!selected&&(roleCode==='owner'||selected.execution_level===3||selected.execution_level===1&&permissions.includes('requests.level1')||selected.execution_level===2&&permissions.includes('requests.level2'));
 const collect=!!selected&&!enabled;
 function submit(event:FormEvent){
  event.preventDefault();if(busy)return;setError('');
  if(!selected){setError('Selecione a categoria da solicitação.');return;}
  if(!title.trim()||title.trim().length>120||/[\u0000-\u001f\u007f]/.test(title)){setError('Informe um título de até 120 caracteres.');return;}
  if(message.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)){setError('Confira a mensagem de até 2.000 caracteres.');return;}
  if(priority==='urgent'&&!reason.trim()){setError('Informe o motivo da urgência.');return;}
  try{onSave({origin,category_id:selected.id,title:title.trim(),message:message.trim(),customer_id:customer?.id??null,assignee_id:collect?null:assignee?.id??null,priority,priority_reason:priority==='urgent'?reason.trim():'',items:collect||!items.length?[]:itemInputs(items,customer),internal_note:note.trim()});}
  catch(cause){setError(cause instanceof Error?cause.message:'Confira os dados do atendimento.');}
 }
 if(client)return <ClientRequestForm office={office} busy={busy} onSave={onSave} onFailure={onFailure} onPendingChange={onPendingChange}/>;
 return <form className="request-form" onSubmit={submit} noValidate>
  {error&&<p role="alert" className="form-feedback error">{error}</p>}
  <fieldset disabled={busy}>
   <label className="team-field">Categoria da solicitação<select value={category} onChange={event=>{setCategory(event.target.value);setItems([]);setAssignee(undefined);}} required><option value="">Selecione a categoria</option>{categories.map(item=><option key={item.id} value={item.id}>{item.name} · {item.execution_level?`Nível ${item.execution_level}`:'Nível pendente'}</option>)}</select></label>
   {!categories.length&&<button type="button" className="team-text-button" onClick={()=>setRetry(n=>n+1)}>Atualizar categorias</button>}
   {selected&&<p className="customer-note">{collect?'Pré-atendimento: colete os dados, notas e anexos e encaminhe à equipe habilitada. A execução depende da habilitação vigente.':'Atendimento: sua habilitação permite executar esta categoria. A autorização será conferida na abertura.'}</p>}
   <div className="request-grid">
    <label className="team-field request-wide">Título<input autoComplete="off" maxLength={120} value={title} onChange={event=>setTitle(event.target.value)}/></label>
    <label className="team-field">Origem<select value={origin} onChange={event=>setOrigin(event.target.value as typeof origin)}><option value="presencial">Presencial</option><option value="whatsapp">WhatsApp</option></select></label>
    <label className="team-field request-wide">Mensagem e dados coletados<textarea rows={3} maxLength={2000} value={message} onChange={event=>setMessage(event.target.value)}/></label>
   </div>
   {enabled&&<details className="service-section"><summary>Serviços e dados do atendimento</summary><p className="customer-note">Serviços opcionais nesta abertura. Selecione somente serviços da categoria escolhida; o banco confere a correspondência.</p><RequestItems office={office} items={items} permissions={permissions} busy={busy} onChange={setItems} onFailure={onFailure}/></details>}
   <details className="service-section"><summary>Pessoa do atendimento</summary><RequestPicker office={office} kind="customers" label="pessoa" value={customer} busy={busy} onSelect={setCustomer} onFailure={onFailure}/>{customer&&<button type="button" className="team-text-button" onClick={()=>setCustomer(undefined)}>Remover pessoa</button>}<p className="customer-note">Obrigatória conforme a política dos serviços selecionados.</p></details>
   <details className="service-section"><summary>Responsável, prioridade e nota interna</summary>
    {enabled&&<><p className="customer-note">Sem outro responsável selecionado, o atendimento fica atribuído a você.</p><RequestPicker office={office} kind="assignees" label="responsável" defaultSelf value={assignee} busy={busy} onSelect={setAssignee} onFailure={onFailure}/>{assignee&&!assignee.is_self&&<button type="button" className="team-text-button" onClick={()=>setAssignee(undefined)}>Atribuir a mim</button>}</>}
    <div className="request-grid"><label className="team-field">Prioridade<select value={priority} onChange={event=>setPriority(event.target.value as typeof priority)}><option value="normal">Normal</option><option value="urgent">Urgente</option></select></label>{priority==='urgent'&&<label className="team-field">Motivo da urgência<input maxLength={500} value={reason} onChange={event=>setReason(event.target.value)}/></label>}<label className="team-field request-wide">Nota interna<textarea rows={2} maxLength={2000} value={note} onChange={event=>setNote(event.target.value)}/></label></div>
   </details>
  </fieldset>
  <button className="primary-button request-submit" disabled={busy||!selected}>{collect?'Abrir pré-atendimento':'Abrir atendimento'}</button>
 </form>;
}
