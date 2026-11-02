import {useEffect,useRef,useState} from 'react';
import {workflowBlockers,type WorkflowCommand,type WorkflowState} from '../../../shared/documentWorkflow';
import {CommercialError} from '../documentCommercial/api';
import {workflowApi} from './api';
export function WorkflowPanel({office,documentId,revision,disabled,onDenied,onChanged,onPendingChange}:{office:string;documentId:string;revision:number;disabled:boolean;onDenied:(status:number)=>void;onChanged?:()=>void;onPendingChange?:(pending:boolean)=>void}){
 const [state,setState]=useState<WorkflowState>(),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0),[message,setMessage]=useState(''),[action,setAction]=useState('freeze');
 const alive=useRef(true),controller=useRef<AbortController|null>(null),flight=useRef(false),attempt=useRef<{command:WorkflowCommand;key:string}|null>(null),blob=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();if(blob.current)URL.revokeObjectURL(blob.current);};},[]);
 function fail(e:unknown){const status=e instanceof CommercialError?e.status:503;setError(e instanceof Error?e.message:'Não foi possível concluir a operação.');if(status!==503)attempt.current=null;if(status===401||status===403){setState(undefined);onDenied(status);}}
 useEffect(()=>{const c=new AbortController();void workflowApi.state(office,documentId,c.signal).then(v=>{if(!c.signal.aborted)setState(v);}).catch(e=>{if(!c.signal.aborted)fail(e);});return()=>c.abort();},[office,documentId,revision,tick]);
 async function run(work:(s:AbortSignal)=>Promise<void>){if(flight.current||disabled)return;const c=new AbortController();controller.current=c;flight.current=true;setBusy(true);onPendingChange?.(true);setError('');setMessage('');try{await work(c.signal);}catch(e){if(alive.current&&!c.signal.aborted)fail(e);}finally{if(alive.current){flight.current=false;setBusy(false);onPendingChange?.(!!attempt.current);}}}
 function command(next:WorkflowCommand){void run(async s=>{const a=attempt.current??{command:next,key:crypto.randomUUID()};attempt.current=a;const v=await workflowApi.command(office,documentId,a.command,a.key,s);if(alive.current&&!s.aborted){attempt.current=null;setState(v);setMessage('Etapa documental registrada.');onChanged?.();}});}
 function generate(id:string){void run(async s=>{await workflowApi.generate(office,id,s);const v=await workflowApi.state(office,documentId,s);if(alive.current&&!s.aborted){setState(v);setMessage('PDF canônico gerado e preservado.');}});}
 function download(id:string){void run(async s=>{const bytes=await workflowApi.download(office,id,s);if(!alive.current||s.aborted)return;if(blob.current)URL.revokeObjectURL(blob.current);blob.current=URL.createObjectURL(bytes);const a=document.createElement('a');a.href=blob.current;a.download='documento.pdf';a.click();});}
 const locked=busy||disabled||!!attempt.current;
 const publication=state?.publications.find(p=>p.revision===revision);
 const needsReason=['freeze','approve','reject','signature','handoff'].includes(action);
 const actions=[{id:'refresh',label:'Atualizar etapas',allowed:true},{id:'freeze',label:'Fixar versão para revisão',allowed:!!state?.can_work},
 {id:'approve',label:'Aprovar documento',allowed:!!publication&&!!state?.can_review&&publication.review_required},
 {id:'reject',label:'Devolver para correção',allowed:!!publication&&!!state?.can_review&&publication.review_required},
 {id:'signature',label:'Registrar assinatura física conferida',allowed:!!publication&&!!state?.can_work&&publication.signature_policy==='physical'&&!publication.signed&&publication.approved},
 {id:'generate',label:publication?.artifact_ready?'Conferir PDF preservado':'Gerar PDF aprovado',allowed:!!publication&&!!state?.can_work&&publication.approved},
 {id:'download',label:'Baixar arquivo aprovado',allowed:!!publication?.artifact_ready},
 {id:'handoff',label:'Enviar ao caixa',allowed:!!publication&&!!state?.can_work&&!publication.handed_off&&publication.approved&&publication.signed&&publication.artifact_ready}];
 function execute(){
  if(attempt.current){command(attempt.current.command);return;}
  if(action==='refresh'){setTick(t=>t+1);onChanged?.();return;}
  if(action==='freeze'){command({kind:'freeze',expected_revision:revision,reason:reason.trim()});return;}
  if(!publication)return;
  if(action==='generate'){generate(publication.id);return;}
  if(action==='download'){download(publication.id);return;}
  if(action==='approve'||action==='reject'||action==='signature'||action==='handoff')command({kind:action,publication_id:publication.id,expected_revision:revision,reason:reason.trim()});
 }
 return <section className="document-workflow" aria-label="Revisão, caixa e entrega"><h2>Revisão, caixa e entrega</h2>
 <p className="document-hint">A revisão usa o preenchimento salvo e concluído. Aprovação, assinatura e envio ao caixa continuam separados.</p>
 {error&&<p role="alert" className="form-feedback error">{error}</p>}{message&&<p role="status" className="form-feedback">{message}</p>}
 {publication&&<p className="document-hint">Revisão {publication.revision} · {publication.ready?'Disponível para o cliente vinculado':publication.blockers.map(b=>workflowBlockers[b]).join(' · ')}</p>}
 <label className="team-field">Ação documental<select aria-label="Ação documental" value={action} disabled={locked} onChange={e=>setAction(e.target.value)}>{actions.map(a=><option key={a.id} value={a.id} disabled={!a.allowed}>{a.label}</option>)}</select></label>
 {needsReason&&<label className="team-field">Motivo ou evidência da etapa<input value={reason} disabled={locked} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Descreva a conferência realizada"/></label>}
 <button className="primary-button" disabled={busy||disabled||!attempt.current&&(!actions.find(a=>a.id===action)?.allowed||needsReason&&!reason.trim())} onClick={execute}>{attempt.current?'Repetir etapa pendente':'Registrar ação'}</button>
 {publication?.signature_policy==='external'&&<p className="document-hint">A assinatura eletrônica externa permanece bloqueada até a conferência do original estar integrada.</p>}
 </section>;
}
