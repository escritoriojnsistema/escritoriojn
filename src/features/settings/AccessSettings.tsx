import {useEffect,useRef,useState,type FormEvent} from 'react';
import {RefreshCw} from 'lucide-react';
import {validIdleMinutes,type AccessAudience,type AccessPolicyState} from '../../../shared/sessionActivity';
import {useAuth} from '../auth/AuthProvider';
import {accessSettingsApi,AccessSettingsError} from './accessSettingsApi';
import './access-settings.css';
const presets=[15,30,60,120,180];
const label=(n:number)=>n<60?`${n} minutos`:`${n/60} ${n===60?'hora':'horas'}`;
type Props={office:string;onDenied?:()=>void;onPendingChange?:(pending:boolean)=>void};
export function AccessSettings(props:Props){
 const auth=useAuth(),context=auth.contexts.find(c=>c.office_id===props.office);
 if(auth.status!=='authorized'||!context||!['owner','admin'].includes(context.role_code)||!context.permissions.includes('access.manage'))return <p role="alert" className="form-feedback error">Seu acesso não permite gerenciar estas políticas.</p>;
 return <AccessSettingsEditor key={`${props.office}:${auth.sessionKey}:${context.role_code}:${[...context.permissions].sort().join(',')}`} {...props}/>;
}
function AccessSettingsEditor({office,onDenied,onPendingChange}:Props){
 const [state,setState]=useState<AccessPolicyState>(),[draft,setDraft]=useState<Record<AccessAudience,string>>({team:'30',client:'30'});
 const [custom,setCustom]=useState<Record<AccessAudience,boolean>>({team:false,client:false});
 const [revision,setRevision]=useState(0),[busy,setBusy]=useState(false),[error,setError]=useState<AccessSettingsError>(),[feedback,setFeedback]=useState('');
 const onPending=useRef(onPendingChange);onPending.current=onPendingChange;
 useEffect(()=>{onPending.current?.(busy);},[busy]);
 useEffect(()=>()=>onPending.current?.(false),[]);
 const pending=useRef<AbortController|null>(null),attempts=useRef(new Map<string,string>()),denied=useRef(onDenied);denied.current=onDenied;
 useEffect(()=>{const controller=new AbortController();void accessSettingsApi.state(office,controller.signal).then(data=>{if(controller.signal.aborted)return;setState(data);setDraft({team:String(data.policies.team.idle_minutes),client:String(data.policies.client.idle_minutes)});setCustom({team:!presets.includes(data.policies.team.idle_minutes),client:!presets.includes(data.policies.client.idle_minutes)});setError(undefined);}).catch(cause=>{if(controller.signal.aborted)return;const e=cause instanceof AccessSettingsError?cause:new AccessSettingsError(503);setError(e);if(e.status===401||e.status===403){setState(undefined);denied.current?.();}});return()=>controller.abort();},[office,revision]);
 useEffect(()=>()=>pending.current?.abort(),[]);
 async function save(event:FormEvent,audience:AccessAudience){
  event.preventDefault();if(busy||!state?.can_manage)return;
  const minutes=Number(draft[audience]);if(!validIdleMinutes(minutes)){setError(new AccessSettingsError(422));return;}
  const expected=state.policies[audience].revision,key=`${audience}:${minutes}:${expected}`;
  if(!attempts.current.has(key))attempts.current.set(key,crypto.randomUUID());
  const controller=new AbortController();pending.current=controller;setBusy(true);setError(undefined);setFeedback('');
  try{const result=await accessSettingsApi.save(office,audience,minutes,expected,attempts.current.get(key)!,controller.signal);if(controller.signal.aborted)return;setState(result);setDraft(previous=>({...previous,[audience]:String(result.policies[audience].idle_minutes)}));attempts.current.delete(key);setFeedback(`Prazo ${audience==='team'?'da equipe':'dos clientes'} salvo.`);}
  catch(cause){if(controller.signal.aborted)return;const e=cause instanceof AccessSettingsError?cause:new AccessSettingsError(503);setError(e);if(e.status===401||e.status===403){setState(undefined);denied.current?.();}}
  finally{if(pending.current===controller){pending.current=null;setBusy(false);}}
 }
 const fatal=error?.status===401||error?.status===403;
 return <section className="access-settings" aria-label="Políticas de inatividade">
  <div className="access-settings-intro"><p>A sessão é encerrada após o prazo sem interação. Equipe e clientes têm políticas independentes.</p><button className="operation-icon-button" aria-label="Atualizar prazos" title="Atualizar prazos" disabled={busy||fatal} onClick={()=>{setError(undefined);setFeedback('');setRevision(n=>n+1);}}><RefreshCw size={19} aria-hidden="true"/></button></div>
  {error&&<p role="alert" className="form-feedback error">{error.message}</p>}{feedback&&<p role="status" className="form-feedback">{feedback}</p>}
  {!fatal&&state&&(['team','client'] as const).map(audience=><form key={audience} onSubmit={event=>void save(event,audience)} className="access-policy-form">
   <h2>{audience==='team'?'Equipe':'Clientes'}</h2>
   <div className="access-policy-fields"><label className="team-field" htmlFor={`idle-${audience}`}>Encerrar após<select id={`idle-${audience}`} value={custom[audience]?'custom':draft[audience]} disabled={busy||!state.can_manage} onChange={event=>{setFeedback('');setError(undefined);const value=event.target.value;setCustom(previous=>({...previous,[audience]:value==='custom'}));if(value!=='custom')setDraft(previous=>({...previous,[audience]:value}));}}>{presets.map(n=><option key={n} value={n}>{label(n)}</option>)}<option value="custom">Personalizado</option></select></label>
   {custom[audience]&&<label className="team-field" htmlFor={`idle-custom-${audience}`}>Minutos (5 a 1440)<input id={`idle-custom-${audience}`} type="number" inputMode="numeric" min={5} max={1440} step={1} required disabled={busy||!state.can_manage} value={draft[audience]} onChange={event=>{setDraft(previous=>({...previous,[audience]:event.target.value}));setFeedback('');setError(undefined);}}/></label>}</div>
   <div className="team-actions"><button className="primary-button" type="submit" disabled={busy||!state.can_manage||Number(draft[audience])===state.policies[audience].idle_minutes}>Salvar prazo {audience==='team'?'da equipe':'dos clientes'}</button><button className="team-text-button" type="button" disabled={busy||Number(draft[audience])===state.policies[audience].idle_minutes} onClick={()=>{const n=state.policies[audience].idle_minutes;setDraft(previous=>({...previous,[audience]:String(n)}));setCustom(previous=>({...previous,[audience]:!presets.includes(n)}));setFeedback('');setError(undefined);}}>Cancelar</button></div>
  </form>)}
  {error&&!fatal&&!state&&<button className="team-text-button" type="button" onClick={()=>setRevision(n=>n+1)}>Tentar novamente</button>}
 </section>;
}
