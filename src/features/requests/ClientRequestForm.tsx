import {CategoryRequestForm} from '../categoryIntake/CategoryRequestForm';
import {IntakeCompletion33} from '../portalIntake/IntakeCompletion33';
import {peekIntakeNonce33,clearIntakeNonce33} from '../portalIntake/nonce';
import {intakeApi33} from '../portalIntake/api';
import {CommercialError} from '../documentCommercial/api';
import {useAuth} from '../auth/AuthProvider';
import type {DocumentBookingResult} from '../../../shared/modelCommercial';
import {useEffect,useRef,useState} from 'react';
import type {ServiceCategory} from '../../../shared/categories';
import type {CreateRequestInput} from '../../../shared/requests';
import {categoriesApi,CategoriesError} from '../settings/categoriesApi';

import {RequestsError} from './api';
export function ClientRequestForm({office,busy,onSave,onFailure,onPendingChange}:{office:string;busy:boolean;onSave:(v:CreateRequestInput)=>void;onFailure:(e:RequestsError)=>void;onPendingChange?:(pending:boolean)=>void}){
 const auth=useAuth(),[resume,setResume]=useState<DocumentBookingResult>(),[resumeError,setResumeError]=useState(false),[resumeTick,setResumeTick]=useState(0);
 const [categories,setCategories]=useState<ServiceCategory[]>([]),[category,setCategory]=useState(''),[error,setError]=useState(''),[tick,setTick]=useState(0),[nested,setNested]=useState(false);
 const onPending=useRef(onPendingChange);onPending.current=onPendingChange;
 useEffect(()=>{onPending.current?.(nested);},[nested]);
 useEffect(()=>()=>{onPending.current?.(false);},[]);
 useEffect(()=>{const c=new AbortController();setError('');void categoriesApi.state(office,c.signal).then(v=>{if(!c.signal.aborted)setCategories(v.items);}).catch(e=>{if(c.signal.aborted)return;setError(e instanceof Error?e.message:'Não foi possível consultar as categorias.');if(e instanceof CategoriesError&&[401,403].includes(e.status)){setCategories([]);onFailure(new RequestsError(e.status));}});return()=>c.abort();},[office,tick]);
 useEffect(()=>{const key=peekIntakeNonce33(auth.sessionKey,office);if(!key)return;const c=new AbortController();setNested(true);setResumeError(false);void intakeApi33.resume(office,key,c.signal).then(v=>{if(!c.signal.aborted){if(v)setResume(v);else clearIntakeNonce33(auth.sessionKey,office);setNested(false);setError('');}}).catch(e=>{if(!c.signal.aborted){setError(e instanceof Error?e.message:'Não foi possível conferir a tentativa anterior.');if(e instanceof CommercialError&&[401,403].includes(e.status)){setResume(undefined);setCategories([]);setNested(false);clearIntakeNonce33(auth.sessionKey,office);onFailure(new RequestsError(e.status));}else setResumeError(true);}});return()=>c.abort();},[office,auth.sessionKey,resumeTick]);
 const selected=categories.find(c=>c.id===category),locked=busy||nested;
 void onSave;
 if(resume)return <IntakeCompletion33 office={office} result={resume} onFailure={onFailure} onPendingChange={setNested} onReset={()=>{setResume(undefined);setNested(false);}}/>;
 return <div className="request-form">{<label className="team-field">Categoria<select aria-label="Categoria da solicitação" value={category} disabled={locked} onChange={e=>{setCategory(e.target.value);setError('');}}><option value="">Selecione a categoria</option>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
 {error&&<p role="alert" className="form-feedback error">{error} <button className="team-text-button" disabled={locked} onClick={()=>setTick(n=>n+1)}>Atualizar categorias</button></p>}
 {resumeError?<button className="team-text-button" onClick={()=>setResumeTick(n=>n+1)}>Conferir tentativa anterior</button>:selected&&<CategoryRequestForm key={category} office={office} category={selected} busy={busy} onBack={()=>setCategory('')} onFailure={onFailure} onPendingChange={setNested}/>}
 </div>;
}
