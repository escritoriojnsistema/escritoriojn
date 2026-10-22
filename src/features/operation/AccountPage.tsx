import {useEffect,useRef,useState,type FormEvent} from 'react';
import {KeyRound,ArrowRight,CircleUserRound,Save,FilePenLine,MailCheck} from 'lucide-react';
import {Link,useLocation} from 'react-router-dom';
import type {AccessContext} from '../../../shared/access';
import {validAccountInput,type AccountData,type AccountInput} from '../../../shared/account';
import {formatCpf} from '../../../shared/identifiers';
import {paths,normalizePathname} from '../../app/routes';
import {useAuth} from '../auth/AuthProvider';
import {OperationalAccess} from './OperationalAccess';
import {OperationHeading} from './OperationLayout';
import {operationRoleNames} from './navigation';
import {AccountFields,normalizeAccountInput} from './AccountFields';
import {accountApi,AccountError,confirmAccountEmail} from './accountApi';
import '../team/team.css';
import '../requests/requests.css';

export default function AccountPage(){
 const client=normalizePathname(useLocation().pathname)===paths.clientAccount;
 return <OperationalAccess client={client}>{contexts=><AccountWorkspace key={contexts[0].user_id+contexts[0].office_id} context={contexts[0]} client={client}/>}</OperationalAccess>;
}
function AccountWorkspace({context,client}:{context:AccessContext;client:boolean}){
 const auth=useAuth(),[data,setData]=useState<AccountData>(),[value,setValue]=useState<AccountInput>({name:context.display_name??'',cpf:null,email:''}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[feedback,setFeedback]=useState(''),[revision,setRevision]=useState(0),[blocked,setBlocked]=useState(false);
 const pending=useRef<AbortController|null>(null),busyRef=useRef(false),office=context.office_id;
 useEffect(()=>()=>pending.current?.abort(),[]);
 useEffect(()=>{const controller=new AbortController();void accountApi.read(office,controller.signal).then(result=>{if(!controller.signal.aborted){setData(result);setValue({name:result.name,cpf:result.cpf,email:result.pending_email??result.email});setError('');}}).catch(cause=>{if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'Não foi possível consultar a conta.');if(cause instanceof AccountError&&[401,403].includes(cause.status)){setBlocked(true);setData(undefined);setValue({name:'',cpf:null,email:''});}}});return()=>controller.abort();},[office,revision]);
 const normalized=normalizeAccountInput(value),changed=!!data&&(normalized.name!==data.name||normalized.cpf!==data.cpf||normalized.email!==(data.pending_email??data.email));
 useEffect(()=>{const refresh=()=>{if(!busyRef.current&&(client||!changed)&&document.visibilityState==='visible')setRevision(n=>n+1);};window.addEventListener('focus',refresh);window.addEventListener('jn:inbox-update',refresh);return()=>{window.removeEventListener('focus',refresh);window.removeEventListener('jn:inbox-update',refresh);};},[client,changed]);
 async function emailConfirmation(email:string,signal:AbortSignal){await confirmAccountEmail(email,auth.sessionKey,client,signal);if(!signal.aborted)setFeedback('Confira as instruções de confirmação no e-mail atual e no novo. A troca só termina após a confirmação exigida pelo provedor.');}
 async function save(event:FormEvent){
  event.preventDefault();if(busyRef.current||!data||blocked||client)return;
  if(!validAccountInput(normalized)){setError('Confira o nome completo, os dígitos do CPF e o e-mail.');return;}
  const controller=new AbortController();pending.current=controller;busyRef.current=true;setBusy(true);setError('');setFeedback('');
  try{const result=await accountApi.save(office,data.version,normalized,controller.signal);if(controller.signal.aborted)return;setData(result);setValue({name:result.name,cpf:result.cpf,email:result.pending_email??result.email});setFeedback('Dados pessoais atualizados.');auth.refresh();if(result.pending_email)await emailConfirmation(result.pending_email,controller.signal);}
  catch(cause){if(!controller.signal.aborted){setError(cause instanceof Error?cause.message:'Não foi possível salvar.');if(cause instanceof AccountError&&[401,403].includes(cause.status)){setBlocked(true);setData(undefined);}}}
  finally{if(!controller.signal.aborted){busyRef.current=false;setBusy(false);}if(pending.current===controller)pending.current=null;}
 }
 async function confirm(){if(!data?.pending_email||busyRef.current||blocked)return;const controller=new AbortController();pending.current=controller;busyRef.current=true;setBusy(true);setError('');try{await emailConfirmation(data.pending_email,controller.signal);}catch(cause){if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:'Não foi possível enviar a confirmação.');}finally{if(!controller.signal.aborted){setBusy(false);busyRef.current=false;}}}
 return <>
  <OperationHeading context={context} title="Conta" showRole={false} description={client?'Consulte seus dados e solicite correções.':'Edite os dados pessoais do seu acesso ao escritório.'}/>
  <section className="operation-account" aria-labelledby="account-title"><div className="operation-section-title"><CircleUserRound size={23} aria-hidden="true"/><h2 id="account-title">Dados de acesso</h2></div>
   {feedback&&<p role="status" className="form-feedback">{feedback}</p>}{error&&<p role="alert" className="form-feedback error">{error}</p>}
   {!blocked&&<>{client?<><dl className="operation-details"><div><dt>Nome</dt><dd>{data?.name??context.display_name??'Não informado'}</dd></div><div><dt>CPF</dt><dd>{data?.cpf?formatCpf(data.cpf):data?.cpf_masked??'Não informado'}</dd></div><div className="account-email-detail"><dt>E-mail de acesso</dt><dd>{data?.email??'Não informado'}</dd></div></dl><p className="operation-note">Para corrigir seus dados, abra uma solicitação.</p></>:<form id="account-edit" className="request-form" onSubmit={save} noValidate><fieldset disabled={busy||!data}><AccountFields value={value} onChange={setValue} masked={data?.cpf_masked}/></fieldset></form>}
   <details className="account-access-info"><summary>Perfil e escritório</summary><dl className="operation-details"><div><dt>Perfil de acesso</dt><dd>{operationRoleNames[context.role_code]}</dd></div><div><dt>Escritório</dt><dd>{context.office_name}</dd></div></dl></details>
   {data?.pending_email&&<div><p className="customer-note">E-mail pendente de confirmação: {data.pending_email}. O acesso atual continua em {data.email} até a confirmação.</p><button className="team-text-button" disabled={busy} onClick={()=>void confirm()}><MailCheck size={18} aria-hidden="true"/>Enviar confirmação</button></div>}
   {error&&<button className="team-text-button" disabled={busy} onClick={()=>{setError('');setRevision(n=>n+1);}}>Reabrir dados da conta</button>}</>}
  </section>
  {!blocked&&<div className="account-actions">{client?<Link className="primary-button" to={paths.clientRequests} state={{office_id:office,...(data?.correction_request_id?{request_id:data.correction_request_id}:{account_correction:true})}}><FilePenLine size={18} aria-hidden="true"/>{data?.correction_request_id?'Acompanhar correção':'Solicitar correção'}</Link>:changed&&<><button className="primary-button" form="account-edit" disabled={busy}><Save size={18} aria-hidden="true"/>Salvar alterações</button><button type="button" className="secondary-button" disabled={busy} onClick={()=>{setError('');setFeedback('');if(data)setValue({name:data.name,cpf:data.cpf,email:data.pending_email??data.email});}}>Cancelar</button></>}</div>}
  <section className="operation-security" aria-labelledby="security-title"><div><h2 id="security-title"><KeyRound size={21} aria-hidden="true"/>Segurança</h2><p>Precisa de uma nova senha? Receba as instruções no seu e-mail.</p></div><Link className="secondary-button" to={`${paths.recovery}?area=${client?'client':'team'}`}>Recuperar senha<ArrowRight size={18} aria-hidden="true"/></Link></section>
 </>;
}
