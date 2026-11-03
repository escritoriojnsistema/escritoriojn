import {useEffect,useRef,useState} from 'react';
import {servicesApi,servicesError} from './api';

export function ServiceRemoval({office,id,version,onRemoved,onDenied,onPendingChange}:{office:string;id:string;version:number;onRemoved:()=>void;onDenied:(status:number)=>void;onPendingChange:(pending:boolean)=>void}){
 const [reason,setReason]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
 const attempt=useRef<{reason:string;key:string}|undefined>(undefined),controller=useRef<AbortController|undefined>(undefined),alive=useRef(true),flight=useRef(false),pendingCallback=useRef(onPendingChange);
 pendingCallback.current=onPendingChange;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();pendingCallback.current(false);};},[]);
 useEffect(()=>pendingCallback.current(busy||uncertain),[busy,uncertain]);
 async function remove(){
  if(flight.current||!reason.trim())return;
  const command=attempt.current??{reason:reason.trim(),key:crypto.randomUUID()};attempt.current=command;
  const c=new AbortController();controller.current=c;flight.current=true;setBusy(true);setError('');
  try{await servicesApi.remove(office,id,version,command.reason,command.key,c.signal);if(alive.current&&!c.signal.aborted){attempt.current=undefined;setUncertain(false);onRemoved();}}
  catch(cause){if(alive.current&&!c.signal.aborted){const failure=servicesError(cause);setError(failure.message);setUncertain(failure.status===503);if(failure.status!==503)attempt.current=undefined;if([401,403].includes(failure.status))onDenied(failure.status);}}
  finally{if(alive.current){flight.current=false;setBusy(false);}}
 }
 return <details className="service-section"><summary>Excluir serviço</summary><p className="customer-note">O serviço sairá do catálogo e das novas solicitações. Atendimentos, preços anteriores e registros financeiros serão preservados.</p><form onSubmit={e=>{e.preventDefault();void remove();}}><label className="team-field">Motivo da exclusão<input value={reason} maxLength={500} disabled={busy||uncertain} onChange={e=>setReason(e.target.value)}/></label>{error&&<p role="alert" className="form-feedback error">{error}</p>}<button className="team-text-button" disabled={busy||!reason.trim()}>{uncertain?'Repetir exclusão':'Confirmar exclusão'}</button></form></details>;
}
