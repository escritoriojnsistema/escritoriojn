import {ServiceRequest33} from '../portalIntake/ServiceRequest33';
import {IntakeCompletion33} from '../portalIntake/IntakeCompletion33';
import {peekIntakeNonce33,clearIntakeNonce33} from '../portalIntake/nonce';
import {intakeApi33} from '../portalIntake/api';
import {CommercialError} from '../documentCommercial/api';
import {useAuth} from '../auth/AuthProvider';
import type {DocumentBookingResult} from '../../../shared/modelCommercial';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import type {ServiceCategory} from '../../../shared/categories';
import type {CreateRequestInput} from '../../../shared/requests';
import {categoriesApi,CategoriesError} from '../settings/categoriesApi';
import DocumentCatalogPage from '../documentCommercial/DocumentCatalogPage';
import {RequestsError} from './api';
export function ClientRequestForm({office,busy,onSave,onFailure,onPendingChange}:{office:string;busy:boolean;onSave:(v:CreateRequestInput)=>void;onFailure:(e:RequestsError)=>void;onPendingChange?:(pending:boolean)=>void}){
 const auth=useAuth(),[serviceMode,setServiceMode]=useState(false),[resume,setResume]=useState<DocumentBookingResult>(),[resumeError,setResumeError]=useState(false),[resumeTick,setResumeTick]=useState(0);
 const [categories,setCategories]=useState<ServiceCategory[]>([]),[category,setCategory]=useState(''),[title,setTitle]=useState(''),[message,setMessage]=useState(''),[error,setError]=useState(''),[tick,setTick]=useState(0),[nested,setNested]=useState(false);
 const onPending=useRef(onPendingChange);onPending.current=onPendingChange;
 useEffect(()=>{onPending.current?.(nested);},[nested]);
 useEffect(()=>()=>{onPending.current?.(false);},[]);
 useEffect(()=>{const c=new AbortController();setError('');void categoriesApi.state(office,c.signal).then(v=>{if(!c.signal.aborted)setCategories(v.items);}).catch(e=>{if(c.signal.aborted)return;setError(e instanceof Error?e.message:'Não foi possível consultar as categorias.');if(e instanceof CategoriesError&&[401,403].includes(e.status)){setCategories([]);onFailure(new RequestsError(e.status));}});return()=>c.abort();},[office,tick]);
 useEffect(()=>{const key=peekIntakeNonce33(auth.sessionKey,office);if(!key)return;const c=new AbortController();setNested(true);setResumeError(false);void intakeApi33.resume(office,key,c.signal).then(v=>{if(!c.signal.aborted){if(v)setResume(v);else clearIntakeNonce33(auth.sessionKey,office);setNested(false);setError('');}}).catch(e=>{if(!c.signal.aborted){setError(e instanceof Error?e.message:'Não foi possível conferir a tentativa anterior.');if(e instanceof CommercialError&&[401,403].includes(e.status)){setResume(undefined);setCategories([]);setTitle('');setMessage('');setNested(false);clearIntakeNonce33(auth.sessionKey,office);onFailure(new RequestsError(e.status));}else setResumeError(true);}});return()=>c.abort();},[office,auth.sessionKey,resumeTick]);
 const selected=categories.find(c=>c.id===category),locked=busy||nested;
 function submit(e:FormEvent){e.preventDefault();if(locked||!selected||selected.is_documents)return;if(!title.trim()||title.trim().length>120||/[\u0000-\u001f\u007f]/.test(title)||!message.trim()||message.length>2000||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(message)){setError('Informe o título e a mensagem da solicitação.');return;}setError('');onSave({origin:'portal',title:title.trim(),message:message.trim(),category_id:selected.id});}
 if(resume)return <IntakeCompletion33 office={office} result={resume} onFailure={onFailure} onPendingChange={setNested} onReset={()=>{setResume(undefined);setNested(false);}}/>;
 return <div className="request-form">{!serviceMode&&<label className="team-field">Categoria<select aria-label="Categoria da solicitação" value={category} disabled={locked} onChange={e=>{setCategory(e.target.value);setServiceMode(false);setError('');}}><option value="">Selecione a categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
 {error&&<p role="alert" className="form-feedback error">{error} <button className="team-text-button" disabled={locked} onClick={()=>setTick(n=>n+1)}>Atualizar categorias</button></p>}
 {resumeError?<button className="team-text-button" onClick={()=>setResumeTick(n=>n+1)}>Conferir tentativa anterior</button>:selected?.is_documents?<DocumentCatalogPage client embedded fixedOffice={office} categoryId={selected.id} onPendingChange={setNested}/>:selected&&serviceMode?<ServiceRequest33 key={category} office={office} categoryId={selected.id} onBack={()=>setServiceMode(false)} onPendingChange={setNested} onFailure={onFailure}/>:selected&&<><button className="team-text-button" disabled={locked} onClick={()=>setServiceMode(true)}>Escolher serviço e preencher dados</button><form onSubmit={submit} noValidate><fieldset disabled={locked}><div className="request-grid"><label className="team-field request-wide">Título<input maxLength={120} value={title} onChange={e=>setTitle(e.target.value)}/></label><label className="team-field request-wide">Mensagem<textarea rows={4} maxLength={2000} value={message} onChange={e=>setMessage(e.target.value)}/></label></div></fieldset><button className="primary-button request-submit" disabled={locked}>Enviar solicitação</button></form></>}
 </div>;
}
