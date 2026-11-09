import {useCallback,useEffect,useRef,useState} from 'react';
import {officialDitrSource,type DitrCalendar,type DitrCommand,type DitrEvidence,type DitrState} from '../../../shared/ditr';
import type {AttachmentPage} from '../../../shared/attachments';
import {commercialRequest} from '../documentCommercial/api';
import {attachmentsApi} from '../attachments/api';

type Props={office:string;propertyId:string;canManage:boolean;canReadFiles:boolean;refreshVersion?:number;onPendingChange?:(pending:boolean)=>void};
type Area='cases'|'create'|'evidence'|'calendar';
const evidenceLabels:Record<DitrEvidence['kind'],string>={receipt:'Recibo externo',tax_guide:'Guia de tributo',tax_payment:'Comprovante de tributo'};
const money=(cents:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(cents/100);
const date=(value:string)=>value.split('-').reverse().join('/');
function amount(value:string):number|null{
 if(!/^\d+(?:[,.]\d{1,2})?$/.test(value))return null;
 const [whole,part='']=value.replace(',','.').split('.');const cents=Number(whole)*100+Number(part.padEnd(2,'0'));
 return Number.isSafeInteger(cents)&&cents<=1000000000000?cents:null;
}
const request=<T,>(path:string,body:unknown,signal?:AbortSignal)=>commercialRequest<T>(path,body,signal,'/api/rural');

export function DitrPanel(props:Props){
 const [exercise,setExercise]=useState(new Date().getUTCFullYear()),[yearText,setYearText]=useState(String(exercise)),[pending,setPending]=useState(false);
 const reportPending=useCallback((value:boolean)=>{setPending(value);props.onPendingChange?.(value);},[props.onPendingChange]);
 return <section className="ditr-panel" aria-label="Controle ITR/DITR"><div className="ditr-heading"><h3>ITR/DITR por exercício</h3><label className="team-field ditr-year">Exercício ITR/DITR<input type="number" min={1900} max={2200} value={yearText} disabled={pending} onChange={e=>{setYearText(e.target.value);const y=Number(e.target.value);if(Number.isInteger(y)&&y>=1900&&y<=2200)setExercise(y);}} onBlur={()=>setYearText(String(exercise))}/></label></div>
  <DitrWorkspace key={`${props.office}:${props.propertyId}:${exercise}`} {...props} exercise={exercise} onPendingChange={reportPending}/>
 </section>;
}

function DitrWorkspace({office,propertyId,exercise,canManage,canReadFiles,refreshVersion,onPendingChange}:Props&{exercise:number}){
 const [data,setData]=useState<DitrState>(),[area,setArea]=useState<Area>('cases'),[caseId,setCaseId]=useState<string|null>(null),[page,setPage]=useState(1),[tick,setTick]=useState(0);
 const [error,setError]=useState(''),[notice,setNotice]=useState(''),[denied,setDenied]=useState(false),[busy,setBusy]=useState(false);
 const [requestId,setRequestId]=useState(''),[modality,setModality]=useState<'original'|'rectifying'>('original'),[previousId,setPreviousId]=useState('');
 const [evidenceKind,setEvidenceKind]=useState<DitrEvidence['kind']>('receipt'),[fileId,setFileId]=useState(''),[externalReference,setExternalReference]=useState(''),[externalDate,setExternalDate]=useState(''),[amountText,setAmountText]=useState(''),[files,setFiles]=useState<AttachmentPage>(),[filePage,setFilePage]=useState(1);
 const [calendarDraft,setCalendarDraft]=useState({starts_on:'',due_on:'',source_url:'',checked_on:'',expected_calendar_id:null as string|null});
 const pending=useRef<{command:DitrCommand;key:string}|null>(null),flight=useRef(false),alive=useRef(true),mutation=useRef<AbortController|null>(null);
 const [uncertain,setUncertain]=useState(false);const locked=busy||uncertain;
 const selected=data?.selected?.id===caseId?data.selected:null;
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;mutation.current?.abort();onPendingChange?.(false);};},[onPendingChange]);
 useEffect(()=>{onPendingChange?.(locked);},[locked,onPendingChange]);
 const fail=useCallback((cause:unknown)=>{
  const status=cause&&typeof cause==='object'&&'status'in cause?Number(cause.status):503;
  setNotice('');setError(cause instanceof Error?cause.message:'Serviço indisponível. Repita a mesma tentativa.');
  if(status===401||status===403){setData(undefined);setFiles(undefined);pending.current=null;setUncertain(false);setDenied(true);}
  if(status===404){setData(undefined);setFiles(undefined);setCaseId(null);setArea('cases');setPage(1);pending.current=null;setUncertain(false);}
  return status;
 },[]);
 useEffect(()=>{
  if(denied)return;const controller=new AbortController();
  request<DitrState>('/ditr-state',{office_id:office,property_id:propertyId,exercise,case_id:caseId,page},controller.signal).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(cause=>{if(!controller.signal.aborted)fail(cause);});
  return()=>controller.abort();
 },[office,propertyId,exercise,caseId,page,tick,refreshVersion,denied,fail]);
 const evidenceRequest=area==='evidence'&&selected&&canReadFiles?selected.request_id:null;
 useEffect(()=>{
  if(!evidenceRequest||denied)return;const controller=new AbortController();
  attachmentsApi.search(office,evidenceRequest,filePage,5,controller.signal).then(value=>{if(!controller.signal.aborted)setFiles(value);}).catch(cause=>{if(!controller.signal.aborted)fail(cause);});
  return()=>controller.abort();
 },[office,evidenceRequest,filePage,denied,fail]);
 function navigate(next:Area){
  if(locked)return;setError('');setNotice('');setArea(next);setFiles(undefined);setFileId('');setFilePage(1);setPage(1);
  if(next==='calendar'){const c=data?.calendar;setCalendarDraft({starts_on:c?.starts_on??'',due_on:c?.due_on??'',source_url:c?.source_url??'',checked_on:'',expected_calendar_id:c?.id??null});}
  if(next==='create'){setRequestId('');setModality('original');setPreviousId(selected?.id??'');}
 }
 function openCase(id:string){if(locked)return;setCaseId(id);setPage(1);setArea('cases');setError('');setNotice('');setFiles(undefined);}
 const chosenRequest=data?.requests.find(r=>r.id===requestId);
 const previous=data?.items.find(c=>c.id===previousId)??(selected?.id===previousId?selected:undefined);
 const calendarValid=!!calendarDraft.starts_on&&!!calendarDraft.due_on&&calendarDraft.starts_on<=calendarDraft.due_on&&!!calendarDraft.checked_on&&calendarDraft.checked_on<=new Date().toISOString().slice(0,10)&&officialDitrSource(calendarDraft.source_url);
 const evidenceAmount=amount(amountText);
 const valid=area==='create'?!!chosenRequest&&(modality==='original'||!!previous&&previous.taxpayer_id===chosenRequest.taxpayer_id):area==='evidence'?!!selected?.can_work&&!!fileId&&!!externalDate&&(evidenceKind!=='receipt'||!!externalReference.trim())&&(evidenceKind==='receipt'||evidenceAmount!==null):area==='calendar'?calendarValid:false;
 async function save(){
  if(flight.current||denied||!pending.current&&!valid)return;
  let command:DitrCommand;
  if(pending.current)command=pending.current.command;
  else if(area==='create')command={kind:'create',exercise,request_id:requestId,modality,previous_case_id:modality==='rectifying'?previousId:null};
  else if(area==='calendar')command={kind:'calendar',exercise,...calendarDraft};
  else if(selected)command={kind:'evidence',case_id:selected.id,expected_version:selected.version,evidence_kind:evidenceKind,file_id:fileId,external_reference:externalReference.trim(),amount_cents:evidenceKind==='receipt'?null:evidenceAmount,external_date:externalDate};
  else return;
  const attempt=pending.current??{command,key:crypto.randomUUID()};pending.current=attempt;flight.current=true;setBusy(true);setError('');setNotice('');const controller=new AbortController();mutation.current=controller;
  try{
   const result=await request<{id:string|null}>('/ditr-command',{office_id:office,property_id:propertyId,...attempt},controller.signal);if(!alive.current||controller.signal.aborted)return;
   pending.current=null;setUncertain(false);setNotice('Registro ITR/DITR salvo.');setPage(1);setTick(t=>t+1);
   if(attempt.command.kind==='calendar'){setArea('cases');setCaseId(null);}
   else {setCaseId(result.id);setArea('cases');setFiles(undefined);setFileId('');setExternalReference('');setExternalDate('');setAmountText('');}
  }catch(cause){if(!alive.current||controller.signal.aborted)return;const status=fail(cause);if(status===503)setUncertain(true);else{pending.current=null;setUncertain(false);if(status===409){setArea('cases');setTick(t=>t+1);}}}
  finally{if(alive.current&&!controller.signal.aborted){flight.current=false;setBusy(false);}}
 }
 if(denied)return <p role="alert" className="form-feedback error">Acesso ITR/DITR indisponível. Confira sua sessão e permissões.</p>;
 const calendar=data?.calendar;const pagesTotal=area==='create'?data?.requests_total??0:caseId?data?.evidence_total??0:data?.total??0;
 return <>
  <div className="ditr-controls"><label className="team-field">Área ITR/DITR<select value={area} disabled={locked} onChange={e=>navigate(e.target.value as Area)}><option value="cases">Declarações e evidências</option>{canManage&&<option value="create">Abrir declaração</option>}{canManage&&canReadFiles&&selected?.can_work&&<option value="evidence">Registrar evidência externa</option>}<option value="calendar">Calendário anual</option></select></label></div>
  {error&&<p role="alert" className="form-feedback error">{error}</p>}{notice&&<p role="status" className="form-feedback success">{notice}</p>}
  {uncertain&&<p className="team-hint" role="status">Resultado ainda não confirmado. Salvar ITR/DITR repete a mesma tentativa.</p>}
  {area==='cases'&&<>
   {selected?<><div className="ditr-case-heading"><h4>{selected.taxpayer_name}</h4><button type="button" className="team-text-button" disabled={locked} onClick={()=>{setCaseId(null);setPage(1);}}>Ver declarações do exercício</button></div><p>{selected.modality==='original'?'Original':'Retificadora'} · revisão {selected.revision}</p><p>Protocolo interno: {selected.internal_protocol}</p><p className="team-hint">Responsável: {selected.responsible_name}. O protocolo interno não confirma aceitação pelo órgão.</p>
    {selected.previous_case_id&&<p className="ditr-chain">Declaração anterior preservada. <button type="button" className="team-text-button" disabled={locked} onClick={()=>openCase(selected.previous_case_id!)}>Consultar anterior</button></p>}
    <div className="ditr-detail-sections"><section className="ditr-summary" aria-label="Honorários do atendimento"><h4>Honorários do escritório</h4>{selected.service?<p>Honorários {money(selected.service.total_cents)} · pagos {money(selected.service.paid_cents)} · saldo {money(selected.service.balance_cents)}</p>:<p>Consulte a cobrança do atendimento com o acesso financeiro autorizado.</p>}<p className="team-hint">Pagamento do serviço não significa ITR pago. Tributos e guias são registrados separadamente abaixo.</p></section>
    <section aria-label="Evidências externas"><h4>Evidências externas</h4>{data?.evidence.length?data.evidence.map(e=><article key={e.id} className="ditr-evidence"><p><strong>{evidenceLabels[e.kind]}</strong>{e.amount_cents!==null?` · ${money(e.amount_cents)}`:''} · {date(e.external_date)}</p>{e.external_reference&&<p>Referência informada: {e.external_reference}</p>}<p className="team-hint">Arquivo vinculado · registrado por {e.actor_name}. Informação externa registrada; não é validação do órgão.</p></article>):<p>Nenhuma evidência externa registrada nesta página.</p>}</section></div>
   </>:<>{data?.items.map(item=><article key={item.id} className="team-row ditr-case-row"><div><strong>{item.taxpayer_name}</strong><p>{item.modality==='original'?'Original':'Retificadora'} · revisão {item.revision} · {item.internal_protocol}</p></div><button type="button" disabled={locked} onClick={()=>openCase(item.id)}>Abrir declaração</button></article>)}{data?.items.length===0&&<p>Nenhuma declaração neste imóvel e exercício.</p>}</>}
  </>}
  {area==='create'&&<><fieldset disabled={locked} className="ditr-fields"><legend>Nova declaração do exercício {exercise}</legend><label className="team-field">Modalidade da declaração<select value={modality} onChange={e=>setModality(e.target.value as typeof modality)}><option value="original">Original</option><option value="rectifying">Retificadora</option></select></label><label className="team-field">Atendimento do contribuinte<select value={requestId} onChange={e=>setRequestId(e.target.value)}><option value="">Selecione</option>{data?.requests.map(r=><option value={r.id} key={r.id}>{r.protocol} · {r.taxpayer_name}</option>)}</select></label>{chosenRequest&&<p className="team-hint ditr-wide">Contribuinte: {chosenRequest.taxpayer_name}. Honorários seguem a cobrança deste atendimento.</p>}{modality==='rectifying'&&<label className="team-field ditr-wide">Declaração anterior<select value={previousId} onChange={e=>setPreviousId(e.target.value)}><option value="">Selecione na cadeia preservada</option>{(selected&&!data?.items.some(c=>c.id===selected.id)?[...data?.items??[],selected]:data?.items??[]).map(c=><option key={c.id} value={c.id}>{c.taxpayer_name} · revisão {c.revision} · {c.internal_protocol}</option>)}</select></label>}</fieldset><p className="team-hint">Use um atendimento próprio, já vinculado a este imóvel, e cliente com papel Contribuinte no período do exercício. Se a lista estiver vazia, confira Pessoas e histórico e Vincular atendimento ou arquivo.</p></>}
  {area==='evidence'&&selected&&<><fieldset disabled={locked} className="ditr-fields"><legend>Evidência externa · {selected.internal_protocol}</legend><label className="team-field">Tipo de evidência<select value={evidenceKind} onChange={e=>setEvidenceKind(e.target.value as DitrEvidence['kind'])}>{Object.entries(evidenceLabels).map(([key,label])=><option value={key} key={key}>{label}</option>)}</select></label><label className="team-field">Arquivo do atendimento<select value={fileId} onChange={e=>setFileId(e.target.value)}><option value="">Selecione</option>{files?.items.filter(f=>f.status==='quarentena'||f.status==='disponivel').map(f=><option key={f.id} value={f.id}>{f.name} · {f.status==='quarentena'?'em quarentena':'disponível'}</option>)}</select></label><label className="team-field">Referência externa informada<input value={externalReference} onChange={e=>setExternalReference(e.target.value)} maxLength={120} autoComplete="off"/></label><label className="team-field">Data externa informada<input type="date" value={externalDate} onChange={e=>setExternalDate(e.target.value)}/></label>{evidenceKind!=='receipt'&&<label className="team-field">Valor externo (R$)<input inputMode="decimal" value={amountText} onChange={e=>setAmountText(e.target.value)} maxLength={16} placeholder="0,00"/></label>}</fieldset><p className="team-hint">A data corresponde ao recibo, ao vencimento da guia ou ao comprovante selecionado. O registro preserva o arquivo; não libera quarentena nem confirma quitação ou aceitação oficial.</p><div className="team-pagination"><button type="button" disabled={locked||filePage===1} onClick={()=>{setFiles(undefined);setFileId('');setFilePage(p=>p-1);}}>Arquivos anteriores</button><span>Página {filePage}</span><button type="button" disabled={locked||!files||filePage*5>=files.total} onClick={()=>{setFiles(undefined);setFileId('');setFilePage(p=>p+1);}}>Próximos arquivos</button></div></>}
  {area==='calendar'&&<><CalendarSummary calendar={calendar??null}/>{canManage&&<fieldset disabled={locked} className="ditr-fields"><legend>Registrar conferência anual</legend><label className="team-field">Início do prazo conferido<input type="date" value={calendarDraft.starts_on} onChange={e=>setCalendarDraft(v=>({...v,starts_on:e.target.value}))}/></label><label className="team-field">Fim do prazo conferido<input type="date" value={calendarDraft.due_on} onChange={e=>setCalendarDraft(v=>({...v,due_on:e.target.value}))}/></label><label className="team-field ditr-wide">Fonte oficial (URL HTTPS)<input type="url" value={calendarDraft.source_url} onChange={e=>setCalendarDraft(v=>({...v,source_url:e.target.value}))} maxLength={1000} placeholder="https://www.gov.br/..."/></label><label className="team-field">Data da conferência<input type="date" value={calendarDraft.checked_on} max={new Date().toISOString().slice(0,10)} onChange={e=>setCalendarDraft(v=>({...v,checked_on:e.target.value}))}/></label><p className="team-hint">A pessoa autenticada fica registrada como responsável pela conferência. Confirme a norma deste exercício; o sistema não presume o prazo.</p></fieldset>}</>}
  {area==='cases'&&<div className="team-pagination"><button type="button" disabled={locked||page===1} onClick={()=>setPage(p=>p-1)}>Página anterior</button><span>Página {page} · {pagesTotal} {caseId?'evidências':'declarações'}</span><button type="button" disabled={locked||!data||page*5>=pagesTotal} onClick={()=>setPage(p=>p+1)}>Próxima página</button></div>}
  {area==='create'&&<div className="team-pagination"><button type="button" disabled={locked||page===1} onClick={()=>{setRequestId('');setPage(p=>p-1);}}>Atendimentos anteriores</button><span>Página {page} · {pagesTotal} atendimentos</span><button type="button" disabled={locked||!data||page*5>=pagesTotal} onClick={()=>{setRequestId('');setPage(p=>p+1);}}>Próximos atendimentos</button></div>}
  {canManage&&area!=='cases'&&<div className="ditr-save"><button type="button" className="primary-button" disabled={busy||!uncertain&&!valid} onClick={()=>void save()}>Salvar ITR/DITR</button>{!locked&&<button type="button" className="team-text-button" onClick={()=>navigate('cases')}>Cancelar edição</button>}</div>}
  {area==='cases'&&!caseId&&<CalendarSummary calendar={calendar??null}/>}
 </>;
}

function CalendarSummary({calendar}:{calendar:DitrCalendar|null}){
 return <section className="ditr-calendar" aria-label="Calendário conferido"><h4>Calendário anual</h4>{calendar?<><p>Período informado: {date(calendar.starts_on)} a {date(calendar.due_on)}.</p><p className="team-hint">Conferido em {date(calendar.checked_on)} por {calendar.responsible_name}.</p><a href={calendar.source_url} target="_blank" rel="noopener noreferrer">Consultar fonte oficial</a></>:<p>Nenhum prazo conferido para este exercício. Consulte a norma oficial antes de registrar o calendário.</p>}</section>;
}
