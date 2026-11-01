import {useEffect,useRef,useState} from 'react';
import {workflowBlockers,type WorkflowCommand,type WorkflowState} from '../../../shared/documentWorkflow';
import {CommercialError} from '../documentCommercial/api';
import {workflowApi} from './api';
export function WorkflowPanel({office,documentId,revision,disabled,onDenied}:{office:string;documentId:string;revision:number;disabled:boolean;onDenied:(status:number)=>void}){
 const [state,setState]=useState<WorkflowState>(),[reason,setReason]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),[tick,setTick]=useState(0),[message,setMessage]=useState('');
 const alive=useRef(true),controller=useRef<AbortController|null>(null),flight=useRef(false),attempt=useRef<{command:WorkflowCommand;key:string}|null>(null),blob=useRef<string|null>(null);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;controller.current?.abort();if(blob.current)URL.revokeObjectURL(blob.current);};},[]);
 function fail(e:unknown){const status=e instanceof CommercialError?e.status:503;setError(e instanceof Error?e.message:'Não foi possível concluir a operação.');if(status!==503)attempt.current=null;if(status===401||status===403){setState(undefined);onDenied(status);}}
 useEffect(()=>{const c=new AbortController();void workflowApi.state(office,documentId,c.signal).then(v=>{if(!c.signal.aborted)setState(v);}).catch(e=>{if(!c.signal.aborted)fail(e);});return()=>c.abort();},[office,documentId,revision,tick]);
 async function run(work:(s:AbortSignal)=>Promise<void>){if(flight.current||disabled)return;const c=new AbortController();controller.current=c;flight.current=true;setBusy(true);setError('');setMessage('');try{await work(c.signal);}catch(e){if(alive.current&&!c.signal.aborted)fail(e);}finally{if(alive.current){flight.current=false;setBusy(false);}}}
 function command(next:WorkflowCommand){void run(async s=>{const a=attempt.current??{command:next,key:crypto.randomUUID()};attempt.current=a;const v=await workflowApi.command(office,documentId,a.command,a.key,s);if(alive.current&&!s.aborted){attempt.current=null;setState(v);setMessage('Etapa documental registrada.');}});}
 function generate(id:string){void run(async s=>{await workflowApi.generate(office,id,s);const v=await workflowApi.state(office,documentId,s);if(alive.current&&!s.aborted){setState(v);setMessage('PDF canônico gerado e preservado.');}});}
 function download(id:string){void run(async s=>{const bytes=await workflowApi.download(office,id,s);if(!alive.current||s.aborted)return;if(blob.current)URL.revokeObjectURL(blob.current);blob.current=URL.createObjectURL(bytes);const a=document.createElement('a');a.href=blob.current;a.download='documento.pdf';a.click();});}
 const locked=busy||disabled||!!attempt.current;
 return <section className="document-workflow" aria-label="Revisão, caixa e entrega"><h2>Revisão, caixa e entrega</h2><p className="document-hint">Conclua e salve o preenchimento antes de fixar a versão para entrega. Alterações posteriores exigem uma nova versão.</p>
 {error&&<p role="alert" className="form-feedback error">{error}</p>}{message&&<p role="status" className="form-feedback">{message}</p>}
 <label className="team-field">Motivo ou evidência da etapa<input value={reason} disabled={locked} maxLength={500} onChange={e=>setReason(e.target.value)} placeholder="Descreva a conferência realizada"/></label>
 <div className="template-folder-actions"><button className="primary-button" disabled={locked||!state?.can_work||!reason.trim()} onClick={()=>command({kind:'freeze',expected_revision:revision,reason:reason.trim()})}>Fixar versão para entrega</button><button className="team-text-button" disabled={busy||disabled} onClick={()=>setTick(x=>x+1)}>Atualizar etapas</button></div>
 {attempt.current&&!busy&&<button className="team-text-button" disabled={disabled} onClick={()=>command(attempt.current!.command)}>Repetir etapa pendente</button>}
 {state?.publications.map(p=><article className="document-publication" key={p.id}><h3>{p.title} · revisão {p.revision}</h3><p>{p.ready?'Disponível para o cliente vinculado':p.blockers.map(b=>workflowBlockers[b]).join(' · ')}</p><div className="template-folder-actions">
 {p.revision===revision&&<>
 {state.can_review&&p.review_required&&<><button className="team-text-button" disabled={locked||!reason.trim()} onClick={()=>command({kind:'approve',publication_id:p.id,expected_revision:revision,reason:reason.trim()})}>Aprovar documento</button><button className="team-text-button" disabled={locked||!reason.trim()} onClick={()=>command({kind:'reject',publication_id:p.id,expected_revision:revision,reason:reason.trim()})}>Devolver para correção</button></>}
 {state.can_work&&p.signature_policy==='physical'&&!p.signed&&<button className="team-text-button" disabled={locked||!reason.trim()||!p.approved} onClick={()=>command({kind:'signature',publication_id:p.id,expected_revision:revision,reason:reason.trim()})}>Registrar assinatura física conferida</button>}
 {state.can_work&&<button className="team-text-button" disabled={locked||!p.approved} onClick={()=>generate(p.id)}>{p.artifact_ready?'Conferir PDF preservado':'Gerar PDF'}</button>}
 {p.artifact_ready&&<button className="team-text-button" disabled={locked} onClick={()=>download(p.id)}>Baixar cópia interna</button>}
 {state.can_work&&!p.handed_off&&<button className="primary-button" disabled={locked||!reason.trim()||!p.approved||!p.signed||!p.artifact_ready} onClick={()=>command({kind:'handoff',publication_id:p.id,expected_revision:revision,reason:reason.trim()})}>Enviar ao caixa</button>}
 </>}
 </div>{p.signature_policy==='external'&&<p className="document-hint">A assinatura eletrônica externa exige conferência do original assinado. Este fluxo permanece bloqueado até essa integração estar validada.</p>}</article>)}
 </section>;
}
