import {useEffect,useRef,useState} from 'react';
import {Link} from 'react-router-dom';
import type {DocumentIntakeView} from '../../../shared/modelCommercial';
import type {DocumentDetail} from '../../../shared/documents';
import {conferenceStatusLabels} from '../../../shared/smartDocument';
import type {RequestsError} from '../requests/api';
import {RequestsError as RequestError} from '../requests/api';
import {CommercialError} from './api';
import {modelApi} from './modelApi';
import {smartDocumentsApi,type SmartRequestContext} from '../smartDocuments/api';
import {paths} from '../../app/routes';

export function IntakeRequestItem({office,requestId,itemId,canCreate,disabled,onFailure}:{office:string;requestId:string;itemId:string;canCreate:boolean;disabled:boolean;onFailure:(e:RequestsError)=>void}){
 const [intake,setIntake]=useState<DocumentIntakeView|null>(),[ctx,setCtx]=useState<SmartRequestContext|null>(null),[doc,setDoc]=useState<DocumentDetail>(),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const key=useRef<string|null>(null),c=useRef<AbortController|null>(null),alive=useRef(true),flight=useRef(false);
 useEffect(()=>{
  alive.current=true;
  const controller=new AbortController();
  void Promise.allSettled([
   modelApi.intake(office,requestId,itemId,controller.signal),
   smartDocumentsApi.requestContext(office,requestId,itemId,controller.signal),
  ]).then(([intakeRes,ctxRes])=>{
   if(controller.signal.aborted)return;
   if(intakeRes.status==='fulfilled')setIntake(intakeRes.value);
   else{
    const e=intakeRes.reason;
    if(e instanceof CommercialError&&[401,403].includes(e.status))onFailure(new RequestError(e.status));
    else if(!(e instanceof CommercialError&&e.status===404))setError(e instanceof Error?e.message:'Não foi possível consultar a solicitação documental.');
   }
   if(ctxRes.status==='fulfilled')setCtx(ctxRes.value);
  });
  return()=>{alive.current=false;controller.abort();c.current?.abort();};
 },[office,requestId,itemId]);

 async function startConference(){
  if(flight.current||disabled||!canCreate)return;
  flight.current=true;setBusy(true);setError('');key.current??=crypto.randomUUID();
  const controller=new AbortController();c.current=controller;
  try{
   const useSmart=Boolean(ctx?.has_intake||ctx?.smart_session||ctx?.document_id);
   if(useSmart){
    const res=await smartDocumentsApi.conferenceStart(office,requestId,itemId,[],key.current,controller.signal);
    if(alive.current&&!controller.signal.aborted){setDoc(res.document);setCtx(res.context);key.current=null;}
   }else{
    const v=await modelApi.start(office,requestId,itemId,[],key.current,controller.signal);
    if(alive.current&&!controller.signal.aborted){setDoc(v);key.current=null;}
   }
  }catch(e){
   if(alive.current&&!controller.signal.aborted){
    setError(e instanceof Error?e.message:'Não foi possível abrir o documento para conferência.');
    if(e instanceof CommercialError&&e.status!==503)key.current=null;
    if(e instanceof CommercialError&&[401,403].includes(e.status))onFailure(new RequestError(e.status));
   }
  }finally{flight.current=false;if(alive.current)setBusy(false);}
 }

 if(intake===null&&!ctx&&!error)return null;
 const existingDocId=doc?.id??ctx?.document_id??null;
 const hasPriorData=Boolean(ctx?.has_intake||ctx?.smart_session||intake);
 const conferenceStatus=ctx?.smart_session?.conference_status??(existingDocId?'em_conferencia':'nao_iniciada');
 const pendingCount=ctx?.smart_session?.pending_fields?.length??0;

 return (
  <section className="service-section">
   <h2>{ctx?.intake?.model_name??intake?.model_name??'Solicitação documental'}</h2>
   {(intake||ctx)&&(
    <p>
     Modelo e preço preservados na contratação.{' '}
     {hasPriorData
      ? `Conferência: ${conferenceStatusLabels[conferenceStatus]}${pendingCount>0?` · ${pendingCount} pendência(s) sinalizada(s)`:''}.`
      : 'O editor apresentará os campos do modelo selecionado.'}
    </p>
   )}
   {ctx?.courtesies&&ctx.courtesies.length>0&&(
    <p className="customer-note">Cortesia autorizada registrada: {ctx.courtesies[0].reason} (sem lançamento fictício de caixa).</p>
   )}
   {error&&<p role="alert" className="form-feedback error">{error}</p>}
   {existingDocId?(
    <Link className="primary-button" to={paths.documents} state={{office_id:office,document_id:existingDocId}}>
     Conferir documento contratado
    </Link>
   ):(intake||ctx)&&canCreate&&(
    <button className="primary-button" disabled={disabled||busy} onClick={()=>void startConference()}>
     {hasPriorData?'Conferir documento contratado':'Criar documento contratado'}
    </button>
   )}
  </section>
 );
}
