import {Link} from 'react-router-dom';
import {paths} from '../../app/routes';
import {useEffect,useRef,useState,type FormEvent} from 'react';
import {Send} from 'lucide-react';
import {validAccountInput,type AccountData,type AccountInput} from '../../../shared/account';
import type {RequestDetail} from '../../../shared/requests';
import {AccountFields,normalizeAccountInput} from '../operation/AccountFields';
import {accountApi,AccountError} from '../operation/accountApi';
import {RequestsError} from './api';

export function AccountCorrectionForm({office,onCreated,onFailure}:{office:string;onCreated:(data:RequestDetail)=>void;onFailure:(error:RequestsError)=>void}){
 const [data,setData]=useState<AccountData>(),[value,setValue]=useState<AccountInput>({name:'',cpf:null,email:''}),[error,setError]=useState(''),[busy,setBusy]=useState(false),[revision,setRevision]=useState(0),[blocked,setBlocked]=useState(false);
 const pending=useRef<AbortController|null>(null),busyRef=useRef(false),attempt=useRef({payload:'',key:crypto.randomUUID()});
 useEffect(()=>()=>pending.current?.abort(),[]);
 useEffect(()=>{const controller=new AbortController();void accountApi.read(office,controller.signal).then(result=>{if(!controller.signal.aborted){setData(result);setValue({name:result.name,cpf:result.cpf,email:result.email});setError('');}}).catch(cause=>{if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'Não foi possível consultar os dados.');if(cause instanceof AccountError&&[401,403].includes(cause.status)){setBlocked(true);onFailure(new RequestsError(cause.status));}}});return()=>controller.abort();},[office,revision,onFailure]);
 const input=normalizeAccountInput(value),changed=!!data&&(input.name!==data.name||input.cpf!==data.cpf||input.email!==data.email);
 async function send(event:FormEvent){event.preventDefault();if(!data||busyRef.current||blocked||!changed)return;if(!validAccountInput(input)){setError('Confira o nome completo, o CPF e o e-mail propostos.');return;}
  const payload=JSON.stringify([data.version,input]);if(attempt.current.payload!==payload)attempt.current={payload,key:crypto.randomUUID()};
  const controller=new AbortController();pending.current=controller;busyRef.current=true;setBusy(true);setError('');
  try{const result=await accountApi.create(office,data.version,input,attempt.current.key,controller.signal);if(!controller.signal.aborted){window.dispatchEvent(new Event('jn:notices-changed'));onCreated(result);}}
  catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'Não foi possível enviar. Confira sua lista antes de repetir.');if(cause instanceof AccountError&&[401,403].includes(cause.status)){setBlocked(true);onFailure(new RequestsError(cause.status));}}}
  finally{if(!controller.signal.aborted){setBusy(false);busyRef.current=false;}}
 }
 return <form className="request-form account-correction-form" onSubmit={send} noValidate><p className="customer-note">Altere os dados abaixo para solicitar a correção. O cadastro atual será mantido até a conferência da equipe autorizada. A troca de e-mail exige confirmação do titular após a aprovação.</p>{error&&<p role="alert" className="form-feedback error">{error}</p>}{!blocked&&<><fieldset disabled={busy||!data}><AccountFields value={value} onChange={setValue} masked={data?.cpf_masked}/></fieldset><div className="account-actions">{changed&&<button className="primary-button" disabled={busy}><Send size={18} aria-hidden="true"/>Enviar</button>}<Link className="secondary-button" to={paths.clientAccount} onClick={e=>{if(busy)e.preventDefault();}} aria-disabled={busy}>Cancelar</Link></div></>}{error&&!blocked&&<button type="button" className="team-text-button" disabled={busy} onClick={()=>setRevision(n=>n+1)}>Reabrir formulário</button>}</form>;
}
